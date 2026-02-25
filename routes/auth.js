const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { register, login, logout, refresh, me } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');
const config = require('../config');

const loginLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/register', register);
router.post('/login', loginLimiter, login);
router.post('/logout', authMiddleware, logout);
router.post('/refresh', refresh);
router.get('/me', authMiddleware, me);

module.exports = router;
