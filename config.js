// config.js - All application configurations (no .env needed)
module.exports = {
  // MongoDB Atlas
  MONGODB_URI: "mongodb+srv://Vercel-Admin-rylac:0jKpyRiBlKdYfVed@rylac.iiqlafl.mongodb.net/?retryWrites=true&w=majority",
  DB_NAME: "rylac",

  // JWT
  JWT_SECRET: "rylac_super_secret_jwt_key_2024_xK9#mP2$nQ7",
  JWT_ACCESS_EXPIRES: "15m",
  JWT_REFRESH_EXPIRES: "7d",

  // Giphy
  GIPHY_API_KEY: "dc6zaTOxFJmzC", // public beta key
  GIPHY_BASE_URL: "https://api.giphy.com/v1/gifs",

  // App
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || "production",
  APP_URL: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000",
  APP_NAME: "Rylac App",
  APP_DESCRIPTION: "Rylac - Real-time Chat Application. Connect, message, and share with ease.",

  // Upload limits
  MAX_FILE_SIZE: 1 * 1024 * 1024, // 1MB in bytes

  // Cookie settings
  COOKIE_OPTIONS: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/"
  },

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX: 10, // max 10 login attempts per window
};
