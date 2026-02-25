const router = require('express').Router();
const { getMessages, sendMessage, markRead, searchGiphy, getTrendingGiphy, getUnreadCounts } = require('../controllers/messageController');
const { authMiddleware } = require('../middleware/auth');
const { parseMediaUpload } = require('../middleware/upload');

router.use(authMiddleware);
router.get('/unread', getUnreadCounts);
router.get('/giphy/search', searchGiphy);
router.get('/giphy/trending', getTrendingGiphy);
router.get('/:userId', getMessages);
router.post('/send', parseMediaUpload, sendMessage);
router.put('/read/:userId', markRead);

module.exports = router;
