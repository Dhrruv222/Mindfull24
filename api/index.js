// Vercel serverless entry: all /api/* requests are rewritten here (see vercel.json).
const { createApp } = require('../backend/app');

module.exports = createApp();
