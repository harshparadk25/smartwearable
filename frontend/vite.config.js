import { defineConfig, createLogger } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Custom logger — suppress two classes of expected noise:
//  1. ECONNRESET  — browser closes TLS WebSocket on page refresh/tab switch (harmless)
//  2. ECONNREFUSED on /status or /bridge — BLE bridge is optional; not running = expected
const logger = createLogger();
const _error = logger.error.bind(logger);
logger.error = (msg, opts) => {
  if (typeof msg === 'string') {
    if (msg.includes('ECONNRESET')) return;
    if (msg.includes('ECONNREFUSED') && (msg.includes('/status') || msg.includes('/bridge'))) return;
  }
  _error(msg, opts);
};

export default defineConfig({
  customLogger: logger,
  plugins: [react(), basicSsl()],

  server: {
    host: '0.0.0.0',
    port: 5173,
    https: true,
    allowedHosts: true,

    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://127.0.0.1:5000',
        ws: true,
        changeOrigin: true
      },
      '/bridge': {
        target: 'http://127.0.0.1:7070',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bridge/, '')
      }
    }
  }
});
