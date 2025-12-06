import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import { cors } from 'hono/cors'

// Vercel用のHonoアプリ
const app = new Hono().basePath('/api')

// CORS設定
app.use('/*', cors())

// SaaS用: 開発中は仮のユーザーIDを使用
const DEMO_USER_ID = 'demo-user-001'

// 税率を取得するヘルパー関数
function getTaxRate(taxRate: number | null | undefined): number {
  return (taxRate !== null && taxRate !== undefined) ? taxRate : 10
}

// =====================================
// ヘルスチェック
// =====================================
app.get('/health', (c) => {
  return c.json({ status: 'ok', message: 'SmartBill API is running on Vercel' })
})

// =====================================
// 自社情報 API (モック)
// =====================================
app.get('/company', (c) => {
  // Vercelではデータベースを別途設定する必要があります
  // 現在はモックデータを返します
  return c.json({
    id: 1,
    user_id: DEMO_USER_ID,
    company_name: 'サンプル株式会社',
    message: 'Vercelデプロイ成功！データベース接続は別途設定が必要です。'
  })
})

app.put('/company', async (c) => {
  const data = await c.req.json()
  return c.json({ success: true, message: 'データベース未接続のため保存されません', data })
})

// =====================================
// 分類マスタ API (モック)
// =====================================
app.get('/categories', (c) => {
  return c.json([])
})

app.post('/categories', async (c) => {
  const data = await c.req.json()
  return c.json({ success: true, category_code: 'C001' })
})

// =====================================
// 商品マスタ API (モック)
// =====================================
app.get('/products', (c) => {
  return c.json([])
})

app.post('/products', async (c) => {
  const data = await c.req.json()
  return c.json({ success: true, product_code: 'P0001' })
})

// =====================================
// 取引先マスタ API (モック)
// =====================================
app.get('/clients', (c) => {
  return c.json([])
})

app.get('/clients/recent', (c) => {
  return c.json([])
})

app.get('/clients/next-code', (c) => {
  return c.json({ next_code: '101' })
})

app.post('/clients', async (c) => {
  const data = await c.req.json()
  return c.json({ success: true, client_code: '101' })
})

// =====================================
// 納品データ API (モック)
// =====================================
app.get('/deliveries', (c) => {
  return c.json([])
})

app.get('/deliveries/recent', (c) => {
  return c.json([])
})

// =====================================
// 見積データ API (モック)
// =====================================
app.get('/estimates', (c) => {
  return c.json([])
})

app.get('/estimates/recent', (c) => {
  return c.json([])
})

// =====================================
// 請求書データ API (モック)
// =====================================
app.get('/invoices', (c) => {
  return c.json([])
})

app.get('/invoices/recent', (c) => {
  return c.json([])
})

// =====================================
// ダッシュボード API (モック)
// =====================================
app.get('/dashboard/summary', (c) => {
  return c.json({
    monthly_sales: 0,
    client_sales: [],
    uninvoiced_count: 0,
    monthly_estimates: 0,
    monthly_deliveries: 0,
    monthly_invoices: 0,
    unpaid_invoices: { count: 0, total: 0 },
    monthly_sales_chart: []
  })
})

// Vercel用のエクスポート
export const GET = handle(app)
export const POST = handle(app)
export const PUT = handle(app)
export const DELETE = handle(app)
export const PATCH = handle(app)

