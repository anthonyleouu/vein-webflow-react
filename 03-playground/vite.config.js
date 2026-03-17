import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/vein-overlay.js',
        chunkFileNames: 'assets/vein-overlay.js',
        assetFileNames: assetInfo => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'assets/vein-overlay.css';
          }
          return 'assets/[name][extname]';
        }
      }
    }
  }
});