// ╔══════════════════════════════════════════════════════════════════════════╗
// ║   ShopEasy — server.js                                                  ║
// ║   THE COMPLETE BACKEND FILE                                              ║
// ║                                                                          ║
// ║   HOW EVERYTHING CONNECTS (read this first!):                           ║
// ║                                                                          ║
// ║   Browser (index.html / app.js)                                         ║
// ║       │  HTTP requests (fetch/axios)                                     ║
// ║       ▼                                                                  ║
// ║   Express Server (this file, port 5000)                                 ║
// ║       │  mongoose.connect() opens ONE connection                        ║
// ║       ▼                                                                  ║
// ║   MongoDB Atlas (cloud database)                                         ║
// ║       │  stores documents in collections: users, products, orders        ║
// ║       ▼                                                                  ║
// ║   Mongoose Models (User, Product, Order)                                ║
// ║       └─ used inside route handlers to read/write data                  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — IMPORT PACKAGES
// Every package here was installed via: npm install
// ─────────────────────────────────────────────────────────────────────────────
const express  = require('express');   // Web framework — handles routes & requests
const mongoose = require('mongoose');  // ODM — connects JS objects ↔ MongoDB docs
const bcrypt   = require('bcryptjs'); // Hashes passwords so we never store plain text
const jwt      = require('jsonwebtoken'); // Creates signed tokens for login sessions
const cors     = require('cors');     // Allows frontend (port 3000) to call backend (port 5000)
const helmet = require('helmet');
const path     = require('path');     // Node built-in — handles file paths
require('dotenv').config();           // Reads .env file → puts values in process.env

const app = express(); // Create the Express application

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — MIDDLEWARE (functions that run on EVERY request before the route handler)
// ─────────────────────────────────────────────────────────────────────────────
app.use(cors());
// app.use(helmet());
app.use(express.json());       // Parse incoming JSON request bodies → req.body
app.use(express.static(__dirname)); // Serve static files (index.html, style.css, app.js)

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — DATABASE CONNECTION
//
// mongoose.connect() does ONE thing: opens a persistent TCP connection to MongoDB.
// After this line succeeds, ALL Mongoose models automatically use this connection.
// You call this ONCE at startup — not inside every route.
//
// process.env.MONGO_URI → comes from your .env file via dotenv above
// ─────────────────────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅  MongoDB connected');
  })
  .catch((err) => {
    // If DB fails to connect, there's no point running the server
    console.error('❌  MongoDB connection error:', err.message);
    process.exit(1); // Exit with error code
  });

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — MONGOOSE SCHEMAS & MODELS
//
// Schema  = Blueprint describing the shape of ONE document (like a table row)
// Model   = The JS class that lets you CREATE, READ, UPDATE, DELETE documents
//
// mongoose.model('User', userSchema) → creates a collection called "users"
//   (Mongoose auto-lowercases and pluralizes the name)
// ─────────────────────────────────────────────────────────────────────────────

// ── 4a. USER MODEL ────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    email:    { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true }, // stored as bcrypt hash, never plain text
    role:     { type: String, enum: ['user', 'admin'], default: 'user' },
  },
  { timestamps: true } // automatically adds createdAt and updatedAt fields
);
const User = mongoose.model('User', userSchema); // → "users" collection in MongoDB

// ── 4b. PRODUCT MODEL ─────────────────────────────────────────────────────────
const productSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    price:       { type: Number, required: true, min: 0 },
    description: { type: String, required: true },
    imageUrl:    { type: String, required: true },
    stock:       { type: Number, required: true, min: 0, default: 0 },
    category:    { type: String, default: 'General' },
  },
  { timestamps: true }
);
const Product = mongoose.model('Product', productSchema); // → "products" collection

// ── 4c. ORDER MODEL ───────────────────────────────────────────────────────────
const orderSchema = new mongoose.Schema(
  {
    // ObjectId references: like a foreign key in SQL
    // This stores the _id of the user who placed the order
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',   // "ref" enables .populate() — JOIN-like behaviour
      required: true,
    },
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name:      String,
        price:     Number,
        quantity:  { type: Number, default: 1 },
      },
    ],
    totalAmount:     { type: Number, required: true },
    status:          { type: String, enum: ['pending','shipped','delivered','cancelled'], default: 'pending' },
    shippingAddress: { type: String, default: '' },
  },
  { timestamps: true }
);
const Order = mongoose.model('Order', orderSchema); // → "orders" collection
const cartSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    quantity: {
      type: Number,
      default: 1
    }
  }]
});

