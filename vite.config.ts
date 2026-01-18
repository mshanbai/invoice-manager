// Vercel Build v2
// 標準的なSPAビルド設定（Cloudflare設定は削除済み）
import { defineConfig } from 'vite'
import devServer from '@hono/vite-dev-server'
import nodeAdapter from '@hono/vite-dev-server/node'

export default defineConfig({
  plugins: [
    devServer({
      entry: 'src/index.tsx',
      adapter: nodeAdapter
    })
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
})
