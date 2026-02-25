const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  fromId: { type: Number, required: true, index: true },
  toId: { type: Number, required: true, index: true },
  type: {
    type: String,
    enum: ['text', 'image', 'audio', 'gif'],
    default: 'text',
  },
  content: { type: String, default: '' },
  mediaData: { type: String, default: null },
  mediaMime: { type: String, default: null },
  gifUrl: { type: String, default: null },
  gifPreview: { type: String, default: null },
  read: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now, index: true },
});

messageSchema.index({ fromId: 1, toId: 1, timestamp: -1 });
messageSchema.index({ toId: 1, fromId: 1, timestamp: -1 });

module.exports = mongoose.models.Message || mongoose.model('Message', messageSchema);
