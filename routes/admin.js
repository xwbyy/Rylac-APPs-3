// routes/admin.js
const express = require("express");
const router = express.Router();
const { getStats, getAllUsers, deleteUser, setUserRole } = require("../controllers/adminController");
const { authenticate, requireAdmin } = require("../middleware/auth");

router.use(authenticate, requireAdmin);

router.get("/stats", getStats);
router.get("/users", getAllUsers);
router.delete("/users/:userId", deleteUser);
router.put("/users/:userId/role", setUserRole);

module.exports = router;
