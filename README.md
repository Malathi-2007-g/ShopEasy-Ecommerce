# 🛍️ ShopEasy — Full-Stack E-Commerce App

A complete, portfolio-ready e-commerce web application built with **Node.js, Express, MongoDB, and Vanilla JS**.

---

## 🗂️ Folder Structure

```
ShopEasy/
├── index.html     ← All frontend pages (SPA — Single Page App)
├── style.css      ← Complete styling (Navy + Indigo theme)
├── app.js         ← All frontend logic (auth, cart, orders, admin)
├── server.js      ← Express backend + Mongoose models + REST APIs
├── package.json   ← Dependencies list
├── .env           ← Secret keys (NEVER commit to GitHub)
└── README.md
```

---

## 🔌 How Everything Connects (The Big Picture)

```
Browser (index.html + app.js)
    │
    │  fetch('/api/products')       ← HTTP request
    ▼
Express Server (server.js, port 5000)
    │
    │  mongoose.connect(MONGO_URI)  ← TCP connection (opened ONCE at startup)
    ▼
MongoDB Atlas (cloud DB)
    │
    ├── users      collection  ← User model
    ├── products   collection  ← Product model
    └── orders     collection  ← Order model
```

**Key insight:** `mongoose.connect()` in server.js opens ONE connection to MongoDB. After that, every `User.find()`, `Product.save()`, `Order.findById()` etc. automatically uses that same connection. You don't connect again per request.

---

## ⚙️ File-by-File Connection Guide

### `.env` → `server.js`
```
MONGO_URI=mongodb+srv://...    ← Read by dotenv
JWT_SECRET=your_secret         ← Read by dotenv
PORT=5000
```
`require('dotenv').config()` at the top of server.js loads these into `process.env`.

### `server.js` → MongoDB Atlas
```js
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
```
This is the only place you connect to the database.

### `server.js` → Frontend
Express serves the frontend files:
```js
app.use(express.static(__dirname)); // serves index.html, style.css, app.js
```

### `app.js` → `server.js`
Every API call from the frontend:
```js
fetch('/api/products')                         // GET products
fetch('/api/auth/login', { method: 'POST' })   // Login
fetch('/api/orders', { headers: { Authorization: 'Bearer ' + token } })  // Protected
```

### JWT Flow
```
Login → server creates token → frontend saves in localStorage
Every protected request → frontend sends token in header → server verifies
```

---

## 🚀 Setup Guide (Step by Step)

### Step 1 — Install Node.js
Download from https://nodejs.org (LTS version)

### Step 2 — Create MongoDB Atlas Database (Free)
1. Go to https://cloud.mongodb.com
2. Create a free account → New Project → Build a Cluster (M0 Free)
3. **Database Access** → Add New User → Enter username & password
4. **Network Access** → Add IP Address → Allow Access from Anywhere (`0.0.0.0/0`)
5. **Clusters** → Connect → Drivers → Copy connection string
6. Paste into `.env` replacing `<username>`, `<password>`, `<cluster-url>`, `<dbname>` with `shopeasy`

### Step 3 — Configure .env
```env
MONGO_URI=mongodb+srv://yourname:yourpass@cluster0.abc12.mongodb.net/shopeasy?retryWrites=true&w=majority
JWT_SECRET=any_long_random_string_here
PORT=5000
```

### Step 4 — Install Dependencies
```bash
cd ShopEasy
npm install
```

### Step 5 — Run the App
```bash
npm start          # Production
npm run dev        # Development (auto-restart on changes, needs nodemon)
```

Open browser: **http://localhost:5000**

### Step 6 — Create Admin Account
Register a new account normally, then go to your MongoDB Atlas dashboard:
1. Browse Collections → users collection
2. Find your user document → Edit → change `"role": "user"` to `"role": "admin"`
3. Save

Now login with that account to access the Admin Panel.

---

## 📡 API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | ❌ | Create account |
| POST | `/api/auth/login` | ❌ | Login, returns JWT |
| GET | `/api/products` | ❌ | List all products |
| POST | `/api/products` | ✅ Admin | Add product |
| PUT | `/api/products/:id` | ✅ Admin | Update product |
| DELETE | `/api/products/:id` | ✅ Admin | Delete product |
| POST | `/api/orders` | ✅ User | Place order |
| GET | `/api/orders` | ✅ User/Admin | Get orders |
| PUT | `/api/orders/:id` | ✅ Admin | Update order status |

---

## 🎯 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend | Node.js + Express.js |
| Database | MongoDB Atlas + Mongoose ODM |
| Auth | JWT (jsonwebtoken) + bcryptjs |


---