const Cart = mongoose.model('Cart', cartSchema);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — AUTH MIDDLEWARE
//
// This is a function that runs BEFORE protected route handlers.
// It checks the JWT token in the Authorization header.
//
// Flow:
//   Client sends:  Authorization: Bearer <token>
//   Middleware:    verifies token → extracts payload → attaches to req.user
//   Route handler: reads req.user.id, req.user.role etc.
// ─────────────────────────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization']; // "Bearer eyJhbGci..."
  const token = authHeader && authHeader.split(' ')[1]; // extract just the token part

  if (!token) {
    return res.status(401).json({ message: 'No token — please log in.' });
  }

  try {
    // jwt.verify() checks the signature AND expiry
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, role, name } — available in all route handlers below
    next(); // ← move on to the actual route handler
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }
}

// Admin-only guard — always use AFTER authMiddleware
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admins only.' });
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6 — AUTH ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/auth/register
// Receives: { name, email, password }
// Does: hash password → save user → return success
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    // Check duplicate email
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: 'Email already registered.' });

    // bcrypt.hash(plainText, saltRounds)
    // saltRounds=10 → takes ~100ms — good balance of security vs speed
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email,
      password: hashedPassword,
      // Only allow admin role if explicitly passed (for seeding purposes)
      role: 'user'
    
    });
    await user.save(); // INSERT document into MongoDB "users" collection

    res.status(201).json({ message: 'Account created! Please login.' });
  } catch (err) {
    res.status(500).json({ message: 'Registration failed.', error: err.message });
  }
});

// POST /api/auth/login
// Receives: { email, password }
// Does: find user → compare password → sign JWT → return token + user info
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    // Find user by email (MongoDB query)
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid email or password.' });

    // bcrypt.compare() hashes the input and compares with stored hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid email or password.' });

    // Create JWT token
    // Payload: data we want to store in the token (not sensitive info)
    // Secret:  same key used later in authMiddleware to verify
    // Options: token expires in 7 days
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ message: 'Login failed.', error: err.message });
  }
});
app.put(
'/api/change-password',
authMiddleware,
async (req, res) => {

try {

const {
oldPassword,
newPassword
} = req.body;

const user =
await User.findById(
req.user.id
);

const match =
await bcrypt.compare(
oldPassword,
user.password
);

if (!match) {
return res.status(400).json({
message: 'Old password incorrect'
});
}

user.password =
await bcrypt.hash(
newPassword,
10
);

await user.save();

res.json({
message:
'Password updated successfully'
});

} catch (err) {

res.status(500).json({
message: err.message
});

}

});
// ─────────────────────────────────────────────────────────────────────────────
// STEP 7 — PRODUCT ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/products — Public: anyone can browse products
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 }); // newest first
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch products.', error: err.message });
  }
});


// POST /api/products — Admin only: add a new product
// authMiddleware runs first (checks token), adminOnly runs second (checks role)
app.post('/api/products', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, price, description, imageUrl, stock, category } = req.body;
    if (!imageUrl.startsWith('http')) {
  return res.status(400).json({
    message: 'Invalid image URL'
  });
}
    if (!name || !price || !description || !imageUrl) {
      return res.status(400).json({ message: 'Name, price, description and imageUrl are required.' });
    }
    const product = new Product({ name, price, description, imageUrl, stock: stock || 0, category });
    await product.save();
    res.status(201).json({ message: 'Product added!', product });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add product.', error: err.message });
  }
});

// PUT /api/products/:id — Admin only: update a product
// :id is a URL parameter → available as req.params.id
app.put('/api/products/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    if (req.body.stock < 0) {
  return res.status(400).json({
    message: 'Stock cannot be negative'
  });
}
    const product = await Product.findByIdAndUpdate(
      req.params.id,  // MongoDB _id
      req.body,       // fields to update
      { new: true, runValidators: true } // new:true → return updated doc
    );
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    res.json({ message: 'Product updated!', product });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update product.', error: err.message });
  }
});

// DELETE /api/products/:id — Admin only
app.delete('/api/products/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const existingOrder = await Order.findOne({
  'items.productId': req.params.id
});

