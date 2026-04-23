const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/artfolio';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('📦 Connected to MongoDB'))
  .catch(err => console.error('❌ Failed to connect to MongoDB', err));

const workSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  image_url: { type: String, default: '' },
  images: { type: [String], default: [] },
  video_url: { type: String, default: null },
  tags: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

const Work = mongoose.model('Work', workSchema);

module.exports = Work;
