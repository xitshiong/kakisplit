import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.jsx'],
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost:3000/app/' } },
    setupFiles: ['./src/test/setup.js'],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
