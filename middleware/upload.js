const config = require('../config');

// Parse base64 media from JSON body (no disk storage needed for Vercel)
function parseMediaUpload(req, res, next) {
  try {
    const { mediaData, mediaMime } = req.body;
    if (mediaData && mediaMime) {
      const buffer = Buffer.from(mediaData, 'base64');
      if (buffer.length > config.MAX_FILE_SIZE) {
        return res.status(413).json({ error: 'File too large. Maximum size is 1MB.' });
      }
      const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'audio/mpeg', 'audio/ogg', 'audio/wav'];
      if (!allowedMimes.includes(mediaMime)) {
        return res.status(400).json({ error: 'File type not allowed.' });
      }
    }
    next();
  } catch (err) {
    res.status(400).json({ error: 'Invalid media data' });
  }
}

module.exports = { parseMediaUpload };
