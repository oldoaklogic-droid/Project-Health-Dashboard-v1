import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rawPort = process.env.PORT;
if (!rawPort) {
  throw new Error('PORT environment variable is required.');
}
const port = Number(rawPort);

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  root: import.meta.dirname,
  server: { port, strictPort: true, host: '0.0.0.0', allowedHosts: true },
  preview: { port, host: '0.0.0.0', allowedHosts: true },
  build: { outDir: 'dist/public', emptyOutDir: true },
});
