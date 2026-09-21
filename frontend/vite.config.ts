import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// vitest 3 uses the same Vite 6 as the app (no duplicate nested Vite), so
// `defineConfig` from vitest/config accepts both the plugins and the `test`
// field cleanly.
export default defineConfig({
  plugins: [react()],
  // The dev server may also read ../content (the lesson JSON files), which demo
  // mode loads on demand — everything else stays inside the frontend.
  server: { port: 5173, fs: { allow: ['..'] } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // Tests see the same (empty) connection settings on every machine as in CI,
    // whatever is in a developer's local .env — so a test that accidentally
    // needs a real Supabase project fails here first, not only on GitHub.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_API_URL: '' },
  },
});
