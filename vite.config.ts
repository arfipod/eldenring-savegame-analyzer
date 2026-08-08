import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { steamDeckBridgePlugin } from './server/steam-deck-bridge';

export default defineConfig({
  plugins: [react(), steamDeckBridgePlugin()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
  },
});
