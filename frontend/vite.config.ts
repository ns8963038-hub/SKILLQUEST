import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// vitest 3 uses the same Vite 6 as the app (no duplicate nested Vite), so
// `defineConfig` from vitest/config accepts both the plugins and the `test`
// field cleanly.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
