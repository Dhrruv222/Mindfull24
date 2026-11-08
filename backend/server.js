const config = require('./config');
const { createApp } = require('./app');
const { pool } = require('./db');

const server = createApp().listen(config.port, () => {
  console.log(`Advent Calendar running on http://localhost:${config.port} (demo mode: ${config.demoMode})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => pool.end().then(() => process.exit(0))));
}
