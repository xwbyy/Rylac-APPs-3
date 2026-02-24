# 🚀 Rylac App

Real-time chat application built with Node.js, Express, MongoDB Atlas, and Socket.io.

## 📁 Project Structure

```
rylac-app/
├── server.js              # Main entry point
├── config.js              # All config (Mongo URI, JWT, Giphy, etc.)
├── package.json
├── vercel.json            # Vercel serverless config
├── controllers/
│   ├── authController.js  # Register, login, logout, refresh
│   ├── userController.js  # Search, profile, contacts
│   ├── messageController.js # Messages, media, GIFs
│   └── adminController.js # Admin stats, user management
├── routes/
│   ├── auth.js            # /api/auth/*
│   ├── users.js           # /api/users/*
│   ├── messages.js        # /api/messages/*
│   └── admin.js           # /api/admin/*
├── models/
│   ├── User.js            # Users collection
│   └── Message.js         # Messages collection
├── middleware/
│   ├── auth.js            # JWT authentication
│   ├── validation.js      # Input validation + error handler
│   └── upload.js          # Multer file handling
├── utils/
│   ├── db.js              # MongoDB connection (serverless-safe)
│   ├── crypto.js          # SHA-256 + salt password hashing
│   ├── jwt.js             # JWT generation & verification
│   ├── socket.js          # Socket.io real-time handler
│   └── logger.js          # Simple logger
└── public/
    ├── index.html         # SPA entry point (SEO meta + OG tags)
    ├── css/main.css       # Mobile-first responsive styles
    ├── js/app.js          # Full frontend logic
    └── assets/
        ├── favicon.svg
        └── default-avatar.svg
```

## 🛠 Local Setup

```bash
npm install
npm start         # production
npm run dev       # development (nodemon)
```

Open: http://localhost:3000

## 🚀 Deploy to Vercel

```bash
npm i -g vercel
vercel --prod
```

## 🔑 API Endpoints (Postman)

### Auth
- `POST /api/auth/register` — `{ username, password, displayName }`
- `POST /api/auth/login` — `{ username, password }`
- `POST /api/auth/logout` — (auth required)
- `POST /api/auth/refresh` — Refresh access token
- `GET /api/auth/me` — Get current user

### Users
- `GET /api/users/search?q=query` — Search users
- `GET /api/users/contacts` — Recent conversations
- `GET /api/users/:identifier` — Get user profile
- `PUT /api/users/profile/update` — `{ displayName, bio, avatar, theme }`

### Messages
- `GET /api/messages/conversation/:userId` — Get messages
- `POST /api/messages/send` — `{ receiverId, type, content }` or `{ receiverId, type:"gif", gifUrl, gifTitle }`
- `POST /api/messages/send/media` — multipart/form-data: `{ file, receiverId }`
- `DELETE /api/messages/:messageId` — Soft delete
- `GET /api/messages/gifs/search?q=query` — Search GIFs
- `GET /api/messages/gifs/trending` — Trending GIFs

### Admin (role: admin required)
- `GET /api/admin/stats` — Dashboard stats
- `GET /api/admin/users` — All users (paginated)
- `DELETE /api/admin/users/:userId` — Delete user
- `PUT /api/admin/users/:userId/role` — `{ role: "admin" | "user" }`

## ✅ Features

- 🔒 JWT auth (access + refresh tokens in httpOnly cookies)
- 🔐 SHA-256 + unique salt per user (no bcrypt)
- 📱 Mobile-first responsive UI
- ⚡ Real-time messaging via Socket.io
- 🟢 Online/offline presence tracking
- 💬 Text, image, audio, GIF messages (max 1MB media)
- 🔍 User search by ID or username (MongoDB indexed)
- 👤 View/edit user profiles
- 🌙 Dark/light theme (saved in DB per user)
- 🛡 Rate limiting on login endpoint (brute-force protection)
- 🔢 Unique 8-digit numeric user IDs
- 👑 Admin panel with stats and user management
- 🗂 Persistent messages (never lost on reload)
- 📤 Media stored as base64 data URLs
- 🔄 Auto-reconnect on socket disconnect
- 🌐 SEO: meta tags, Open Graph, JSON-LD, sitemap.xml, robots.txt

## ⚙️ Configuration (config.js)

All secrets are stored in `config.js`. No `.env` file needed.

- `MONGODB_URI` — MongoDB Atlas connection string
- `JWT_SECRET` — JWT signing secret
- `GIPHY_API_KEY` — Giphy API key
- `MAX_FILE_SIZE` — 1MB limit
- `RATE_LIMIT_MAX` — 10 login attempts per 15 min window
