const rateLimit = require("express-rate-limit");
const config = require("../config");

/**
 * Rate limiter for login endpoint — prevent brute force attacks
 */
const loginRateLimiter = rateLimit({
  windowMs: config.LOGIN_RATE_LIMIT_WINDOW,
  max: config.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: `Too many login attempts. Please try again after 15 minutes.`,
  },
  skipSuccessfulRequests: true,
});

/**
 * General API rate limiter
 */
const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please slow down.",
  },
});

module.exports = { loginRateLimiter, apiRateLimiter };
