# Rylac App 🚀

Aplikasi chat real-time modern berbasis Node.js + Socket.io + MongoDB Atlas.

## Fitur
- 💬 Chat real-time dengan Socket.io
- 🔐 Autentikasi JWT + httpOnly Cookie
- 🖼️ Kirim gambar/audio (maks. 1MB)
- 🎬 GIF via Giphy API
- 🌙 Tema gelap/terang (tersimpan di DB)
- 🔍 Cari user by username atau ID
- 👤 Edit profil
- ⚡ Online/Offline status real-time
- 🛡️ Rate limiting, hashing SHA-256+salt
- 👑 Admin panel (role-based)

## Setup Lokal
```bash
npm install
npm start
```

Buka: http://localhost:3000

## Deploy ke Vercel
```bash
npm install -g vercel
vercel --prod
```

## Konfigurasi
Semua konfigurasi ada di `config.js`.

## Struktur
```
rylac-app/
├── config.js
├── server.js
├── db.js
├── controllers/
├── routes/
├── models/
├── middleware/
├── socket/
├── utils/
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── package.json
└── vercel.json
```
