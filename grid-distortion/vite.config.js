import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: './index.html',
      output: {
        entryFileNames: 'grid-distortion.js',
        chunkFileNames: 'grid-distortion-chunk.js',
        assetFileNames: 'grid-distortion.[ext]'
      }
    }
  }
});