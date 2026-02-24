// middleware/upload.js - File upload handling with multer (memory storage for serverless)
const multer = require("multer");
const config = require("../config");

const ALLOWED_MIME_TYPES = {
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/png": "image",
  "image/gif": "image",
  "image/webp": "image",
  "audio/mpeg": "audio",
  "audio/mp3": "audio",
  "audio/wav": "audio",
  "audio/ogg": "audio",
  "audio/webm": "audio",
};

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error("File type not allowed. Supported: JPEG, PNG, GIF, WEBP, MP3, WAV, OGG, WEBM"), false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: config.MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter,
});

/**
 * Convert buffer to base64 data URL for storage
 */
const bufferToDataUrl = (file) => {
  const base64 = file.buffer.toString("base64");
  return `data:${file.mimetype};base64,${base64}`;
};

/**
 * Get media type category
 */
const getMediaType = (mimetype) => {
  return ALLOWED_MIME_TYPES[mimetype] || "file";
};

module.exports = { upload, bufferToDataUrl, getMediaType, ALLOWED_MIME_TYPES };
