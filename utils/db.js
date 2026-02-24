// utils/db.js - MongoDB connection with connection pooling for serverless
const mongoose = require("mongoose");
const config = require("../config");

let isConnected = false;

const connectDB = async () => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return;
  }

  try {
    const conn = await mongoose.connect(config.MONGODB_URI, {
      dbName: config.DB_NAME,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    console.log(`[DB] MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("[DB] Connection error:", error.message);
    isConnected = false;
    throw error;
  }
};

mongoose.connection.on("disconnected", () => {
  isConnected = false;
  console.log("[DB] MongoDB disconnected");
});

mongoose.connection.on("error", (err) => {
  console.error("[DB] MongoDB error:", err.message);
  isConnected = false;
});

module.exports = connectDB;
