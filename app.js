// ═══════════════════════════════════════════════════════════════════════════
//  ShopEasy — app.js
//  Complete frontend logic
//
//  HOW THE FRONTEND CONNECTS TO THE BACKEND:
//  ─────────────────────────────────────────
//  Every API call uses fetch() to hit Express routes on the same server.
//  Example:  fetch('/api/products')
//            → Express handles GET /api/products
//            → Mongoose queries MongoDB
//            → Returns JSON → we render it here
//
//  For protected routes we attach the JWT in the Authorization header:
//  headers: { 'Authorization': 'Bearer ' + token }
// ═══════════════════════════════════════════════════════════════════════════

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const API = ''; // Empty string = same origin (server serves frontend too)
                // If running frontend separately, set this to 'http://localhost:5000'

// ─── STATE ───────────────────────────────────────────────────────────────────
let cart = [];
let allProducts = []; // cached product list for filtering

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// Get stored JWT token
function getToken() { return localStorage.getItem('shopeasy_token'); }

// Get stored user object
function getUser()  { return JSON.parse(localStorage.getItem('shopeasy_user') || 'null'); }

// Standard fetch headers (always JSON, optionally with auth token)
function headers(auth = false) {
  const h = { 'Content-Type': 'application/json' };
  if (auth) h['Authorization'] = 'Bearer ' + getToken();
  return h;
}

// Show a toast notification
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => { el.className = 'toast'; }, 3000);
}

// Switch visible page (SPA navigation)
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  window.scrollTo(0, 0);

  // Load data when navigating to certain pages
  if (name === 'products') loadProducts();
  if (name === 'profile') loadProfile();
  if (name === 'cart') {
  loadCart().then(() => renderCart());
}
  if (name === 'checkout') renderCheckoutSummary();
  if (name === 'orders')   loadOrders();
  if (name === 'admin')    loadAdminData();
}

// Format price as Indian Rupees
function rupees(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0 });
}

// ─── NAVBAR SETUP ─────────────────────────────────────────────────────────────
// Called on page load to update UI based on login state
function setupNavbar() {
  const user = getUser();
  const isLoggedIn = !!getToken();

  document.getElementById('guestButtons').style.display = isLoggedIn ? 'none'  : 'flex';
  document.getElementById('userBar').style.display      = isLoggedIn ? 'flex'  : 'none';
  document.getElementById('cartBtn').style.display      = isLoggedIn ? 'flex'  : 'none';
  document.getElementById('navOrders').style.display    = isLoggedIn ? 'inline': 'none';
  document.getElementById('navProfile').style.display =
  isLoggedIn ? 'inline' : 'none';
  document.getElementById('navAdmin').style.display     = (isLoggedIn && user?.role === 'admin') ? 'inline' : 'none';

  if (user) {
    document.getElementById('userGreeting').textContent = 'Hi, ' + user.name.split(' ')[0] + ' 👋';
  }
  updateCartCount();
}

// ═══════════════════════════════════════════════════════════════════════════
//  AUTH — Login, Register, Logout
// ═══════════════════════════════════════════════════════════════════════════

async function register() {
  const name     = document.getElementById('regName').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const role =  'user';

  if (!name || !email || !password) return toast('All fields required.', 'error');

  try {
    // POST /api/auth/register
    const res  = await fetch(API + '/api/auth/register', {
      method: 'POST', headers: headers(), body: JSON.stringify({ name, email, password,role }),
    });
    const data = await res.json();

    if (!res.ok) return toast(data.message, 'error');
    toast('Account created! Please login. 🎉');
    showPage('login');
  } catch {
    toast('Network error. Is the server running?', 'error');
  }
}

async function login() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) return toast('Enter email and password.', 'error');

  try {
    // POST /api/auth/login
    const res  = await fetch(API + '/api/auth/login', {
      method: 'POST', headers: headers(), body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) return toast(data.message, 'error');

    // Save JWT token and user info in localStorage
    localStorage.setItem('shopeasy_token', data.token);
    localStorage.setItem('shopeasy_user',  JSON.stringify(data.user));

    toast('Welcome back, ' + data.user.name.split(' ')[0] + '! 👋');
    await loadCart();

    setupNavbar();
    showPage('products');
  } catch {
    toast('Network error. Is the server running?', 'error');
  }
}

