/**
 * local server entry file, for local development
 */
import 'dotenv/config'
import app from './app.js';

/**
 * start server with port
 */
// Avoid clashing with other apps that may use PORT=3000 on this machine.
// Use a dedicated env var API_PORT, fallback to 3001 for local dev.
const PORT = process.env.API_PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);
});

/**
 * close server
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;