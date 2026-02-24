// server.js - Main application entry point
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const path = require("path");

const config = require("./config");
const connectDB = require("./utils/db");
const { initSocket } = require("./utils/socket");
const { errorHandler } = require("./middleware/validation");
const logger = require("./utils/logger");

// Routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const messageRoutes = require("./routes/messages");
const adminRoutes = require("./routes/admin");

const app = express();
const server = http.createServer(app);

// Socket.io setup with CORS
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Connect to DB on startup
connectDB().catch((err) => {
  logger.error("Failed to connect to MongoDB on startup", { error: err.message });
});

// Middleware
app.use(morgan(config.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser());

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// DB middleware - ensure connection for each request (serverless-safe)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    logger.error("DB connection error in request", { error: error.message });
    return res.status(503).json({ success: false, message: "Service temporarily unavailable" });
  }
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/admin", adminRoutes);

// SEO files
app.get("/sitemap.xml", (req, res) => {
  const appUrl = config.APP_URL;
  res.setHeader("Content-Type", "application/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${appUrl}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>${appUrl}/login</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>${appUrl}/register</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
</urlset>`);
});

app.get("/robots.txt", (req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /chat\nDisallow: /admin\nSitemap: ${config.APP_URL}/sitemap.xml`);
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "ok", timestamp: new Date().toISOString() });
});

// SPA fallback - serve index.html for all non-API routes
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api/")) {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  } else {
    res.status(404).json({ success: false, message: "API endpoint not found" });
  }
});

// Global error handler (must be last)
app.use(errorHandler);

// Initialize Socket.io
initSocket(io);

// Start server
if (require.main === module) {
  server.listen(config.PORT, () => {
    logger.info(`Rylac App running on port ${config.PORT}`);
  });
}

module.exports = server;
