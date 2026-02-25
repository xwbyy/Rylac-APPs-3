const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: { type: Number, unique: true, required: true, index: true },
  username: {
    type: String,
    unique: true,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
    minlength: 3,
    maxlength: 30,
    match: /^[a-z0-9_]+$/,
  },
  displayName: { type: String, trim: true, maxlength: 50 },
  passwordHash: { type: String, required: true },
  salt: { type: String, required: true },
  avatar: { type: String, default: '' },
  bio: { type: String, maxlength: 200, default: '' },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  theme: { type: String, enum: ['light', 'dark'], default: 'light' },
  lastSeen: { type: Date, default: Date.now },
  isOnline: { type: Boolean, default: false },
  refreshToken: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

userSchema.index({ username: 'text' });

userSchema.methods.toPublic = function () {
  return {
    userId: this.userId,
    username: this.username,
    displayName: this.displayName || this.username,
    avatar: this.avatar,
    bio: this.bio,
    role: this.role,
    theme: this.theme,
    lastSeen: this.lastSeen,
    isOnline: this.isOnline,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
