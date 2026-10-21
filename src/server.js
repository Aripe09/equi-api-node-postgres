import { createApp } from './app.js';
import { createPool } from './config/database.js';
import { createRepository } from './repositories/caballosRepository.js';

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT invalido');
if (!process.env.API_KEY || Buffer.byteLength(process.env.API_KEY) < 32) throw new Error('Configura API_KEY con al menos 32 bytes.');
const pool = createPool();
const server = createApp({
  repository: createRepository(pool),
  apiKey: process.env.API_KEY,
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)
});

try {
  await pool.query('SELECT 1 FROM caballos LIMIT 1');
  server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ event: 'listening', port })));
} catch (error) {
  console.error(JSON.stringify({ event: 'startup_database_error', code: error.code || 'UNAVAILABLE' }));
  await pool.end();
  process.exitCode = 1;
}
server.on('error', async error => {
  console.error(JSON.stringify({ event: 'server_error', code: error.code || 'UNKNOWN' }));
  await pool.end();
  process.exitCode = 1;
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 12000);
  deadline.unref();
  server.close(async () => {
    await pool.end();
    clearTimeout(deadline);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
