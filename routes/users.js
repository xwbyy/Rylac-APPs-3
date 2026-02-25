const router = require('express').Router();
const { searchUsers, getUser, updateProfile, getContacts } = require('../controllers/userController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.get('/search', searchUsers);
router.get('/contacts', getContacts);
router.get('/:id', getUser);
router.put('/me/profile', updateProfile);

module.exports = router;
