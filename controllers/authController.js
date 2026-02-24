// controllers/authController.js - Authentication logic
const User = require("../models/User");
const { createPasswordHash, verifyPassword, generateNumericId } = require("../utils/crypto");
const { generateAccessToken, generateRefreshToken, setTokenCookies, clearTokenCookies, verifyRefreshToken } = require("../utils/jwt");
const logger = require("../utils/logger");

/**
 * Register new user
 */
const register = async (req, res) => {
  try {
    const { username, password, displayName } = req.body;
    const cleanUsername = username.trim().toLowerCase();
    const cleanDisplayName = displayName.trim();

    // Check username uniqueness
    const existingUser = await User.findOne({ username: cleanUsername });
    if (existingUser) {
      return res.status(409).json({ success: false, message: "Username already taken" });
    }

    // Generate unique numeric ID (retry if duplicate)
    let userId;
    let attempts = 0;
    do {
      userId = generateNumericId();
      const idExists = await User.findOne({ userId });
      if (!idExists) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      return res.status(500).json({ success: false, message: "Could not generate unique ID, please try again" });
    }

    // Hash password
    const { hash, salt } = createPasswordHash(password);

    // Create user
    const user = await User.create({
      userId,
      username: cleanUsername,
      displayName: cleanDisplayName,
      passwordHash: hash,
      passwordSalt: salt,
    });

    // Generate tokens
    const tokenPayload = { userId: user.userId, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Save refresh token
    await User.findOneAndUpdate({ userId }, { $push: { refreshTokens: refreshToken } });

    setTokenCookies(res, accessToken, refreshToken);

    logger.info("User registered", { userId: user.userId, username: user.username });

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      user: user.toPublicProfile(),
    });
  } catch (error) {
    logger.error("Register error", { error: error.message });
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "Username or ID already exists" });
    }
    return res.status(500).json({ success: false, message: "Registration failed" });
  }
};

/**
 * Login user
 */
const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const cleanUsername = username.trim().toLowerCase();

    // Find user with password fields
    const user = await User.findOne({ username: cleanUsername }).select("+passwordHash +passwordSalt +refreshTokens");
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid username or password" });
    }

    // Verify password
    const isValid = verifyPassword(password, user.passwordHash, user.passwordSalt);
    if (!isValid) {
      return res.status(401).json({ success: false, message: "Invalid username or password" });
    }

    // Generate tokens
    const tokenPayload = { userId: user.userId, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Keep max 5 refresh tokens per user
    let tokens = user.refreshTokens || [];
    if (tokens.length >= 5) tokens = tokens.slice(-4);
    tokens.push(refreshToken);
    await User.findOneAndUpdate({ userId: user.userId }, { refreshTokens: tokens });

    setTokenCookies(res, accessToken, refreshToken);

    logger.info("User logged in", { userId: user.userId });

    return res.json({
      success: true,
      message: "Login successful",
      user: user.toPublicProfile(),
    });
  } catch (error) {
    logger.error("Login error", { error: error.message });
    return res.status(500).json({ success: false, message: "Login failed" });
  }
};

/**
 * Logout user
 */
const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken && req.user) {
      await User.findOneAndUpdate(
        { userId: req.user.userId },
        { $pull: { refreshTokens: refreshToken } }
      );
    }

    // Update last seen and online status
    if (req.user) {
      await User.findOneAndUpdate(
        { userId: req.user.userId },
        { isOnline: false, lastSeen: new Date() }
      );
    }

    clearTokenCookies(res);
    return res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    logger.error("Logout error", { error: error.message });
    clearTokenCookies(res);
    return res.json({ success: true, message: "Logged out" });
  }
};

/**
 * Refresh access token
 */
const refreshToken = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ success: false, message: "No refresh token" });
    }

    const decoded = verifyRefreshToken(token);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Invalid refresh token" });
    }

    const user = await User.findOne({ userId: decoded.userId }).select("+refreshTokens");
    if (!user || !user.refreshTokens.includes(token)) {
      return res.status(401).json({ success: false, message: "Refresh token revoked" });
    }

    const newAccessToken = generateAccessToken({ userId: user.userId, role: user.role });
    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000,
      path: "/",
    });

    return res.json({ success: true, message: "Token refreshed" });
  } catch (error) {
    logger.error("Refresh token error", { error: error.message });
    return res.status(401).json({ success: false, message: "Token refresh failed" });
  }
};

/**
 * Get current user info
 */
const me = async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.user.userId });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    return res.json({ success: true, user: user.toPublicProfile() });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to get user info" });
  }
};

module.exports = { register, login, logout, refreshToken, me };
