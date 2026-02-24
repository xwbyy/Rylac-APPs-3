// utils/crypto.js - Password hashing using Node.js built-in crypto (sha256 + salt)
const crypto = require("crypto");

/**
 * Generate a random salt
 */
const generateSalt = () => {
  return crypto.randomBytes(32).toString("hex");
};

/**
 * Hash password with salt using SHA-256
 */
const hashPassword = (password, salt) => {
  return crypto.createHmac("sha256", salt).update(password).digest("hex");
};

/**
 * Create a full hash object with salt embedded
 */
const createPasswordHash = (password) => {
  const salt = generateSalt();
  const hash = hashPassword(password, salt);
  return { hash, salt };
};

/**
 * Verify password against stored hash and salt
 */
const verifyPassword = (password, storedHash, salt) => {
  const hash = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
};

/**
 * Generate a unique numeric ID (8 digits)
 */
const generateNumericId = () => {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
};

module.exports = {
  generateSalt,
  hashPassword,
  createPasswordHash,
  verifyPassword,
  generateNumericId,
};
