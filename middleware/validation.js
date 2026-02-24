// middleware/validation.js - Input validation middleware
const validateRegister = (req, res, next) => {
  const { username, password, displayName } = req.body;

  const errors = [];

  if (!username || typeof username !== "string") {
    errors.push("Username is required");
  } else if (!/^[a-zA-Z0-9_]{3,30}$/.test(username.trim())) {
    errors.push("Username must be 3-30 alphanumeric characters (underscores allowed)");
  }

  if (!displayName || typeof displayName !== "string" || displayName.trim().length < 1) {
    errors.push("Display name is required");
  } else if (displayName.trim().length > 50) {
    errors.push("Display name must be 50 characters or less");
  }

  if (!password || typeof password !== "string") {
    errors.push("Password is required");
  } else if (password.length < 6) {
    errors.push("Password must be at least 6 characters");
  } else if (password.length > 100) {
    errors.push("Password must be 100 characters or less");
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, message: errors[0], errors });
  }

  next();
};

const validateLogin = (req, res, next) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Username and password are required" });
  }

  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ success: false, message: "Invalid input format" });
  }

  next();
};

const validateMessage = (req, res, next) => {
  const { type, content, receiverId } = req.body;

  if (!receiverId) {
    return res.status(400).json({ success: false, message: "Receiver ID is required" });
  }

  const validTypes = ["text", "gif"];
  if (type && !validTypes.includes(type) && !req.file) {
    return res.status(400).json({ success: false, message: "Invalid message type" });
  }

  if (type === "text" && (!content || content.trim().length === 0)) {
    return res.status(400).json({ success: false, message: "Message content cannot be empty" });
  }

  if (content && content.length > 5000) {
    return res.status(400).json({ success: false, message: "Message too long (max 5000 characters)" });
  }

  next();
};

// Global error handler
const errorHandler = (err, req, res, next) => {
  const logger = require("../utils/logger");
  logger.error("Unhandled error", { error: err.message, stack: err.stack, path: req.path });

  if (err.name === "ValidationError") {
    return res.status(400).json({ success: false, message: "Validation error", error: err.message });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || "field";
    return res.status(409).json({ success: false, message: `${field} already exists` });
  }

  if (err.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ success: false, message: "File too large. Maximum size is 1MB" });
    }
    return res.status(400).json({ success: false, message: err.message });
  }

  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : "Internal server error";
  res.status(status).json({ success: false, message });
};

module.exports = { validateRegister, validateLogin, validateMessage, errorHandler };
