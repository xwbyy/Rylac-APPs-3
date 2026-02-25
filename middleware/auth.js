const { verifyAccessToken, verifyRefreshToken, signAccessToken, setTokenCookies } = require('../utils/jwt');
const User = require('../models/User');
const logger = require('../utils/logger');

async function authMiddleware(req, res, next) {
  try {
    const accessToken = req.cookies.accessToken;
    if (accessToken) {
      try {
        const decoded = verifyAccessToken(accessToken);
        const user = await User.findOne({ userId: decoded.userId });
        if (!user) return res.status(401).json({ error: 'User not found' });
        req.user = user;
        return next();
      } catch (e) {
        // access token expired, try refresh
      }
    }

    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({ error: 'Authentication required' });

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (e) {
      return res.status(401).json({ error: 'Session expired, please login again' });
    }

    const user = await User.findOne({ userId: decoded.userId, refreshToken });
    if (!user) return res.status(401).json({ error: 'Invalid session' });

    const newAccessToken = signAccessToken({ userId: user.userId, role: user.role });
    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
    });

    req.user = user;
    next();
  } catch (err) {
    logger.error('Auth middleware error:', err.message);
    res.status(500).json({ error: 'Authentication error' });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { authMiddleware, adminMiddleware };
