// Passenger (cPanel Setup Node.js App) loads a CommonJS startup file, but the server is ESM with
// top-level await, so this hands off to it with a dynamic import.
import('./server/src/index.js').catch((err) => {
  console.error(err);
  process.exit(1);
});
