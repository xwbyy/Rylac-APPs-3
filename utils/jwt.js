// utils/jwt.js - JWT token generation and verification
const jwt = require("jsonwebtoken");
const config = require("../config");

/**
 * Generate access token (short-lived)
 */
const generateAccessToken = (payload) => {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_ACCESS_EXPIRES,
  });
};

/**
 * Generate refresh token (long-lived)
 */
const generateRefreshToken = (payload) => {
  return jwt.sign(payload, config.JWT_SECRET + "_refresh", {
    expiresIn: config.JWT_REFRESH_EXPIRES,
  });
};

/**
 * Verify access token
 */
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, config.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

/**
 * Verify refresh token
 */
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, config.JWT_SECRET + "_refresh");
  } catch (error) {
    return null;
  }
};

/**
 * Set tokens in httpOnly cookies
 */
const setTokenCookies = (res, accessToken, refreshToken) => {
  const baseOptions = {
    ...require("../config").COOKIE_OPTIONS,
  };

  res.cookie("accessToken", accessToken, {
    ...baseOptions,
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie("refreshToken", refreshToken, {
    ...baseOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

/**
 * Clear auth cookies
 */
const clearTokenCookies = (res) => {
  const options = { httpOnly: true, path: "/" };
  res.clearCookie("accessToken", options);
  res.clearCookie("refreshToken", options);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  setTokenCookies,
  clearTokenCookies,
};
