import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Mission Control — Vite config.
// No `base: './'` (we deploy behind NGINX/PM2, not IPFS).
// No web3 vendor chunk (no wagmi/rainbowkit in this app).
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['framer-motion', 'lucide-react'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-rt': ['socket.io-client', '@hello-pangea/dnd'],
        },
      },
    },
  },
  server: {
    port: 5174, // distinct from the shop's default 5173 so both can run side-by-side
    proxy: {
      // Forward /api/* to the local Express service (server/index.js).
      // Lets the React app call `/api/send-dm` in dev without a separate
      // base URL, and matches how prod is wired (Express in front of the
      // SPA via reverse proxy). Run both with `npm run dev:full`.
      '/api': {
        target: `http://localhost:${process.env.API_PORT || 3011}`,
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.js',
    css: true,
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
  },
})
