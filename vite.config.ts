// Vercel Build v2
// 標準的なSPAビルド設定（Cloudflare設定は削除済み）
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  }
})