function logout() {
  // Clear all auth data
  localStorage.removeItem('shopeasy_token');
  localStorage.removeItem('shopeasy_user');
  
  cart = [];
  setupNavbar();
  showPage('home');
  toast('Logged out successfully.');
}

// ═══════════════════════════════════════════════════════════════════════════
//  PRODUCTS — Fetch, Render, Filter
// ═══════════════════════════════════════════════════════════════════════════

async function loadProducts() {
  document.getElementById('productGrid').innerHTML = '<div class="loading">Loading products…</div>';

  try {
    // GET /api/products — no auth needed (public)
    const res      = await fetch(API + '/api/products');
    allProducts    = await res.json();

    renderProductGrid(allProducts);
  } catch {
    document.getElementById('productGrid').innerHTML =
      '<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Couldn\'t load products</h3><p>Is the server running?</p></div>';
  }
}

function renderProductGrid(products) {
  const grid = document.getElementById('productGrid');
  if (products.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><h3>No products found</h3><p>Try a different search.</p></div>';
    return;
  }

  grid.innerHTML = products.map(p => {
    const stockClass = p.stock > 5 ? 'in-stock' : p.stock > 0 ? 'low-stock' : 'no-stock';
    const stockLabel = p.stock > 5 ? 'In Stock' : p.stock > 0 ? `Only ${p.stock} left` : 'Out of Stock';
    const imgHtml = p.imageUrl
      ? `<img class="product-img" src="${p.imageUrl}" alt="${p.name}" onerror="this.parentNode.innerHTML='<div class=\\'product-img-placeholder\\'>📦</div>'" />`
      : `<div class="product-img-placeholder">📦</div>`;

    return `
      <div class="product-card">
        ${imgHtml}
        <div class="product-body">
          <div class="product-cat">${p.category || 'General'}</div>
          <div class="product-name">${p.name}</div>
          <div class="product-desc">${p.description}</div>
          <div class="product-footer">
            <span class="product-price">${rupees(p.price)}</span>
            <span class="stock-badge ${stockClass}">${stockLabel}</span>
          </div>
          <button class="add-cart-btn" ${p.stock === 0 ? 'disabled' : ''} onclick='addToCart(${JSON.stringify(p)})'>
            ${p.stock === 0 ? 'Out of Stock' : '+ Add to Cart'}
          </button>
        </div>
      </div>`;
  }).join('');
}

// Client-side search filter
function filterProducts() {

  const q = document.getElementById('searchInput')
  .value.toLowerCase();

  const category =
  document.getElementById('categoryFilter').value;

  const filtered = allProducts.filter(p => {

    const matchesSearch =
  p.name.toLowerCase().includes(q) ||
  p.description.toLowerCase().includes(q) ||
  p.category.toLowerCase().includes(q);

    const matchesCategory =
      !category || p.category === category;

    return matchesSearch && matchesCategory;
  });

  renderProductGrid(filtered);
}

// ═══════════════════════════════════════════════════════════════════════════
//  CART — localStorage-based cart
// ═══════════════════════════════════════════════════════════════════════════



function updateCartCount() {
  const total = cart.reduce((sum, i) => sum + i.qty, 0);
  document.getElementById('cartCount').textContent = total;
}

async function addToCart(product) {

  if (!getToken()) {
    toast('Please login first', 'error');
    return;
  }

  const res = await fetch('/api/cart/add', {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({
      productId: product._id
    })
  });

  const data = await res.json();

  toast(data.message);

  loadCart();
}
async function loadCart() {

  const res = await fetch('/api/cart', {
    headers: headers(true)
  });

  const data = await res.json();

  cart = data.map(item => ({
    ...item.productId,
    qty: item.quantity
  }));

  updateCartCount();
}

