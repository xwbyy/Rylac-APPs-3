const router = require('express').Router();
const { getStats, listUsers, deleteUser, setUserRole } = require('../controllers/adminController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.use(authMiddleware, adminMiddleware);
router.get('/stats', getStats);
router.get('/users', listUsers);
router.delete('/users/:id', deleteUser);
router.put('/users/:id/role', setUserRole);

module.exports = router;