if (existingOrder) {
  return res.status(400).json({
    message: 'Cannot delete ordered product'
  });
}
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    res.json({ message: 'Product deleted!' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete product.', error: err.message });
  }
});
app.put('/api/cart/:productId', authMiddleware, async (req, res) => {

  const { quantity } = req.body;

  const cart = await Cart.findOne({
    userId: req.user.id
  });

  if (!cart)
    return res.status(404).json({
      message: 'Cart not found'
    });

  const item = cart.items.find(
    i => i.productId.toString() === req.params.productId
  );

  if (!item)
    return res.status(404).json({
      message: 'Item not found'
    });

  item.quantity = quantity;

  if (item.quantity <= 0) {
    cart.items = cart.items.filter(
      i => i.productId.toString() !== req.params.productId
    );
  }

  await cart.save();

  res.json({
    message: 'Cart updated'
  });

});
app.post('/api/cart/add', authMiddleware, async (req, res) => {
  try {
    const { productId } = req.body;

    let cart = await Cart.findOne({ userId: req.user.id });

    if (!cart) {
      cart = new Cart({
        userId: req.user.id,
        items: []
      });
    }

    const item = cart.items.find(
      i => i.productId.toString() === productId
    );
    const product =
await Product.findById(productId);

if (
  item &&
  item.quantity >= product.stock
) {
  return res.status(400).json({
    message:
    `Only ${product.stock} items available`
  });
}

    if (item) {
      item.quantity += 1;
    } else {
      cart.items.push({
        productId,
        quantity: 1
      });
    }

    await cart.save();

    res.json({
      message: 'Added to cart'
    });

  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
});
app.get('/api/cart', authMiddleware, async (req, res) => {

  const cart = await Cart.findOne({
    userId: req.user.id
  }).populate('items.productId');

  if (!cart)
    return res.json([]);

  res.json(cart.items);
});
app.delete('/api/cart/:productId', authMiddleware, async (req, res) => {

  const cart = await Cart.findOne({
    userId: req.user.id
  });

  if (!cart)
    return res.json([]);

  cart.items = cart.items.filter(
    item =>
      item.productId.toString() !== req.params.productId
  );

  await cart.save();

  res.json({
    message: 'Removed'
  });
});
// ADMIN DASHBOARD STATS
app.get('/api/admin/stats', authMiddleware, adminOnly, async (req, res) => {
  try {

  const totalUsers = await User.countDocuments({
  role: 'user'
});

  const totalProducts = await Product.countDocuments();

  const orders = await Order.find({
    status: { $ne: 'cancelled' }
  });

  const totalOrders = orders.length;

  const totalRevenue = orders.reduce(
    (sum, order) => sum + order.totalAmount,
    0
  );

  res.json({
    totalUsers,
    totalProducts,
    totalOrders,
    totalRevenue
  });

} catch (err) {
  res.status(500).json({
    message: err.message
  });
}
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 8 — ORDER ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/orders — Logged-in user: place an order
app.post('/api/orders', authMiddleware, async (req, res) => {
  try {
    const { items, totalAmount, shippingAddress } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty.' });
    }
    for (const item of items) {

  const product = await Product.findById(item.productId);

  if (!product) {
    return res.status(404).json({
      message: `${item.name} not found`
    });
  }

  if (item.quantity > product.stock) {
    return res.status(400).json({
      message: `Only ${product.stock} ${product.name} available in stock`
    });
  }

}

    const order = new Order({
      userId: req.user.id, // comes from JWT payload via authMiddleware
      items,
      totalAmount,
      shippingAddress,
      status: 'pending',
    });
    for (const item of items) {

  await Product.findByIdAndUpdate(
    item.productId,
    {
      $inc: {
        stock: -item.quantity
      }
    }
  );

}
    await order.save();
    const cart = await Cart.findOne({
  userId: req.user.id
});

if (cart) {
  cart.items = [];
  await cart.save();
}
    res.status(201).json({ message: 'Order placed successfully!', order });
  } catch (err) {
    res.status(500).json({ message: 'Failed to place order.', error: err.message });
  }
});

// GET /api/orders — User: their own orders | Admin: all orders
app.get('/api/orders', authMiddleware, async (req, res) => {
  try {
    let orders;
    if (req.user.role === 'admin') {
      // .populate('userId', 'name email') replaces the userId ObjectId
      // with the actual user's name and email — like a SQL JOIN
      orders = await Order.find()
        .populate('userId', 'name email')
        .sort({ createdAt: -1 });
    } else {
      // Regular users only see their own orders
      orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
    }
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch orders.', error: err.message });
  }
});

// PUT /api/orders/:id — Admin only: update order status
app.put('/api/orders/:id', authMiddleware, adminOnly, async (req, res) => {

  const { status } = req.body;

  const order = await Order.findById(req.params.id);

  if (
  order.status === 'delivered'
) {
  return res.status(400).json({
    message: 'Delivered orders cannot be cancelled'
  });
}

  if (!order)
    return res.status(404).json({
      message: 'Order not found'
    });

  // Restore stock only once
  if (
    status === 'cancelled' &&
    order.status !== 'cancelled'
  ) {

    for (const item of order.items) {

      await Product.findByIdAndUpdate(
        item.productId,
        {
          $inc: {
            stock: item.quantity
          }
        }
      );

    }

  }

  order.status = status;

  await order.save();

  res.json({
    message: 'Order updated',
    order
  });

});



// ─────────────────────────────────────────────────────────────────────────────
// STEP 9 — CATCH-ALL: serve index.html for any non-API route
// This lets the frontend handle its own page routing
// ─────────────────────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


// ─────────────────────────────────────────────────────────────────────────────
// STEP 10 — START SERVER
// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀  ShopEasy running at http://localhost:${PORT}`);
  console.log(`   API ready: http://localhost:${PORT}/api`);
});