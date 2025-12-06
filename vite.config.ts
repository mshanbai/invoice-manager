import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  // 開発サーバーの設定
  server: {
    port: 5173,
  }
})
