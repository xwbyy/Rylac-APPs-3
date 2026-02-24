// routes/auth.js
const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const { register, login, logout, refreshToken, me } = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");
const { validateRegister, validateLogin } = require("../middleware/validation");
const config = require("../config");

// Rate limiter for login
const loginLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
  message: { success: false, message: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.headers["x-forwarded-for"] || "unknown",
});

router.post("/register", validateRegister, register);
router.post("/login", loginLimiter, validateLogin, login);
router.post("/logout", authenticate, logout);
router.post("/refresh", refreshToken);
router.get("/me", authenticate, me);

module.exports = router;
