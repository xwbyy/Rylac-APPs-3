module.exports = {
  MONGODB_URI: "mongodb+srv://Vercel-Admin-rylac:0jKpyRiBlKdYfVed@rylac.iiqlafl.mongodb.net/?retryWrites=true&w=majority&appName=rylac",
  JWT_ACCESS_SECRET: "rylac_jwt_access_2024_xK9mPqR7vLnWzS3",
  JWT_REFRESH_SECRET: "rylac_jwt_refresh_2024_aT5bNcJ8eYuGhF2",
  JWT_ACCESS_EXPIRES: "15m",
  JWT_REFRESH_EXPIRES: "7d",
  GIPHY_API_KEY: "GlVGYHkr3WSBnllca54iNt0yDlf7UIGG",
  GIPHY_BASE_URL: "https://api.giphy.com/v1/gifs",
  MAX_FILE_SIZE: 1 * 1024 * 1024,
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || "development",
  COOKIE_SECRET: "rylac_cookie_secret_2024_mXpQrVsZ",
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000,
  RATE_LIMIT_MAX: 10,
  CORS_ORIGIN: process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : "http://localhost:3000",
};
