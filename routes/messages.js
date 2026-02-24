// routes/messages.js
const express = require("express");
const router = express.Router();
const {
  getMessages,
  sendMessage,
  sendMediaMessage,
  deleteMessage,
  searchGifs,
  getTrendingGifs,
} = require("../controllers/messageController");
const { authenticate } = require("../middleware/auth");
const { validateMessage } = require("../middleware/validation");
const { upload } = require("../middleware/upload");

router.get("/conversation/:userId", authenticate, getMessages);
router.post("/send", authenticate, validateMessage, sendMessage);
router.post("/send/media", authenticate, upload.single("file"), sendMediaMessage);
router.delete("/:messageId", authenticate, deleteMessage);
router.get("/gifs/search", authenticate, searchGifs);
router.get("/gifs/trending", authenticate, getTrendingGifs);

module.exports = router;
