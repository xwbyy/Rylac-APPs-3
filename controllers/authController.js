const User = require('../models/User');
const { generateSalt, hashPassword, verifyPassword } = require('../utils/hash');
const { signAccessToken, signRefreshToken, setTokenCookies, clearTokenCookies, verifyRefreshToken } = require('../utils/jwt');
const logger = require('../utils/logger');

async function generateUniqueUserId() {
  let id, exists;
  do {
    id = Math.floor(10000000 + Math.random() * 90000000); // 8-digit
    exists = await User.findOne({ userId: id });
  } while (exists);
  return id;
}

async function register(req, res) {
  try {
    let { username, password, displayName } = req.body;

    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    username = username.toLowerCase().trim();
    if (username.length < 3 || username.length > 30) return res.status(400).json({ error: 'Username must be 3-30 characters' });
    if (!/^[a-z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = await User.findOne({ username });
    if (existing) return res.status(409).json({ error: 'Username already taken' });

    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    const userId = await generateUniqueUserId();

    const user = await User.create({
      userId,
      username,
      displayName: displayName?.trim() || username,
      passwordHash,
      salt,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
    });

    const accessToken = signAccessToken({ userId: user.userId, role: user.role });
    const refreshToken = signRefreshToken({ userId: user.userId });
    await User.updateOne({ userId: user.userId }, { refreshToken });

    setTokenCookies(res, accessToken, refreshToken);
    logger.info(`New user registered: ${username} (${userId})`);
    res.status(201).json({ message: 'Registered successfully', user: user.toPublic() });
  } catch (err) {
    logger.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
}

async function login(req, res) {
  try {
    let { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    username = username.toLowerCase().trim();
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });

    const valid = verifyPassword(password, user.salt, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

    const accessToken = signAccessToken({ userId: user.userId, role: user.role });
    const refreshToken = signRefreshToken({ userId: user.userId });
    await User.updateOne({ userId: user.userId }, { refreshToken, isOnline: true, lastSeen: new Date() });

    setTokenCookies(res, accessToken, refreshToken);
    logger.info(`User logged in: ${username}`);
    res.json({ message: 'Login successful', user: user.toPublic() });
  } catch (err) {
    logger.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
}

async function logout(req, res) {
  try {
    if (req.user) {
      await User.updateOne({ userId: req.user.userId }, { refreshToken: null, isOnline: false, lastSeen: new Date() });
    }
    clearTokenCookies(res);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    logger.error('Logout error:', err.message);
    res.status(500).json({ error: 'Logout failed' });
  }
}

async function refresh(req, res) {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findOne({ userId: decoded.userId, refreshToken });
    if (!user) return res.status(401).json({ error: 'Invalid refresh token' });

    const accessToken = signAccessToken({ userId: user.userId, role: user.role });
    const newRefreshToken = signRefreshToken({ userId: user.userId });
    await User.updateOne({ userId: user.userId }, { refreshToken: newRefreshToken });

    setTokenCookies(res, accessToken, newRefreshToken);
    res.json({ message: 'Token refreshed' });
  } catch (err) {
    logger.error('Refresh error:', err.message);
    res.status(401).json({ error: 'Refresh failed' });
  }
}

async function me(req, res) {
  res.json({ user: req.user.toPublic() });
}

module.exports = { register, login, logout, refresh, me };
