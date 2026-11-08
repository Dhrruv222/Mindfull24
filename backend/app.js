const path = require('path');
const express = require('express');
const config = require('./config');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (config.isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
  app.use(express.json({ limit: '50kb' }));

  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (req, res, next) => {
    if (config.missing.length && req.path !== '/health') {
      return res.status(503).json({ error: { code: 'NOT_CONFIGURED', message: `Server is missing configuration: ${config.missing.join(', ')}` } });
    }
    next();
  });
  app.use('/api', routes, notFound);

  app.use(express.static(path.join(__dirname, '..', 'frontend')));

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
