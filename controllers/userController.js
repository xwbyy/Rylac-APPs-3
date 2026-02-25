const User = require('../models/User');
const logger = require('../utils/logger');

async function searchUsers(req, res) {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 1) return res.status(400).json({ error: 'Search query required' });

    const query = q.trim().toLowerCase();
    let users;

    if (/^\d+$/.test(query)) {
      // Search by userId
      users = await User.find({ userId: Number(query) }).limit(20);
    } else {
      // Search by username
      users = await User.find({
        username: { $regex: query, $options: 'i' },
        userId: { $ne: req.user.userId },
      }).limit(20);
    }

    res.json({ users: users.map(u => u.toPublic()) });
  } catch (err) {
    logger.error('Search error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
}

async function getUser(req, res) {
  try {
    const { id } = req.params;
    const user = await User.findOne({ userId: Number(id) });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: user.toPublic() });
  } catch (err) {
    logger.error('Get user error:', err.message);
    res.status(500).json({ error: 'Failed to get user' });
  }
}

async function updateProfile(req, res) {
  try {
    const { displayName, bio, avatar, theme } = req.body;
    const updates = {};

    if (displayName !== undefined) {
      const dn = displayName.trim();
      if (dn.length > 50) return res.status(400).json({ error: 'Display name max 50 chars' });
      updates.displayName = dn;
    }
    if (bio !== undefined) {
      const b = bio.trim();
      if (b.length > 200) return res.status(400).json({ error: 'Bio max 200 chars' });
      updates.bio = b;
    }
    if (avatar !== undefined) {
      const av = avatar.trim();
      if (av && !av.startsWith('http')) return res.status(400).json({ error: 'Avatar must be a valid URL' });
      updates.avatar = av;
    }
    if (theme) {
      if (!['light', 'dark'].includes(theme)) return res.status(400).json({ error: 'Invalid theme' });
      updates.theme = theme;
    }

    const user = await User.findOneAndUpdate(
      { userId: req.user.userId },
      updates,
      { new: true }
    );

    res.json({ message: 'Profile updated', user: user.toPublic() });
  } catch (err) {
    logger.error('Update profile error:', err.message);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}

async function getContacts(req, res) {
  try {
    const Message = require('../models/Message');
    const userId = req.user.userId;

    // Find all unique users this user has chatted with
    const sent = await Message.distinct('toId', { fromId: userId });
    const received = await Message.distinct('fromId', { toId: userId });
    const contactIds = [...new Set([...sent, ...received])];

    const users = await User.find({ userId: { $in: contactIds } });
    res.json({ contacts: users.map(u => u.toPublic()) });
  } catch (err) {
    logger.error('Get contacts error:', err.message);
    res.status(500).json({ error: 'Failed to get contacts' });
  }
}

module.exports = { searchUsers, getUser, updateProfile, getContacts };
