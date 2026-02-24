// middleware/auth.js - Authentication middleware
const { verifyAccessToken, verifyRefreshToken, generateAccessToken, setTokenCookies } = require("../utils/jwt");
const User = require("../models/User");
const logger = require("../utils/logger");

/**
 * Authenticate user via JWT access token (with auto-refresh)
 */
const authenticate = async (req, res, next) => {
  try {
    const accessToken = req.cookies?.accessToken;
    const refreshToken = req.cookies?.refreshToken;

    // Try access token first
    if (accessToken) {
      const decoded = verifyAccessToken(accessToken);
      if (decoded) {
        const user = await User.findOne({ userId: decoded.userId });
        if (user) {
          req.user = user;
          return next();
        }
      }
    }

    // Try refresh token if access token expired
    if (refreshToken) {
      const decoded = verifyRefreshToken(refreshToken);
      if (decoded) {
        const user = await User.findOne({ userId: decoded.userId }).select("+refreshTokens");
        if (user && user.refreshTokens.includes(refreshToken)) {
          const newAccessToken = generateAccessToken({ userId: user.userId, role: user.role });
          res.cookie("accessToken", newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 15 * 60 * 1000,
            path: "/",
          });
          req.user = user;
          return next();
        }
      }
    }

    return res.status(401).json({ success: false, message: "Authentication required" });
  } catch (error) {
    logger.error("Auth middleware error:", { error: error.message });
    return res.status(401).json({ success: false, message: "Authentication failed" });
  }
};

/**
 * Require admin role
 */
const requireAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }
  if (req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }
  next();
};

/**
 * Optional auth - attach user if token present, but don't block
 */
const optionalAuth = async (req, res, next) => {
  try {
    const accessToken = req.cookies?.accessToken;
    if (accessToken) {
      const decoded = verifyAccessToken(accessToken);
      if (decoded) {
        const user = await User.findOne({ userId: decoded.userId });
        if (user) req.user = user;
      }
    }
  } catch (_) {}
  next();
};

module.exports = { authenticate, requireAdmin, optionalAuth };
