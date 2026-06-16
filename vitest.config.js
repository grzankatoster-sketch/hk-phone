import { defineConfig } from 'vitest/config';

// Osobny config od vite.config.js — testy jednostkowe czystych funkcji nie
// potrzebują pluginu React ani bundlowania, więc uruchamiamy je w node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,mjs}'],
    reporters: 'default',
  },
});
