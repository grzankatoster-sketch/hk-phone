import { defineConfig } from 'vitest/config';

// Osobny config od vite.config.js — testy jednostkowe czystych funkcji nie
// potrzebują pluginu React ani bundlowania, więc uruchamiamy je w node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,mjs}'],
    reporters: 'default',
    // Pula 'forks' (procesy potomne) zamiast domyślnej 'threads' — eliminuje
    // przejściowy wyścig inicjalizacji workerów na Windows ("Cannot read
    // properties of undefined (reading 'config')"), który losowo wywalał cały
    // przebieg. Suite jest mały, więc narzut forków jest nieistotny.
    pool: 'forks',
  },
});
