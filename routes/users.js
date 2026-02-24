// routes/users.js
const express = require("express");
const router = express.Router();
const { searchUsers, getProfile, updateProfile, getRecentContacts } = require("../controllers/userController");
const { authenticate } = require("../middleware/auth");

router.get("/search", authenticate, searchUsers);
router.get("/contacts", authenticate, getRecentContacts);
router.get("/:identifier", authenticate, getProfile);
router.put("/profile/update", authenticate, updateProfile);

module.exports = router;
