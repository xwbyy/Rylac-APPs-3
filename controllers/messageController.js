const Message = require('../models/Message');
const User = require('../models/User');
const config = require('../config');
const logger = require('../utils/logger');
const https = require('https');

async function getMessages(req, res) {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const myId = req.user.userId;
    const otherId = Number(userId);

    const messages = await Message.find({
      $or: [
        { fromId: myId, toId: otherId },
        { fromId: otherId, toId: myId },
      ],
    })
      .sort({ timestamp: -1 })
      .skip((page - 1) * Number(limit))
      .limit(Number(limit));

    await Message.updateMany({ fromId: otherId, toId: myId, read: false }, { read: true });

    res.json({ messages: messages.reverse() });
  } catch (err) {
    logger.error('Get messages error:', err.message);
    res.status(500).json({ error: 'Failed to get messages' });
  }
}

async function sendMessage(req, res) {
  try {
    const { toId, type = 'text', content, mediaData, mediaMime, gifUrl, gifPreview } = req.body;
    const fromId = req.user.userId;

    if (!toId) return res.status(400).json({ error: 'Recipient required' });
    if (fromId === Number(toId)) return res.status(400).json({ error: 'Cannot message yourself' });

    const recipient = await User.findOne({ userId: Number(toId) });
    if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

    if (type === 'text' && (!content || content.trim().length === 0)) {
      return res.status(400).json({ error: 'Message content required' });
    }
    if (type === 'gif' && !gifUrl) return res.status(400).json({ error: 'GIF URL required' });

    if (mediaData) {
      const buffer = Buffer.from(mediaData, 'base64');
      if (buffer.length > config.MAX_FILE_SIZE) {
        return res.status(413).json({ error: 'File too large. Maximum 1MB.' });
      }
      const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'audio/mpeg', 'audio/ogg', 'audio/wav'];
      if (!allowedMimes.includes(mediaMime)) {
        return res.status(400).json({ error: 'File type not allowed' });
      }
    }

    const message = await Message.create({
      fromId,
      toId: Number(toId),
      type,
      content: content?.trim() || '',
      mediaData: mediaData || null,
      mediaMime: mediaMime || null,
      gifUrl: gifUrl || null,
      gifPreview: gifPreview || null,
    });

    res.status(201).json({ message });
  } catch (err) {
    logger.error('Send message error:', err.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
}

async function markRead(req, res) {
  try {
    const { userId } = req.params;
    await Message.updateMany(
      { fromId: Number(userId), toId: req.user.userId, read: false },
      { read: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark read' });
  }
}

async function searchGiphy(req, res) {
  try {
    const { q, offset = 0 } = req.query;
    if (!q) return res.status(400).json({ error: 'Search query required' });

    const apiKey = config.GIPHY_API_KEY || 'AUucF3CBQ98fxyz8ZMoL3ZaJsExlqVdc';
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=20&offset=${offset}&rating=g`;

    https.get(url, (giphyRes) => {
      let data = '';
      giphyRes.on('data', chunk => data += chunk);
      giphyRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          res.json(parsed);
        } catch (e) {
          res.status(500).json({ error: 'Giphy parse error' });
        }
      });
    }).on('error', (e) => {
      logger.error('Giphy error:', e.message);
      res.status(500).json({ error: 'Failed to fetch GIFs' });
    });
  } catch (err) {
    res.status(500).json({ error: 'Giphy search failed' });
  }
}

async function getTrendingGiphy(req, res) {
  try {
    const apiKey = config.GIPHY_API_KEY || 'AUucF3CBQ98fxyz8ZMoL3ZaJsExlqVdc';
    const url = `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=20&rating=g`;
    https.get(url, (giphyRes) => {
      let data = '';
      giphyRes.on('data', chunk => data += chunk);
      giphyRes.on('end', () => {
        try {
          res.json(JSON.parse(data));
        } catch (e) {
          res.status(500).json({ error: 'Giphy parse error' });
        }
      });
    }).on('error', (e) => {
      res.status(500).json({ error: 'Failed to fetch trending GIFs' });
    });
  } catch (err) {
    res.status(500).json({ error: 'Trending GIFs failed' });
  }
}

async function getUnreadCounts(req, res) {
  try {
    const myId = req.user.userId;
    const counts = await Message.aggregate([
      { $match: { toId: myId, read: false } },
      { $group: { _id: '$fromId', count: { $sum: 1 } } },
    ]);
    const result = {};
    counts.forEach(c => { result[c._id] = c.count; });
    res.json({ unread: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get unread counts' });
  }
}

module.exports = { getMessages, sendMessage, markRead, searchGiphy, getTrendingGiphy, getUnreadCounts };