function changeQty(id, delta) {

  const item = cart.find(i => i._id === id);

  if (!item) return;

  if (delta > 0 && item.qty >= item.stock) {
    toast(`Only ${item.stock} items available`, 'error');
    return;
  }

  item.qty += delta;

  if (item.qty <= 0) {
    cart = cart.filter(i => i._id !== id);
  }

  renderCart();
}

async function removeFromCart(id) {

  await fetch('/api/cart/' + id, {
    method: 'DELETE',
    headers: headers(true)
  });

  await loadCart();   // important
  renderCart();
}

function cartTotal() {
  return cart.reduce((sum, i) => sum + i.price * i.qty, 0);
}

function renderCart() {
  const itemsEl   = document.getElementById('cartItems');
  const summaryEl = document.getElementById('cartSummary');

  if (cart.length === 0) {
    itemsEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🛒</div>
        <h3>Your cart is empty</h3>
        <p>Add some products to get started!</p>
        <button class="btn-solid" style="margin-top:20px" onclick="showPage('products')">Browse Products</button>
      </div>`;
    summaryEl.innerHTML = '';
    return;
  }

  itemsEl.innerHTML = cart.map(item => `
    <div class="cart-item">
      ${item.imageUrl
        ? `<img class="cart-item-img" src="${item.imageUrl}" alt="${item.name}" onerror="this.style.display='none'" />`
        : `<div class="cart-item-img" style="display:flex;align-items:center;justify-content:center;font-size:2rem;">📦</div>`}
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${rupees(item.price)} each</div>
        <div class="qty-controls">
          <button class="qty-btn" onclick="changeQty('${item._id}', -1)">−</button>
          <span class="qty-val">${item.qty}</span>
          <button class="qty-btn" onclick="changeQty('${item._id}', 1)">+</button>
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:800;font-size:.95rem;color:var(--indigo);margin-bottom:8px">${rupees(item.price * item.qty)}</div>
        <button class="remove-btn" onclick="removeFromCart('${item._id}')">🗑️</button>
      </div>
    </div>
  `).join('');

  const total = cartTotal();
  const shipping = total > 500 ? 0 : 49;
  summaryEl.innerHTML = `
    <h3>Order Summary</h3>
    <div class="summary-row"><span>Subtotal (${cart.length} item${cart.length > 1 ? 's' : ''})</span><span>${rupees(total)}</span></div>
    <div class="summary-row"><span>Shipping</span><span>${shipping === 0 ? '<span style="color:var(--green)">FREE</span>' : rupees(shipping)}</span></div>
    <div class="summary-total"><span>Total</span><span>${rupees(total + shipping)}</span></div>
    <button class="btn-solid btn-block" style="margin-top:20px" onclick="showPage('checkout')">Proceed to Checkout</button>
    <button class="btn-ghost btn-block" style="margin-top:10px" onclick="showPage('products')">Continue Shopping</button>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECKOUT — Place order via API
// ═══════════════════════════════════════════════════════════════════════════

function renderCheckoutSummary() {
  const el = document.getElementById('checkoutSummary');
  const total = cartTotal();
  el.innerHTML = `
    ${cart.map(i => `
      <div class="summary-box-row">
        <span>${i.name} × ${i.qty}</span>
        <span>${rupees(i.price * i.qty)}</span>
      </div>`).join('')}
    <div class="summary-box-total"><span>Total</span><span>${rupees(total)}</span></div>
  `;
}

async function placeOrder() {
  const address = document.getElementById('shippingAddress').value.trim();
  if (!address) return toast('Please enter a delivery address.', 'error');
  if (cart.length === 0) return toast('Your cart is empty.', 'error');

  const orderPayload = {
    items: cart.map(i => ({
      productId: i._id,
      name:      i.name,
      price:     i.price,
      quantity:  i.qty,
    })),
    totalAmount:     cartTotal(),
    shippingAddress: address,
  };

  try {
    // POST /api/orders — requires auth token
    const res  = await fetch(API + '/api/orders', {
      method: 'POST',
      headers: headers(true), // true = include JWT
      body: JSON.stringify(orderPayload),
    });
    const data = await res.json();

    if (!res.ok) return toast(data.message, 'error');

    // Clear cart after successful order
    cart = [];
    updateCartCount();
    toast('Order placed! 🎉 Thank you for shopping.');
    showPage('orders');
  } catch {
    toast('Failed to place order. Try again.', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MY ORDERS — Load and render user's orders
// ═══════════════════════════════════════════════════════════════════════════

async function loadOrders() {
  if (!getToken()) { showPage('login'); return; }
  document.getElementById('ordersList').innerHTML = '<div class="loading">Loading orders…</div>';

  try {
    // GET /api/orders — returns own orders for user, all orders for admin
    const res    = await fetch(API + '/api/orders', { headers: headers(true) });
    const orders = await res.json();

    if (!res.ok) return toast(orders.message, 'error');

    const el = document.getElementById('ordersList');
    if (orders.length === 0) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><h3>No orders yet</h3><p>Place your first order!</p></div>`;
      return;
    }

    el.innerHTML = orders.map(o => `
      <div class="order-card">
        <div class="order-header">
          <div>
            <div class="order-id">Order #${o._id.slice(-8).toUpperCase()}</div>
            <div class="order-date">${new Date(o.createdAt).toLocaleDateString('en-IN', { day:'numeric',month:'short',year:'numeric' })}</div>
          </div>
          <span class="status-badge status-${o.status}">${o.status}</span>
        </div>
        <div class="order-body">
          <div class="order-items-list">
            ${o.items.map(i => `${i.name} × ${i.quantity} = ${rupees(i.price * i.quantity)}`).join('<br/>')}
          </div>
          ${o.shippingAddress ? `<div style="font-size:.82rem;color:var(--muted);margin-bottom:8px">📍 ${o.shippingAddress}</div>` : ''}
          <div class="order-total">Total: ${rupees(o.totalAmount)}</div>
          ${o.status === 'pending' ? `
<button class="btn-danger btn-sm"
onclick="cancelOrder('${o._id}')">
Cancel Order
</button>
` : ''}
        </div>
      </div>
    `).join('');
  } catch {
    toast('Failed to load orders.', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN PANEL — Products & Orders management
// ═══════════════════════════════════════════════════════════════════════════

function switchTab(tab) {
  document.getElementById('tabProducts').style.display = tab === 'products' ? 'block' : 'none';
  document.getElementById('tabOrders').style.display   = tab === 'orders'   ? 'block' : 'none';
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');

  if (tab === 'orders') loadAdminOrders();
}
async function loadDashboardStats() {


  const productsRes = await fetch('/api/products');
  const products = await productsRes.json();

  const ordersRes = await fetch('/api/orders', {
    headers: headers(true)

    
  });
  console.log(localStorage.getItem('token'));
  const statsRes = await fetch('/api/admin/stats', {
  headers: headers(true)
});

const stats = await statsRes.json();
  const orders = await ordersRes.json();
  document.getElementById('totalUsers').textContent =
stats.totalUsers;

  document.getElementById('totalProducts').textContent =
    products.length;

  const activeOrders = orders.filter(
  order => order.status !== 'cancelled'
);

document.getElementById('totalOrders').textContent =
  activeOrders.length;

  const revenue = orders
  .filter(order => order.status !== 'cancelled')
  .reduce((sum, order) => sum + order.totalAmount, 0);

  document.getElementById('totalRevenue').textContent =
    '₹' + revenue;
}

async function loadAdminData() {
if (getUser()?.role !== 'admin') {
showPage('home');
return;
}

loadDashboardStats();
loadAdminProducts();
}

// ── Admin: Products ──────────────────────────────────────────────────────────

async function loadAdminProducts() {

  console.log("Admin Products Loading");

  const res = await fetch(API + '/api/products');
  console.log("Response:", res);

  const products = await res.json();
  console.log("Products:", products);

  const el = document.getElementById('adminProductList');

  if (products.length === 0) {
    el.innerHTML = '<div class="empty-state"><p>No products yet. Add one above!</p></div>';
    return;
  }

  el.innerHTML = products.map(p => `
    <div class="admin-product-row">
      ${p.imageUrl
        ? `<img class="admin-product-thumb" src="${p.imageUrl}" alt="${p.name}" onerror="this.style.display='none'" />`
        : `<div class="admin-product-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.8rem;background:#f1f5f9;">📦</div>`}
      <div class="admin-product-info">
        <h4>${p.name}</h4>
        <p>
${rupees(p.price)} ·
Stock: ${p.stock}
${p.stock <= 5 ? ' ⚠️ Low Stock' : ''}
· ${p.category}
</p>
      </div>
      <div class="admin-product-actions">
        <button class="btn-solid btn-sm" onclick='openEditModal(${JSON.stringify(p)})'>Edit</button>
        <button class="btn-danger btn-sm" onclick="deleteProduct('${p._id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

async function addProduct() {
  const body = {
    name:        document.getElementById('pName').value.trim(),
    price:       parseFloat(document.getElementById('pPrice').value),
    category:    document.getElementById('pCategory').value.trim() || 'General',
    stock:       parseInt(document.getElementById('pStock').value) || 0,
    imageUrl:    document.getElementById('pImage').value.trim(),
    description: document.getElementById('pDesc').value.trim(),
  };
 

  if (!body.name || !body.price || !body.description || !body.imageUrl) {
    return toast('Name, price, description and image URL are required.', 'error');
  }

  try {
    // POST /api/products — admin only (server checks JWT + role)
    const res  = await fetch(API + '/api/products', {
      method: 'POST', headers: headers(true), body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) return toast(data.message, 'error');
    toast('Product added! ✅');
    // Clear form fields
    ['pName','pPrice','pCategory','pStock','pImage','pDesc'].forEach(id => document.getElementById(id).value = '');
    loadAdminProducts();
  } catch {
    toast('Failed to add product.', 'error');
  }
}

async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;

  try {
    // DELETE /api/products/:id — admin only
    const res = await fetch(API + '/api/products/' + id, {
      method: 'DELETE', headers: headers(true),
    });
    if (!res.ok) { const d = await res.json(); return toast(d.message, 'error'); }
    toast('Product deleted.');
    loadAdminProducts();
    loadProducts(); // refresh public list too
  } catch {
    toast('Failed to delete product.', 'error');
  }
}

// ── Edit Modal ───────────────────────────────────────────────────────────────
// We create a modal dynamically and inject it into the DOM

function openEditModal(product) {
  // Remove old modal if exists
  document.getElementById('editModal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'editModal';
  modal.className = 'modal-overlay open';
  modal.innerHTML = `
    <div class="modal">
      <h3>Edit Product</h3>
      <div class="form-row">
        <div class="fg"><label>Name</label><input id="eName" value="${product.name}" /></div>
        <div class="fg"><label>Price</label><input id="ePrice" type="number" value="${product.price}" /></div>
      </div>
      <div class="form-row">
        <div class="fg"><label>Category</label><input id="eCategory" value="${product.category || ''}" /></div>
        <div class="fg"><label>Stock</label><input id="eStock" type="number" value="${product.stock}" /></div>
      </div>
      <div class="fg"><label>Image URL</label><input id="eImage" value="${product.imageUrl}" /></div>
      <div class="fg"><label>Description</label><textarea id="eDesc" rows="2">${product.description}</textarea></div>
      <div class="modal-actions">
        <button class="btn-ghost" onclick="document.getElementById('editModal').remove()">Cancel</button>
        <button class="btn-solid" onclick="saveProduct('${product._id}')">Save Changes</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function saveProduct(id) {
  const body = {
    name:        document.getElementById('eName').value.trim(),
    price:       parseFloat(document.getElementById('ePrice').value),
    category:    document.getElementById('eCategory').value.trim(),
    stock:       parseInt(document.getElementById('eStock').value),
    imageUrl:    document.getElementById('eImage').value.trim(),
    description: document.getElementById('eDesc').value.trim(),
  };

  try {
    // PUT /api/products/:id — admin only
    const res  = await fetch(API + '/api/products/' + id, {
      method: 'PUT', headers: headers(true), body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return toast(data.message, 'error');
    toast('Product updated! ✅');
    document.getElementById('editModal').remove();
    loadAdminProducts();
    loadProducts();
  } catch {
    toast('Failed to update product.', 'error');
  }
}

// ── Admin: Orders ────────────────────────────────────────────────────────────

async function loadAdminOrders() {
  const el = document.getElementById('adminOrderList');
  el.innerHTML = '<div class="loading">Loading orders…</div>';

  try {
    // GET /api/orders — admin gets ALL orders with user info
    const res    = await fetch(API + '/api/orders', { headers: headers(true) });
    const orders = await res.json();

    if (!orders.length) {
      el.innerHTML = '<div class="empty-state"><p>No orders yet.</p></div>';
      return;
    }

    el.innerHTML = orders.map(o => {
      const user = o.userId;
      return `
        <div class="order-card">
          <div class="order-header">
            <div>
              <div class="order-id">Order #${o._id.slice(-8).toUpperCase()} · ${user?.name || 'Unknown'} (${user?.email || ''})</div>
              <div class="order-date">${new Date(o.createdAt).toLocaleDateString('en-IN', { day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit' })}</div>
            </div>
            <span class="status-badge status-${o.status}">${o.status}</span>
          </div>
          <div class="order-body">
            <div class="order-items-list">
              ${o.items.map(i => `${i.name} × ${i.quantity}`).join(', ')}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
              <div class="order-total">Total: ${rupees(o.totalAmount)}</div>
              <div style="display:flex;align-items:center;gap:10px">
                <select class="status-select" id="status-${o._id}">
                  ${['pending','shipped','delivered','cancelled'].map(s =>
                    `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`
                  ).join('')}
                </select>
                <button class="btn-solid btn-sm" onclick="updateOrderStatus('${o._id}')">Update</button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');
  } catch {
    toast('Failed to load orders.', 'error');
  }
}

async function updateOrderStatus(orderId) {
  const status = document.getElementById('status-' + orderId).value;

  try {
    // PUT /api/orders/:id — admin only
    const res  = await fetch(API + '/api/orders/' + orderId, {
      method: 'PUT', headers: headers(true), body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) return toast(data.message, 'error');
    toast(`Status updated to "${status}" ✅`);
    loadAdminOrders();
  } catch {
    toast('Failed to update status.', 'error');
  }
}
async function cancelOrder(orderId) {

  if (!confirm('Are you sure you want to cancel this order?'))
    return;

  try {

    const res = await fetch(API + '/api/orders/' + orderId, {
      method: 'PUT',
      headers: headers(true),
      body: JSON.stringify({ status: 'cancelled' })
    });

    const data = await res.json();

    if (!res.ok)
      return toast(data.message, 'error');

    toast('Order cancelled successfully');
    loadOrders();

  } catch {
    toast('Failed to cancel order', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  INIT — Run on page load
// ═══════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  setupNavbar();    // Set up nav based on login state
  if (getToken()) {
  loadCart();
}



  document.getElementById('categoryFilter')
.addEventListener('change', filterProducts);
});
async function updateOrderCount() {

const res = await fetch(
 '/api/orders',
 {
   headers: headers(true)
 });

const orders = await res.json();

document.getElementById(
 'orderCount'
).textContent = orders.filter(
 o => o.status !== 'cancelled'
).length;

}
function loadProfile() {

  const user = getUser();

  document.getElementById('profileName')
    .textContent = user.name;

  document.getElementById('profileEmail')
    .textContent = user.email;

  document.getElementById('profileRole')
    .textContent = user.role;
}
async function changePassword() {

const oldPassword =
document.getElementById(
'oldPassword'
).value;

const newPassword =
document.getElementById(
'newPassword'
).value;

const res =
await fetch(
'/api/change-password',
{
method:'PUT',
headers: headers(true),
body: JSON.stringify({
oldPassword,
newPassword
})
}
);

const data =
await res.json();

if (!res.ok)
return toast(
data.message,
'error'
);

toast(
'Password changed successfully'
);

document.getElementById(
'oldPassword'
).value = '';

document.getElementById(
'newPassword'
).value = '';
}