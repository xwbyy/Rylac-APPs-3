const logger = require("../utils/logger");

/**
 * Global error handler — must be registered last in Express middleware chain
 */
function errorHandler(err, req, res, next) {
  logger.error(`${req.method} ${req.path} — ${err.message}`, {
    stack: err.stack,
    body: req.body,
  });

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, message: messages.join(", ") });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json({ success: false, message: `${field} already exists` });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }

  // Multer file size error
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ success: false, message: "File too large. Maximum size is 1MB." });
  }

  // Default
  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: err.message || "Internal server error",
  });
}

/**
 * 404 Not Found handler
 */
function notFoundHandler(req, res) {
  // Serve index.html for frontend routes (SPA behavior)
  const frontendRoutes = ["/chat", "/profile", "/admin"];
  if (frontendRoutes.some((r) => req.path.startsWith(r))) {
    return res.sendFile("index.html", { root: "./public" });
  }
  res.status(404).json({ success: false, message: `Route ${req.path} not found` });
}

module.exports = { errorHandler, notFoundHandler };
