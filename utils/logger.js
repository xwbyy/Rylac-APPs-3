// utils/logger.js - Simple logging utility
const config = require("../config");

const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = config.NODE_ENV === "production" ? 1 : 3;

const formatMessage = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
};

const logger = {
  error: (message, meta) => {
    if (levels.error <= currentLevel) {
      console.error(formatMessage("error", message, meta));
    }
  },
  warn: (message, meta) => {
    if (levels.warn <= currentLevel) {
      console.warn(formatMessage("warn", message, meta));
    }
  },
  info: (message, meta) => {
    if (levels.info <= currentLevel) {
      console.log(formatMessage("info", message, meta));
    }
  },
  debug: (message, meta) => {
    if (levels.debug <= currentLevel) {
      console.log(formatMessage("debug", message, meta));
    }
  },
};

module.exports = logger;
