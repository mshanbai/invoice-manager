import { Hono } from 'hono'
import { supabase } from '../lib/supabaseClient'

const api = new Hono()
const isDev = process.env.NODE_ENV !== 'production'

const toErrorMessage = (err: unknown): string => {
  return err instanceof Error ? err.message : JSON.stringify(err)
}

const isConnectTimeoutMessage = (message: string): boolean => {
  return (
    message.includes('UND_ERR_CONNECT_TIMEOUT') ||
    message.includes('ConnectTimeoutError') ||
    message.includes('TypeError: fetch failed') ||
    message.includes('fetch failed')
  )
}

const getSupabaseHost = (): string => {
  try {
    const rawUrl =
      (supabase as any).supabaseUrl ||
      (supabase as any).url ||
      (supabase as any).restUrl ||
      ''
    if (!rawUrl) return 'unknown'
    return new URL(rawUrl).hostname || 'unknown'
  } catch {
    return 'unknown'
  }
}

const getRequestLabel = (c: any): string => {
  try {
    return `${c.req.method} ${new URL(c.req.url).pathname}`
  } catch {
    return `${c.req.method} (unknown-path)`
  }
}

const handleSupabaseError = (
  c: any,
  err: unknown,
  operation: string,
  statusCode = 500
) => {
  const message = toErrorMessage(err)
  const label = getRequestLabel(c)
  if (isConnectTimeoutMessage(message)) {
    console.error(
      `[API][timeout] ${label} ${operation} supabase=${getSupabaseHost()} error=${message}`
    )
    return c.json(
      { success: false, error: '接続タイムアウト。再試行してください' },
      504
    )
  }
  console.error(`[API][error] ${label} ${operation} error=${message}`)
  return c.json({ success: false, error: message }, statusCode)
}

api.use('*', async (c, next) => {
  console.log(`[API] ${getRequestLabel(c)}`)
  return await next()
})

// ✅ 追加：API全体のエラーを握りつぶさずJSONで返す
api.onError((err, c) => {
  const message = toErrorMessage(err)
  if (isConnectTimeoutMessage(message)) {
    console.error(
      `[API][timeout] ${getRequestLabel(c)} onError supabase=${getSupabaseHost()} error=${message}`
    )
    return c.json(
      { success: false, error: '接続タイムアウト。再試行してください' },
      504
    )
  }
  console.error(`[API][error] ${getRequestLabel(c)} onError error=${message}`)
  return c.json({ success: false, error: message }, 500)
})

// SaaS用: 開発中は仮のユーザーIDを使用
const DEMO_USER_ID = 'demo-user-001'

// 税率を取得するヘルパー関数（0%に対応）
function getTaxRate(taxRate: number | null | undefined): number {
  return (taxRate !== null && taxRate !== undefined) ? taxRate : 10
}

function normalizeJan(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\D/g, '')
}

function normalizeProductCode(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value)
}

function parseNonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (Number.isNaN(n) || n < 0) return null
  return n
}

// =====================================
// 自社情報 API
// =====================================
api.get('/company', async (c) => {
  const { data, error } = await supabase
    .from('company_info')
    .select('*')
    .eq('user_id', DEMO_USER_ID)
    .maybeSingle()

  if (error) return handleSupabaseError(c, error, 'company_info select')
  return c.json(data || {})
})

api.put('/company', async (c) => {
  const data = await c.req.json()
  const { data: existing, error: existingError } = await supabase
    .from('company_info')
    .select('id')
    .eq('user_id', DEMO_USER_ID)
    .maybeSingle()

  if (existingError) return handleSupabaseError(c, existingError, 'company_info select id')
  
  // 銀行口座情報をJSON文字列に変換
  const bankAccountsJson = JSON.stringify(data.bank_accounts || [])
  
  if (existing) {
    const { error } = await supabase
      .from('company_info')
      .update({
        company_name: data.company_name,
        department_name: data.department_name || '',
        person_name: data.person_name || '',
        representative_title: data.representative_title || '',
        representative_name: data.representative_name || '',
        postal_code: data.postal_code || '',
        address: data.address || '',
        address_number: data.address_number || '',
        building_name: data.building_name || '',
        tel: data.tel || '',
        fax: data.fax || '',
        email: data.email || '',
        website: data.website || '',
        invoice_registration_no: data.invoice_registration_no || '',
        logo_url: data.logo_url || '',
        stamp_url: data.stamp_url || '',
        bank_name: data.bank_name || '',
        bank_branch: data.bank_branch || '',
        account_type: data.account_type || '',
        account_number: data.account_number || '',
        account_holder: data.account_holder || '',
        bank_accounts: bankAccountsJson,
        default_bank_account_index: data.default_bank_account_index !== undefined ? data.default_bank_account_index : -1,
        default_tax_type: data.default_tax_type || 'standard',
        default_tax_rate: data.default_tax_rate || 10,
        default_closing_day: data.default_closing_day || '',
        default_payment_day: data.default_payment_day || '',
        show_tax_on_estimate_delivery: data.show_tax_on_estimate_delivery ? 1 : 0,
        estimate_valid_days: data.estimate_valid_days || 30,
        default_delivery_place: data.default_delivery_place || '',
        default_payment_terms: data.default_payment_terms || '',
        default_delivery_date: data.default_delivery_date || '',
        delivery_note_format: data.delivery_note_format || 'half',
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)

    if (error) return handleSupabaseError(c, error, 'company_info update')
  } else {
    const { error } = await supabase
      .from('company_info')
      .insert({
        user_id: DEMO_USER_ID,
        company_name: data.company_name,
        department_name: data.department_name || '',
        person_name: data.person_name || '',
        representative_title: data.representative_title || '',
        representative_name: data.representative_name || '',
        postal_code: data.postal_code || '',
        address: data.address || '',
        address_number: data.address_number || '',
        building_name: data.building_name || '',
        tel: data.tel || '',
        fax: data.fax || '',
        email: data.email || '',
        website: data.website || '',
        invoice_registration_no: data.invoice_registration_no || '',
        logo_url: data.logo_url || '',
        stamp_url: data.stamp_url || '',
        bank_name: data.bank_name || '',
        bank_branch: data.bank_branch || '',
        account_type: data.account_type || '',
        account_number: data.account_number || '',
        account_holder: data.account_holder || '',
        bank_accounts: bankAccountsJson,
        default_bank_account_index: data.default_bank_account_index !== undefined ? data.default_bank_account_index : -1,
        default_tax_type: data.default_tax_type || 'standard',
        default_tax_rate: data.default_tax_rate || 10,
        default_closing_day: data.default_closing_day || '',
        default_payment_day: data.default_payment_day || '',
        show_tax_on_estimate_delivery: data.show_tax_on_estimate_delivery ? 1 : 0,
        estimate_valid_days: data.estimate_valid_days || 30,
        default_delivery_place: data.default_delivery_place || '',
        default_payment_terms: data.default_payment_terms || '',
        default_delivery_date: data.default_delivery_date || '',
        delivery_note_format: data.delivery_note_format || 'half'
      })

    if (error) return handleSupabaseError(c, error, 'company_info insert')
  }
  
  return c.json({ success: true })
})

// 画像アップロード用エンドポイント（Base64で受け取ってそのまま保存）
api.post('/company/upload-image', async (c) => {
  const data = await c.req.json()
  // Base64データをそのまま返す（実際の運用ではR2などに保存）
  return c.json({ url: data.image })
})

// =====================================
// 分類マスタ API
// =====================================

// 最近編集した分類を取得 ※ :id より前に定義
api.get('/categories/recent', async (c) => {
  const limit = c.req.query('limit') || '5'
  const { data, error } = await supabase
    .from('categories')
    .select('id, category_code, category_name, tax_rate, tax_type, updated_at')
    .eq('is_active', 1)
    .eq('user_id', DEMO_USER_ID)
    .order('updated_at', { ascending: false })
    .limit(parseInt(limit))

  if (error) return handleSupabaseError(c, error, 'categories select recent')
  return c.json(data || [])
})

// 次の分類コードを取得 ※ :id より前に定義
api.get('/categories/next-code', async (c) => {
  const { data, error } = await supabase
    .from('categories')
    .select('category_code')
    .like('category_code', 'C%')
    .eq('user_id', DEMO_USER_ID)

  if (error) return handleSupabaseError(c, error, 'categories select code')

  let maxCode = 0
  for (const row of data || []) {
    const code = row.category_code || ''
    const num = parseInt(code.replace(/^C/, ''), 10)
    if (!Number.isNaN(num)) maxCode = Math.max(maxCode, num)
  }
  const nextCode = 'C' + String(maxCode + 1).padStart(3, '0')
  return c.json({ next_code: nextCode })
})

api.get('/categories', async (c) => {
  const search = c.req.query('search')
  
  let query = supabase
    .from('categories')
    .select('*')
    .eq('is_active', 1)
    .eq('user_id', DEMO_USER_ID)

  // 統合検索: 分類コード・分類名・メモを横断検索
  if (search) {
    const searchPattern = `%${search}%`
    query = query.or(
      `category_code.ilike.${searchPattern},category_name.ilike.${searchPattern},notes.ilike.${searchPattern}`
    )
  }

  const { data, error } = await query.order('display_order', { ascending: true }).order('category_name', { ascending: true })
  if (error) return handleSupabaseError(c, error, 'categories select list')
  return c.json(data || [])
})

api.get('/categories/:id', async (c) => {
  const id = c.req.param('id')
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) return handleSupabaseError(c, error, 'categories select one')
  return c.json(data)
})

api.post('/categories', async (c) => {
  const data = await c.req.json()
  const { data: orderData, error: orderError } = await supabase
    .from('categories')
    .select('display_order, category_code')
    .eq('user_id', DEMO_USER_ID)

  if (orderError) return handleSupabaseError(c, orderError, 'categories select order')

  let maxOrder = 0
  let maxCode = 0
  for (const row of orderData || []) {
    if (typeof row.display_order === 'number') {
      maxOrder = Math.max(maxOrder, row.display_order)
    }
    if (row.category_code) {
      const num = parseInt(String(row.category_code).replace(/^C/, ''), 10)
      if (!Number.isNaN(num)) maxCode = Math.max(maxCode, num)
    }
  }

  // 分類コードが空の場合は自動採番
  let categoryCode = data.category_code
  if (!categoryCode) {
    categoryCode = 'C' + String(maxCode + 1).padStart(3, '0')
  }

  const { error } = await supabase
    .from('categories')
    .insert({
      user_id: DEMO_USER_ID,
      category_code: categoryCode,
      category_name: data.category_name,
      tax_rate: data.tax_rate || 10,
      tax_type: data.tax_type || 'standard',
      display_order: maxOrder + 1,
      notes: data.notes || ''
    })

  if (error) return handleSupabaseError(c, error, 'categories insert')
  
  return c.json({ success: true, category_code: categoryCode })
})

api.put('/categories/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  
  const { error } = await supabase
    .from('categories')
    .update({
      category_code: data.category_code || '',
      category_name: data.category_name,
      tax_rate: data.tax_rate,
      tax_type: data.tax_type || 'standard',
      display_order: data.display_order,
      notes: data.notes || '',
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
  
  if (error) return handleSupabaseError(c, error, 'categories update')
  return c.json({ success: true })
})

api.delete('/categories/:id', async (c) => {
  const id = c.req.param('id')
  const { error } = await supabase
    .from('categories')
    .update({ is_active: 0, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return handleSupabaseError(c, error, 'categories deactivate')
  return c.json({ success: true })
})

// =====================================
// 商品マスタ API
// =====================================

// 最近編集した商品を取得 ※ :id より前に定義
api.get('/products/recent', async (c) => {
  const limit = c.req.query('limit') || '5'
  const { data, error } = await supabase
    .from('products')
    .select('id, product_code, product_name, category_id, updated_at, categories(category_name)')
    .eq('is_active', 1)
    .eq('user_id', DEMO_USER_ID)
    .order('updated_at', { ascending: false })
    .limit(parseInt(limit))

  if (error) return handleSupabaseError(c, error, 'products select recent')

  const rows = (data || []).map((row: any) => ({
    ...row,
    category_name: row.categories?.category_name || null
  }))
  return c.json(rows)
})

// 次の商品コードを取得 ※ :id より前に定義
api.get('/products/next-code', async (c) => {
  const { data, error } = await supabase
    .from('products')
    .select('product_code')
    .like('product_code', 'P%')
    .eq('user_id', DEMO_USER_ID)

  if (error) return handleSupabaseError(c, error, 'products select code')

  let maxCode = 0
  for (const row of data || []) {
    const code = row.product_code || ''
    const num = parseInt(code.replace(/^P/, ''), 10)
    if (!Number.isNaN(num)) maxCode = Math.max(maxCode, num)
  }
  const nextCode = 'P' + String(maxCode + 1).padStart(4, '0')
  return c.json({ next_code: nextCode })
})

// 分類内の商品名一覧を取得（サジェスト用）
api.get('/products/by-category/:categoryId', async (c) => {
  const categoryId = c.req.param('categoryId')
  const { data, error } = await supabase
    .from('products')
    .select('product_name')
    .eq('category_id', categoryId)
    .eq('is_active', 1)
    .eq('user_id', DEMO_USER_ID)
    .order('product_name', { ascending: true })

  if (error) return handleSupabaseError(c, error, 'products select by-category')

  const unique = new Set<string>()
  for (const row of data || []) {
    if (row.product_name) unique.add(row.product_name)
  }
  return c.json(Array.from(unique).map((name) => ({ product_name: name })))
})

api.get('/products', async (c) => {
  const categoryId = c.req.query('category_id')
  const search = c.req.query('search')
  const isWholesale = c.req.query('is_wholesale')
  
  let query = supabase
    .from('products')
    .select('*, categories(category_name, category_code, display_order)')
    .eq('is_active', 1)
    .eq('user_id', DEMO_USER_ID)

  if (categoryId) {
    query = query.eq('category_id', categoryId)
  }

  // 統合検索: 商品コード、商品名、JANコード、分類名、備考、メモを横断検索
  if (search) {
    const searchPattern = `%${search}%`
    query = query.or(
      `product_code.ilike.${searchPattern},product_name.ilike.${searchPattern},jan_code.ilike.${searchPattern},remarks.ilike.${searchPattern},notes.ilike.${searchPattern},categories.category_name.ilike.${searchPattern}`
    )
  }

  // 上代商品フィルター
  if (isWholesale !== undefined && isWholesale !== '') {
    query = query.eq('is_wholesale', parseInt(isWholesale))
  }

  const { data, error } = await query
    .order('display_order', { foreignTable: 'categories', ascending: true, nullsFirst: true })
    .order('product_code', { ascending: true })
    .order('product_name', { ascending: true })

  if (error) return handleSupabaseError(c, error, 'products select list')

  const rows = (data || []).map((row: any) => ({
    ...row,
    category_name: row.categories?.category_name || null,
    category_code: row.categories?.category_code || null
  }))
  return c.json(rows)
})

api.get('/products/export.csv', async (c) => {
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('*, categories(category_name, category_code, display_order)')
    .eq('is_active', 1)
    .eq('user_id', DEMO_USER_ID)
    .order('display_order', { foreignTable: 'categories', ascending: true, nullsFirst: true })
    .order('product_code', { ascending: true })
    .order('product_name', { ascending: true })

  if (productsError) return handleSupabaseError(c, productsError, 'products export select')

  const headers: string[] = [
    'product_code',
    'product_name',
    'jan_code',
    'category_name',
    'unit_price',
    'retail_price',
    'cost_price'
  ]
  
  for (let i = 1; i <= 5; i++) {
    headers.push(`price_history_${i}_effective_date`)
    headers.push(`price_history_${i}_cost_price`)
    headers.push(`price_history_${i}_wholesale_price`)
    headers.push(`price_history_${i}_list_price`)
  }
  
  function escapeCsv(value: unknown): string {
    if (value === null || value === undefined) return ''
    const str = String(value)
    if (/[",\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"'
    }
    return str
  }
  
  const rows: string[] = []
  rows.push(headers.join(','))
  
  for (const product of products || []) {
    const { data: history, error: historyError } = await supabase
      .from('product_price_histories')
      .select('effective_date, cost_price, wholesale_price, list_price')
      .eq('product_id', product.id)
      .order('effective_date', { ascending: false })
      .limit(5)

    if (historyError) return handleSupabaseError(c, historyError, 'product_price_histories select')

    const row: string[] = [
      product.product_code || '',
      product.product_name || '',
      product.jan_code || '',
      product.categories?.category_name || '',
      product.unit_price ?? '',
      product.retail_price ?? '',
      product.cost_price ?? ''
    ]
    
    for (let i = 0; i < 5; i++) {
      const item = (history || [])[i]
      row.push(item ? item.effective_date : '')
      row.push(item ? item.cost_price : '')
      row.push(item ? item.wholesale_price : '')
      row.push(item ? item.list_price : '')
    }
    
    rows.push(row.map(escapeCsv).join(','))
  }
  
  const csv = rows.join('\n')
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="products_with_price_history.csv"'
    }
  })
})

api.get('/products/:id', async (c) => {
  const id = c.req.param('id')
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(category_name, category_code, tax_rate, tax_type)')
    .eq('id', id)
    .maybeSingle()

  if (error) return handleSupabaseError(c, error, 'products select one')

  if (!data) {
    return c.json(null)
  }

  return c.json({
    ...data,
    category_name: data.categories?.category_name || null,
    category_code: data.categories?.category_code || null,
    category_tax_rate: data.categories?.tax_rate || null,
    category_tax_type: data.categories?.tax_type || null
  })
})

api.get('/products/:id/price-history', async (c) => {
  const id = c.req.param('id')
  const limitParam = c.req.query('limit')
  const limit = limitParam ? Math.max(1, parseInt(limitParam)) : 3

  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id')
    .eq('id', id)
    .eq('user_id', DEMO_USER_ID)
    .maybeSingle()

  if (productError) return handleSupabaseError(c, productError, 'products select for price-history')
  if (!product) return c.json([])

  const { data, error } = await supabase
    .from('product_price_histories')
    .select('*')
    .eq('product_id', id)
    .order('effective_date', { ascending: false })
    .limit(limit)

  if (error) return handleSupabaseError(c, error, 'product_price_histories select list')
  return c.json(data || [])
})

api.post('/products/:id/price-history', async (c) => {
  const productId = c.req.param('id')
  const data = await c.req.json()
  
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id')
    .eq('id', productId)
    .eq('user_id', DEMO_USER_ID)
    .maybeSingle()
  
  if (productError) return handleSupabaseError(c, productError, 'products select for price-history insert')
  if (!product) {
    return c.json({ error: '商品が見つかりません' }, 404)
  }
  
  const effectiveDate = String(data.effective_date || '')
  if (!effectiveDate) {
    return c.json({ error: '適用日を入力してください' }, 400)
  }
  if (!isValidDateString(effectiveDate)) {
    return c.json({ error: '適用日の形式が不正です' }, 400)
  }
  
  const costPrice = parseNonNegativeNumber(data.cost_price)
  if (costPrice === null) {
    return c.json({ error: '原価を入力してください' }, 400)
  }
  const wholesalePrice = parseNonNegativeNumber(data.wholesale_price)
  if (wholesalePrice === null) {
    return c.json({ error: '下代を入力してください' }, 400)
  }
  const listPrice = parseNonNegativeNumber(data.list_price)
  if (listPrice === null) {
    return c.json({ error: '上代を入力してください' }, 400)
  }
  
  const historyId = crypto.randomUUID()
  try {
    const { error } = await supabase
      .from('product_price_histories')
      .insert({
        id: historyId,
        product_id: productId,
        effective_date: effectiveDate,
        cost_price: costPrice,
        wholesale_price: wholesalePrice,
        list_price: listPrice
      })

    if (error) {
      if (error.code === '23505') {
        return c.json({ error: '同じ適用日の履歴が既にあります' }, 409)
      }
      return handleSupabaseError(c, error, 'product_price_histories insert')
    }
  } catch (e) {
    const message = String(e)
    if (/unique/i.test(message)) {
      return c.json({ error: '同じ適用日の履歴が既にあります' }, 409)
    }
    return handleSupabaseError(c, e, 'product_price_histories insert catch')
  }
  
  return c.json({ success: true, id: historyId })
})

api.put('/products/:id/price-history/:historyId', async (c) => {
  const productId = c.req.param('id')
  const historyId = c.req.param('historyId')
  const data = await c.req.json()
  
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id')
    .eq('id', productId)
    .eq('user_id', DEMO_USER_ID)
    .maybeSingle()
  
  if (productError) return handleSupabaseError(c, productError, 'products select for price-history update')
  if (!product) {
    return c.json({ error: '商品が見つかりません' }, 404)
  }
  
  const effectiveDate = String(data.effective_date || '')
  if (!effectiveDate) {
    return c.json({ error: '適用日を入力してください' }, 400)
  }
  if (!isValidDateString(effectiveDate)) {
    return c.json({ error: '適用日の形式が不正です' }, 400)
  }
  
  const costPrice = parseNonNegativeNumber(data.cost_price)
  if (costPrice === null) {
    return c.json({ error: '原価を入力してください' }, 400)
  }
  const wholesalePrice = parseNonNegativeNumber(data.wholesale_price)
  if (wholesalePrice === null) {
    return c.json({ error: '下代を入力してください' }, 400)
  }
  const listPrice = parseNonNegativeNumber(data.list_price)
  if (listPrice === null) {
    return c.json({ error: '上代を入力してください' }, 400)
  }
  
  try {
    const { error } = await supabase
      .from('product_price_histories')
      .update({
        effective_date: effectiveDate,
        cost_price: costPrice,
        wholesale_price: wholesalePrice,
        list_price: listPrice,
        updated_at: new Date().toISOString()
      })
      .eq('id', historyId)
      .eq('product_id', productId)

    if (error) {
      if (error.code === '23505') {
        return c.json({ error: '同じ適用日の履歴が既にあります' }, 409)
      }
      return handleSupabaseError(c, error, 'product_price_histories update')
    }
  } catch (e) {
    const message = String(e)
    if (/unique/i.test(message)) {
      return c.json({ error: '同じ適用日の履歴が既にあります' }, 409)
    }
    return handleSupabaseError(c, e, 'product_price_histories update catch')
  }
  
  return c.json({ success: true })
})

api.delete('/products/:id/price-history/:historyId', async (c) => {
  const productId = c.req.param('id')
  const historyId = c.req.param('historyId')
  
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id')
    .eq('id', productId)
    .eq('user_id', DEMO_USER_ID)
    .maybeSingle()
  
  if (productError) return handleSupabaseError(c, productError, 'products select for price-history delete')
  if (!product) {
    return c.json({ error: '商品が見つかりません' }, 404)
  }
  
  const { error } = await supabase
    .from('product_price_histories')
    .delete()
    .eq('id', historyId)
    .eq('product_id', productId)
  
  if (error) return handleSupabaseError(c, error, 'product_price_histories delete')
  
  return c.json({ success: true })
})

api.post('/products', async (c) => {
  const payload = await c.req.json()
  const data = payload
  const isWholesale = Boolean(Number(data.is_wholesale ?? 0))
  
  // 商品コードが空の場合は自動採番
  let productCode = normalizeProductCode(data.product_code)
  if (!productCode) {
    const { data: codeRows, error: codeError } = await supabase
      .from('products')
      .select('product_code')
      .like('product_code', 'P%')
      .eq('user_id', DEMO_USER_ID)

    if (codeError) {
      const message = codeError instanceof Error ? codeError.message : JSON.stringify(codeError)
      console.error('❌ POST /products code fetch error', { productCode, payload, error: codeError })
      return c.json({ success: false, error: message }, 400)
    }

    let maxCode = 0
    for (const row of codeRows || []) {
      const code = row.product_code || ''
      const num = parseInt(code.replace(/^P/, ''), 10)
      if (!Number.isNaN(num)) maxCode = Math.max(maxCode, num)
    }
    productCode = 'P' + String(maxCode + 1).padStart(4, '0')
  }
  
  const janCode = normalizeJan(data.jan_code)
  
  // 下代計算: 上代 × 掛け率 / 100
  const unitPrice = isWholesale 
    ? Math.round(data.retail_price * data.discount_rate / 100) 
    : data.unit_price
  
  const { error } = await supabase
    .from('products')
    .insert({
      user_id: DEMO_USER_ID,
      product_name: data.product_name,
      product_code: productCode,
      jan_code: janCode,
      category_id: data.category_id || null,
      unit_price: unitPrice,
      cost_price: data.cost_price || 0,
      retail_price: data.retail_price || 0,
      discount_rate: data.discount_rate || 100,
      tax_rate: data.tax_rate || null,
      min_lot: data.min_lot || 1,
      unit: data.unit || '個',
      is_wholesale: isWholesale,
      remarks: data.remarks || '',
      notes: data.notes || ''
    })

    if (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error)
      console.error("❌ POST /products supabase insert error", {
        productCode,
        payload,
        error,
      })
      return c.json({ success: false, error: message }, 400)
    }
    
    return c.json({ success: true, product_code: productCode })
    
})

api.put('/products/:id', async (c) => {
  const id = c.req.param('id')
  const payload = await c.req.json()
  const data = payload
  const isWholesale = Boolean(Number(data.is_wholesale ?? 0))
  
  let productCode = normalizeProductCode(data.product_code)
  if (!productCode) {
    const { data: codeRows, error: codeError } = await supabase
      .from('products')
      .select('product_code')
      .like('product_code', 'P%')
      .eq('user_id', DEMO_USER_ID)

    if (codeError) {
      const message = codeError instanceof Error ? codeError.message : JSON.stringify(codeError)
      console.error('❌ PUT /products/:id code fetch error', { id, productCode, payload, error: codeError })
      return c.json({ success: false, error: message }, 400)
    }

    let maxCode = 0
    for (const row of codeRows || []) {
      const code = row.product_code || ''
      const num = parseInt(code.replace(/^P/, ''), 10)
      if (!Number.isNaN(num)) maxCode = Math.max(maxCode, num)
    }
    productCode = 'P' + String(maxCode + 1).padStart(4, '0')
  }
  
  const janCode = normalizeJan(data.jan_code)
  
  // 下代計算: 上代 × 掛け率 / 100
  const unitPrice = isWholesale 
    ? Math.round(data.retail_price * data.discount_rate / 100) 
    : data.unit_price
  
  const { error } = await supabase
    .from('products')
    .update({
      product_name: data.product_name,
      product_code: productCode,
      jan_code: janCode,
      category_id: data.category_id || null,
      unit_price: unitPrice,
      cost_price: data.cost_price || 0,
      retail_price: data.retail_price || 0,
      discount_rate: data.discount_rate || 100,
      tax_rate: data.tax_rate || null,
      min_lot: data.min_lot || 1,
      unit: data.unit || '個',
      is_wholesale: isWholesale,
      remarks: data.remarks || '',
      notes: data.notes || '',
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
  
  if (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    console.error('PUT update error', { id, productCode, payload, error })
    return c.json({ success: false, error: message }, 400)
  }
  return c.json({ success: true, product_code: productCode })
})

api.delete('/products/:id', async (c) => {
  const id = c.req.param('id')
  const { error } = await supabase
    .from('products')
    .update({ is_active: 0, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return handleSupabaseError(c, error, 'products deactivate')
  return c.json({ success: true })
})

// =====================================
// 取引先マスタ API
// =====================================

// 最近編集した取引先を取得 ※ :id より前に定義する必要あり
api.get('/clients/recent', async (c) => {
  const limit = c.req.query('limit') || '5'
  const { data, error } = await supabase
    .from('clients')
    .select('id, client_name, client_code, updated_at')
    .eq('is_active', 1)
    .eq('user_id', DEMO_USER_ID)
    .order('updated_at', { ascending: false })
    .limit(parseInt(limit))

  if (error) return handleSupabaseError(c, error, 'clients select recent')
  return c.json(data || [])
})

// 次の取引先コードを取得 ※ :id より前に定義する必要あり
api.get('/clients/next-code', async (c) => {
  const { data, error } = await supabase
    .from('clients')
    .select('client_code')
    .eq('user_id', DEMO_USER_ID)

  if (error) return handleSupabaseError(c, error, 'clients select code')

  let maxCode = 100
  for (const row of data || []) {
    const code = String(row.client_code || '')
    if (/^\d+$/.test(code)) {
      const num = parseInt(code, 10)
      if (!Number.isNaN(num)) maxCode = Math.max(maxCode, num)
    }
  }
  const nextCode = String(maxCode + 1)
  return c.json({ next_code: nextCode })
})

api.get('/clients', async (c) => {
  const search = c.req.query('search')
  const useWholesale = c.req.query('use_wholesale')
  
  let query = supabase
    .from('clients')
    .select('*')
    .eq('is_active', 1)
    .eq('user_id', DEMO_USER_ID)

  // 統合検索: 取引先名・担当者名・代表者名・電話・携帯・メール・締め日を横断検索
  if (search) {
    const searchPattern = `%${search}%`
    query = query.or(
      `client_name.ilike.${searchPattern},person_name.ilike.${searchPattern},representative_name.ilike.${searchPattern},tel.ilike.${searchPattern},mobile.ilike.${searchPattern},email.ilike.${searchPattern},closing_day.ilike.${searchPattern}`
    )
  }

  // 上代/下代フィルター（プルダウンで残す）
  if (useWholesale !== undefined && useWholesale !== '') {
    query = query.eq('use_wholesale_price', parseInt(useWholesale))
  }

  const { data, error } = await query
    .order('client_code', { ascending: true })
    .order('client_name', { ascending: true })

  if (error) return handleSupabaseError(c, error, 'clients select list')
  return c.json(data || [])
})

api.get('/clients/:id', async (c) => {
  const id = c.req.param('id')
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .eq('user_id', DEMO_USER_ID)
    .maybeSingle()

  if (error) return handleSupabaseError(c, error, 'clients select one')
  return c.json(data)
})

api.post('/clients', async (c) => {
  const data = await c.req.json()
  
  // 取引先コードが空の場合は自動採番
  let clientCode = data.client_code
  if (!clientCode) {
    const { data: codes, error } = await supabase
      .from('clients')
      .select('client_code')
      .eq('user_id', DEMO_USER_ID)

    if (error) return handleSupabaseError(c, error, 'clients select code')

    let maxCode = 100
    for (const row of codes || []) {
      const code = String(row.client_code || '')
      if (/^\d+$/.test(code)) {
        const num = parseInt(code, 10)
        if (!Number.isNaN(num)) maxCode = Math.max(maxCode, num)
      }
    }
    clientCode = String(maxCode + 1)
  }
  
  const { error } = await supabase
    .from('clients')
    .insert({
      user_id: DEMO_USER_ID,
      client_name: data.client_name,
      department_name: data.department_name || '',
      postal_code: data.postal_code || '',
      address: data.address || '',
      address_number: data.address_number || '',
      building_name: data.building_name || '',
      client_code: clientCode,
      person_name: data.person_name || '',
      email: data.email || '',
      closing_day: data.closing_day || '',
      payment_day: data.payment_day || '',
      use_wholesale_price: data.use_wholesale_price || 0,
      discount_rate: data.discount_rate || 100,
      tel: data.tel || '',
      fax: data.fax || '',
      mobile: data.mobile || '',
      website: data.website || '',
      bank_name: data.bank_name || '',
      bank_branch: data.bank_branch || '',
      bank_account_type: data.bank_account_type || '',
      bank_account_number: data.bank_account_number || '',
      bank_account_holder: data.bank_account_holder || '',
      representative_title: data.representative_title || '',
      representative_name: data.representative_name || '',
      notes: data.notes || '',
      tax_display_setting: data.tax_display_setting || 'default',
      is_individual: data.is_individual || 0
    })

  if (error) return handleSupabaseError(c, error, 'clients insert')
  
  return c.json({ success: true, client_code: clientCode })
})

api.put('/clients/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  
  const { error } = await supabase
    .from('clients')
    .update({
      client_name: data.client_name,
      department_name: data.department_name || '',
      postal_code: data.postal_code || '',
      address: data.address || '',
      address_number: data.address_number || '',
      building_name: data.building_name || '',
      client_code: data.client_code || '',
      person_name: data.person_name || '',
      email: data.email || '',
      closing_day: data.closing_day || '',
      payment_day: data.payment_day || '',
      use_wholesale_price: data.use_wholesale_price || 0,
      discount_rate: data.discount_rate || 100,
      tel: data.tel || '',
      fax: data.fax || '',
      mobile: data.mobile || '',
      website: data.website || '',
      bank_name: data.bank_name || '',
      bank_branch: data.bank_branch || '',
      bank_account_type: data.bank_account_type || '',
      bank_account_number: data.bank_account_number || '',
      bank_account_holder: data.bank_account_holder || '',
      representative_title: data.representative_title || '',
      representative_name: data.representative_name || '',
      notes: data.notes || '',
      tax_display_setting: data.tax_display_setting || 'default',
      is_individual: data.is_individual || 0,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
  
  if (error) return handleSupabaseError(c, error, 'clients update')
  return c.json({ success: true })
})

api.delete('/clients/:id', async (c) => {
  const id = c.req.param('id')
  const { error } = await supabase
    .from('clients')
    .update({ is_active: 0, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return handleSupabaseError(c, error, 'clients deactivate')
  return c.json({ success: true })
})

// =====================================
// 納品データ API
// =====================================

// 最近編集した納品
api.get('/deliveries/recent', async (c) => {
  const limit = c.req.query('limit') || '5'
  const { data, error } = await supabase
    .from('deliveries')
    .select('*, clients(client_name)')
    .eq('user_id', DEMO_USER_ID)
    .order('updated_at', { ascending: false })
    .limit(parseInt(limit))

  if (error) return handleSupabaseError(c, error, 'deliveries select recent')

  const rows = (data || []).map((row: any) => ({
    ...row,
    client_name: row.clients?.client_name || null,
    delivery_display_no: row.delivery_no || (row.id ? `DEL-${String(row.id).padStart(6, '0')}` : null),
    delivery_number: row.delivery_no || null
  }))
  return c.json(rows)
})

// 次の納品番号を取得
api.get('/deliveries/next-no', async (c) => {
  const queryDate = c.req.query('doc_date') || c.req.query('date')
  const today = new Date().toISOString().split('T')[0]
  const docDate = queryDate && queryDate.length >= 10 ? queryDate : today
  const requestUrl = c.req.url
  const query = {
    doc_date: c.req.query('doc_date'),
    date: c.req.query('date')
  }

  if (isDev) {
    const { error: pingError } = await supabase
      .from('document_number_sequences')
      .select('doc_type')
      .limit(1)
    if (pingError) {
      console.error('[next-no][delivery][ping]', {
        requestUrl,
        query,
        docDate,
        error: {
          code: pingError.code,
          message: pingError.message,
          details: pingError.details,
          hint: pingError.hint
        }
      })
    } else {
      console.log('[next-no][delivery][ping]', { requestUrl, query, docDate, ok: true })
    }
  }

  const { data, error } = await supabase.rpc('next_document_no', {
    p_doc_type: 'delivery',
    p_doc_date: docDate
  })

  if (error) {
    const responseBody = {
      success: false,
      error: 'RPC next_document_no failed (delivery)',
      rpc_error_code: error.code || null,
      rpc_error_message: error.message || null,
      rpc_error_details: error.details || null,
      rpc_error_hint: error.hint || null
    }
    console.error('[next-no][delivery][rpc-error]', {
      requestUrl,
      query,
      docDate,
      rpc: responseBody,
      status: 500
    })
    return c.json(responseBody, 500)
  }

  if (isDev) {
    console.log('[next-no][delivery][rpc-ok]', {
      requestUrl,
      query,
      docDate,
      status: 200,
      body: { next_no: data }
    })
  }
  return c.json({ next_no: data })
})

api.get('/deliveries', async (c) => {
  const clientId = c.req.query('client_id')
  const search = c.req.query('search')
  const status = c.req.query('status')
  const month = c.req.query('month')
  
  let query = supabase
    .from('deliveries')
    .select('*, clients(client_name)')
    .eq('user_id', DEMO_USER_ID)

  if (clientId) {
    query = query.eq('client_id', clientId)
  }

  if (search) {
    const searchPattern = `%${search}%`
    query = query.or(
      `delivery_no.ilike.${searchPattern},notes.ilike.${searchPattern},clients.client_name.ilike.${searchPattern}`
    )
  }

  if (status) {
    query = query.eq('status', status)
  }

  if (month) {
    query = query.like('delivery_date', `${month}%`)
  }

  const { data, error } = await query
    .order('delivery_date', { ascending: false })
    .order('id', { ascending: false })

  if (error) return handleSupabaseError(c, error, 'deliveries select list')

  const rows = (data || []).map((row: any) => ({
    ...row,
    client_name: row.clients?.client_name || null,
    delivery_display_no: row.delivery_no || (row.id ? `DEL-${String(row.id).padStart(6, '0')}` : null),
    delivery_number: row.delivery_no || null
  }))
  return c.json(rows)
})

api.get('/deliveries/:id', async (c) => {
  const id = c.req.param('id')
  const { data: delivery, error: deliveryError } = await supabase
    .from('deliveries')
    .select('*, clients(client_name)')
    .eq('id', id)
    .eq('user_id', DEMO_USER_ID)
    .maybeSingle()

  if (deliveryError) return handleSupabaseError(c, deliveryError, 'deliveries select one')

  const { data: items, error: itemsError } = await supabase
    .from('delivery_items')
    .select('*')
    .eq('delivery_id', id)
    .order('display_order', { ascending: true })

  if (itemsError) return handleSupabaseError(c, itemsError, 'delivery_items select')

  return c.json({
    ...(delivery || {}),
    client_name: delivery?.clients?.client_name || null,
    items: items || []
  })
})

// 納品書番号生成
api.get('/deliveries/next-number', async (c) => {
  const clientId = c.req.query('client_id')
  const date = c.req.query('date') || new Date().toISOString().split('T')[0]
  
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('client_code')
    .eq('id', clientId)
    .eq('user_id', DEMO_USER_ID)
    .maybeSingle()

  if (clientError) return handleSupabaseError(c, clientError, 'clients select for deliveries next-number')
  
  const clientCode = client?.client_code || '000'
  const year = date.substring(2, 4)
  const monthDay = date.substring(5, 7) + date.substring(8, 10)
  
  // 同日同取引先の既存納品書をカウント
  const { count: existingCount, error: existingError } = await supabase
    .from('deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('delivery_date', date)
    .eq('client_id', clientId)
    .eq('user_id', DEMO_USER_ID)

  if (existingError) return handleSupabaseError(c, existingError, 'deliveries select count')
  
  const seq = (existingCount || 0) + 1
  const deliveryNo = seq > 1 
    ? `DS${year}-${clientCode}-${monthDay}-${String(seq).padStart(2, '0')}`
    : `DS${year}-${clientCode}-${monthDay}`
  
  return c.json({ delivery_no: deliveryNo })
})

api.post('/deliveries', async (c) => {
  const data = await c.req.json()
  
  // 小計・税・合計計算（税率別）
  let subtotal = 0
  let totalTax = 0
  for (const item of data.items) {
    const amount = item.quantity * item.unit_price
    subtotal += amount
    totalTax += Math.floor(amount * getTaxRate(item.tax_rate) / 100)
  }
  const totalAmount = subtotal + totalTax
  
  const { data: delivery, error: deliveryError } = await supabase
    .from('deliveries')
    .insert({
      user_id: DEMO_USER_ID,
      delivery_no: data.delivery_no,
      delivery_date: data.delivery_date,
      client_id: data.client_id,
      subject: data.subject || '',
      subtotal,
      tax_amount: totalTax,
      total_amount: totalAmount,
      notes: data.notes || '',
      status: data.status || 'draft'
    })
    .select('id')
    .maybeSingle()

  if (deliveryError) return handleSupabaseError(c, deliveryError, 'deliveries insert')
  const deliveryId = delivery?.id
  
  // 明細を追加
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i]
    const { error: itemError } = await supabase
      .from('delivery_items')
      .insert({
        delivery_id: deliveryId,
        product_id: item.product_id || null,
        product_name: item.product_name,
        jan_code: item.jan_code || '',
        category_id: item.category_id || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: getTaxRate(item.tax_rate),
        amount: item.quantity * item.unit_price,
        notes: item.notes || '',
        display_order: i + 1
      })

    if (itemError) return handleSupabaseError(c, itemError, 'delivery_items insert')
  }
  
  return c.json({ success: true, id: deliveryId })
})

api.put('/deliveries/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  
  // 小計・税・合計計算（税率別）
  let subtotal = 0
  let totalTax = 0
  for (const item of data.items) {
    const amount = item.quantity * item.unit_price
    subtotal += amount
    totalTax += Math.floor(amount * getTaxRate(item.tax_rate) / 100)
  }
  const totalAmount = subtotal + totalTax
  
  const { error: deliveryError } = await supabase
    .from('deliveries')
    .update({
      delivery_date: data.delivery_date,
      client_id: data.client_id,
      subject: data.subject || '',
      subtotal,
      tax_amount: totalTax,
      total_amount: totalAmount,
      notes: data.notes || '',
      status: data.status || 'draft',
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', DEMO_USER_ID)

  if (deliveryError) return handleSupabaseError(c, deliveryError, 'deliveries update')
  
  // 既存明細を削除
  const { error: deleteError } = await supabase
    .from('delivery_items')
    .delete()
    .eq('delivery_id', id)

  if (deleteError) return handleSupabaseError(c, deleteError, 'delivery_items delete')
  
  // 新しい明細を追加
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i]
    const { error: itemError } = await supabase
      .from('delivery_items')
      .insert({
        delivery_id: id,
        product_id: item.product_id || null,
        product_name: item.product_name,
        jan_code: item.jan_code || '',
        category_id: item.category_id || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: getTaxRate(item.tax_rate),
        amount: item.quantity * item.unit_price,
        notes: item.notes || '',
        display_order: i + 1
      })

    if (itemError) return handleSupabaseError(c, itemError, 'delivery_items insert')
  }
  
  return c.json({ success: true })
})

// ステータスのみ更新
api.patch('/deliveries/:id/status', async (c) => {
  const id = c.req.param('id')
  const { status } = await c.req.json()
  
  const { error } = await supabase
    .from('deliveries')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', DEMO_USER_ID)
  
  if (error) return handleSupabaseError(c, error, 'deliveries update status')
  return c.json({ success: true })
})

api.delete('/deliveries/:id', async (c) => {
  const id = c.req.param('id')
  const { error: itemsError } = await supabase
    .from('delivery_items')
    .delete()
    .eq('delivery_id', id)

  if (itemsError) return handleSupabaseError(c, itemsError, 'delivery_items delete')

  const { error: deliveryError } = await supabase
    .from('deliveries')
    .delete()
    .eq('id', id)
    .eq('user_id', DEMO_USER_ID)

  if (deliveryError) return handleSupabaseError(c, deliveryError, 'deliveries delete')
  return c.json({ success: true })
})

// =====================================
// 見積データ API
// =====================================

// 最近編集した見積を取得
api.get('/estimates/recent', async (c) => {
  try {
    const limitParam = c.req.query('limit')
    const parsedLimit = Number(limitParam)
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 5
    const { data, error } = await supabase
      .from('estimates')
      .select('id, estimate_no, estimate_date, total_amount, status, updated_at, clients(client_name)')
      .eq('user_id', DEMO_USER_ID)
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (error) return handleSupabaseError(c, error, 'estimates select recent')

    const rows = (data || []).map((row: any) => ({
      ...row,
      client_name: row.clients?.client_name || null,
      estimate_display_no: row.estimate_no || (row.id ? `EST-${String(row.id).padStart(6, '0')}` : null),
      estimate_number: row.estimate_no || null
    }))
    return c.json(rows, 200)
  } catch (err) {
    return handleSupabaseError(c, err, 'estimates recent catch')
  }
})

// 次の見積番号を取得
api.get('/estimates/next-no', async (c) => {
  const queryDate = c.req.query('doc_date') || c.req.query('date')
  const today = new Date().toISOString().split('T')[0]
  const docDate = queryDate && queryDate.length >= 10 ? queryDate : today
  const requestUrl = c.req.url
  const query = {
    doc_date: c.req.query('doc_date'),
    date: c.req.query('date')
  }

  if (isDev) {
    const { error: pingError } = await supabase
      .from('document_number_sequences')
      .select('doc_type')
      .limit(1)
    if (pingError) {
      console.error('[next-no][estimate][ping]', {
        requestUrl,
        query,
        docDate,
        error: {
          code: pingError.code,
          message: pingError.message,
          details: pingError.details,
          hint: pingError.hint
        }
      })
    } else {
      console.log('[next-no][estimate][ping]', { requestUrl, query, docDate, ok: true })
    }
  }

  const { data, error } = await supabase.rpc('next_document_no', {
    p_doc_type: 'estimate',
    p_doc_date: docDate
  })

  if (error) {
    const responseBody = {
      success: false,
      error: 'RPC next_document_no failed (estimate)',
      rpc_error_code: error.code || null,
      rpc_error_message: error.message || null,
      rpc_error_details: error.details || null,
      rpc_error_hint: error.hint || null
    }
    console.error('[next-no][estimate][rpc-error]', {
      requestUrl,
      query,
      docDate,
      rpc: responseBody,
      status: 500
    })
    return c.json(responseBody, 500)
  }

  if (isDev) {
    console.log('[next-no][estimate][rpc-ok]', {
      requestUrl,
      query,
      docDate,
      status: 200,
      body: { next_no: data }
    })
  }
  return c.json({ next_no: data })
})

api.get('/estimates', async (c) => {
  const clientId = c.req.query('client_id')
  const search = c.req.query('search')
  const status = c.req.query('status')
  const month = c.req.query('month')  // 年月フィルター (YYYY-MM形式)
  
  let query = supabase
    .from('estimates')
    .select('*, clients(client_name)')
    .eq('user_id', DEMO_USER_ID)

  if (clientId) {
    query = query.eq('client_id', clientId)
  }

  if (search) {
    const searchPattern = `%${search}%`
    query = query.or(
      `estimate_no.ilike.${searchPattern},notes.ilike.${searchPattern},clients.client_name.ilike.${searchPattern}`
    )
  }

  if (status) {
    query = query.eq('status', status)
  }

  if (month) {
    query = query.like('estimate_date', `${month}%`)
  }

  const { data, error } = await query
    .order('estimate_date', { ascending: false })
    .order('id', { ascending: false })

  if (error) return handleSupabaseError(c, error, 'estimates select list')

  const rows = (data || []).map((row: any) => ({
    ...row,
    client_name: row.clients?.client_name || null,
    estimate_display_no: row.estimate_no || (row.id ? `EST-${String(row.id).padStart(6, '0')}` : null),
    estimate_number: row.estimate_no || null
  }))
  return c.json(rows)
})

api.get('/estimates/:id', async (c) => {
  const id = c.req.param('id')
  const { data: estimate, error: estimateError } = await supabase
    .from('estimates')
    .select('*, clients(client_name)')
    .eq('id', id)
    .eq('user_id', DEMO_USER_ID)
    .maybeSingle()

  if (estimateError) return handleSupabaseError(c, estimateError, 'estimates select one')

  const { data: items, error: itemsError } = await supabase
    .from('estimate_items')
    .select('*')
    .eq('estimate_id', id)
    .order('display_order', { ascending: true })

  if (itemsError) return handleSupabaseError(c, itemsError, 'estimate_items select')

  const estimateNumber = estimate?.estimate_no || null
  const estimateDisplayNo = estimateNumber || (estimate?.id ? `EST-${String(estimate.id).padStart(6, '0')}` : null)

  return c.json({
    ...(estimate || {}),
    estimate_no: estimateNumber,
    estimate_number: estimateNumber,
    estimate_display_no: estimateDisplayNo,
    client_name: estimate?.clients?.client_name || null,
    items: items || []
  })
})

// 取引先の最新見積単価を取得
api.get('/estimates/latest-price', async (c) => {
  const clientId = c.req.query('client_id')
  const productName = c.req.query('product_name')
  
  const { data, error } = await supabase
    .from('estimate_items')
    .select('unit_price, retail_price, estimates(estimate_date, client_id, user_id)')
    .eq('product_name', productName)
    .eq('estimates.client_id', clientId)
    .eq('estimates.user_id', DEMO_USER_ID)
    .order('estimate_date', { foreignTable: 'estimates', ascending: false })
    .order('estimate_id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return handleSupabaseError(c, error, 'estimate_items select latest-price')

  if (!data) return c.json(null)
  return c.json({ unit_price: data.unit_price, retail_price: data.retail_price })
})

api.post('/estimates', async (c) => {
  const data = await c.req.json()
  
  // 小計・税率別消費税・合計計算
  let subtotal = 0
  const taxByRate: { [key: number]: number } = {}
  
  for (const item of data.items) {
    const amount = item.quantity * item.unit_price
    subtotal += amount
    const rate = getTaxRate(item.tax_rate)
    if (!taxByRate[rate]) taxByRate[rate] = 0
    taxByRate[rate] += Math.floor(amount * rate / 100)
  }
  
  const taxAmount = Object.values(taxByRate).reduce((sum, tax) => sum + tax, 0)
  const totalAmount = subtotal + taxAmount
  
  const { data: estimate, error: estimateError } = await supabase
    .from('estimates')
    .insert({
      user_id: DEMO_USER_ID,
      estimate_no: data.estimate_no,
      estimate_date: data.estimate_date,
      client_id: data.client_id,
      valid_until: data.valid_until || null,
      valid_until_text: data.valid_until_text || '',
      subject: data.subject || '',
      subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      notes: data.notes || '',
      status: data.status || 'draft',
      delivery_place: data.delivery_place || '',
      payment_terms: data.payment_terms || '',
      delivery_date_text: data.delivery_date_text || ''
    })
    .select('id')
    .maybeSingle()

  if (estimateError) return handleSupabaseError(c, estimateError, 'estimates insert')
  const estimateId = estimate?.id
  
  // 明細を追加
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i]
    const { error: itemError } = await supabase
      .from('estimate_items')
      .insert({
        estimate_id: estimateId,
        product_id: item.product_id || null,
        product_name: item.product_name,
        jan_code: item.jan_code || '',
        quantity: item.quantity,
        unit_price: item.unit_price,
        retail_price: item.retail_price || 0,
        use_retail_price: item.use_retail_price || 0,
        tax_rate: getTaxRate(item.tax_rate),
        amount: item.quantity * item.unit_price,
        notes: item.notes || '',
        display_order: i + 1,
        item_notes: item.item_notes || ''
      })

    if (itemError) return handleSupabaseError(c, itemError, 'estimate_items insert')
  }
  
  return c.json({ success: true, id: estimateId })
})

api.put('/estimates/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  
  // 小計・税率別消費税・合計計算
  let subtotal = 0
  const taxByRate: { [key: number]: number } = {}
  
  for (const item of data.items) {
    const amount = item.quantity * item.unit_price
    subtotal += amount
    const rate = getTaxRate(item.tax_rate)
    if (!taxByRate[rate]) taxByRate[rate] = 0
    taxByRate[rate] += Math.floor(amount * rate / 100)
  }
  
  const taxAmount = Object.values(taxByRate).reduce((sum, tax) => sum + tax, 0)
  const totalAmount = subtotal + taxAmount
  
  const { error: estimateError } = await supabase
    .from('estimates')
    .update({
      estimate_date: data.estimate_date,
      client_id: data.client_id,
      valid_until: data.valid_until || null,
      valid_until_text: data.valid_until_text || '',
      subject: data.subject || '',
      subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      notes: data.notes || '',
      status: data.status || 'draft',
      delivery_place: data.delivery_place || '',
      payment_terms: data.payment_terms || '',
      delivery_date_text: data.delivery_date_text || '',
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', DEMO_USER_ID)

  if (estimateError) return handleSupabaseError(c, estimateError, 'estimates update')
  
  // 既存明細を削除
  const { error: deleteError } = await supabase
    .from('estimate_items')
    .delete()
    .eq('estimate_id', id)

  if (deleteError) return handleSupabaseError(c, deleteError, 'estimate_items delete')
  
  // 新しい明細を追加
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i]
    const { error: itemError } = await supabase
      .from('estimate_items')
      .insert({
        estimate_id: id,
        product_id: item.product_id || null,
        product_name: item.product_name,
        jan_code: item.jan_code || '',
        quantity: item.quantity,
        unit_price: item.unit_price,
        retail_price: item.retail_price || 0,
        use_retail_price: item.use_retail_price || 0,
        tax_rate: getTaxRate(item.tax_rate),
        amount: item.quantity * item.unit_price,
        notes: item.notes || '',
        display_order: i + 1,
        item_notes: item.item_notes || ''
      })

    if (itemError) return handleSupabaseError(c, itemError, 'estimate_items insert')
  }
  
  return c.json({ success: true })
})

// ステータスのみ更新
api.patch('/estimates/:id/status', async (c) => {
  const id = c.req.param('id')
  const { status } = await c.req.json()
  
  const { error } = await supabase
    .from('estimates')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', DEMO_USER_ID)
  
  if (error) return handleSupabaseError(c, error, 'estimates update status')
  return c.json({ success: true })
})

api.delete('/estimates/:id', async (c) => {
  const id = c.req.param('id')
  const { error: itemsError } = await supabase
    .from('estimate_items')
    .delete()
    .eq('estimate_id', id)

  if (itemsError) return handleSupabaseError(c, itemsError, 'estimate_items delete')

  const { error: estimateError } = await supabase
    .from('estimates')
    .delete()
    .eq('id', id)
    .eq('user_id', DEMO_USER_ID)

  if (estimateError) return handleSupabaseError(c, estimateError, 'estimates delete')
  return c.json({ success: true })
})

// =====================================
// ダッシュボード API
// =====================================
api.get('/dashboard/summary', async (c) => {
  const defaultSummary = {
    monthly_sales: 0,
    client_sales: [],
    uninvoiced_count: 0,
    monthly_estimates: 0,
    monthly_deliveries: 0,
    monthly_invoices: 0,
    unpaid_invoices: {
      count: 0,
      total: 0
    },
    monthly_sales_chart: []
  }

  try {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const monthStartStr = monthStart.toISOString().split('T')[0]
    const nextMonthStartStr = nextMonthStart.toISOString().split('T')[0]
    
    // 今月の売上
    const { data: monthlyDeliveryRows, error: monthlyDeliveryError } = await supabase
      .from('deliveries')
      .select('subtotal')
      .eq('user_id', DEMO_USER_ID)
      .gte('delivery_date', monthStartStr)
      .lt('delivery_date', nextMonthStartStr)

    if (monthlyDeliveryError) return handleSupabaseError(c, monthlyDeliveryError, 'deliveries select monthly sales')
    const monthlySalesTotal = (monthlyDeliveryRows || []).reduce((sum, row) => sum + (row.subtotal || 0), 0)
    
    // 取引先別売上
    const { data: clientSalesRows, error: clientSalesError } = await supabase
      .from('deliveries')
      .select('client_id, subtotal, clients(client_name)')
      .eq('user_id', DEMO_USER_ID)
      .gte('delivery_date', monthStartStr)
      .lt('delivery_date', nextMonthStartStr)

    if (clientSalesError) return handleSupabaseError(c, clientSalesError, 'deliveries select client sales')

    const clientSalesMap = new Map<string, { client_name: string, total: number }>()
    for (const row of clientSalesRows || []) {
      const clientId = String(row.client_id || '')
      if (!clientId) continue
      const existing = clientSalesMap.get(clientId)
      const name = row.clients?.client_name || ''
      const subtotal = row.subtotal || 0
      if (existing) {
        existing.total += subtotal
      } else {
        clientSalesMap.set(clientId, { client_name: name, total: subtotal })
      }
    }

    const clientSales = Array.from(clientSalesMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
    
    // 未請求納品書数
    const { count: uninvoicedCount, error: uninvoicedError } = await supabase
      .from('deliveries')
      .select('id', { count: 'exact', head: true })
      .is('invoice_id', null)
      .eq('user_id', DEMO_USER_ID)

    if (uninvoicedError) return handleSupabaseError(c, uninvoicedError, 'deliveries select uninvoiced count')
    
    // 今月の見積数
    const { count: monthlyEstimatesCount, error: monthlyEstimatesError } = await supabase
      .from('estimates')
      .select('id', { count: 'exact', head: true })
      .gte('estimate_date', monthStartStr)
      .lt('estimate_date', nextMonthStartStr)
      .eq('user_id', DEMO_USER_ID)

    if (monthlyEstimatesError) return handleSupabaseError(c, monthlyEstimatesError, 'estimates select monthly count')
    
    // 今月の納品数
    const { count: monthlyDeliveryCount, error: monthlyDeliveryCountError } = await supabase
      .from('deliveries')
      .select('id', { count: 'exact', head: true })
      .gte('delivery_date', monthStartStr)
      .lt('delivery_date', nextMonthStartStr)
      .eq('user_id', DEMO_USER_ID)

    if (monthlyDeliveryCountError) return handleSupabaseError(c, monthlyDeliveryCountError, 'deliveries select monthly count')
    
    // 今月の請求数
    const { count: monthlyInvoicesCount, error: monthlyInvoicesError } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .gte('invoice_date', monthStartStr)
      .lt('invoice_date', nextMonthStartStr)
      .eq('user_id', DEMO_USER_ID)

    if (monthlyInvoicesError) return handleSupabaseError(c, monthlyInvoicesError, 'invoices select monthly count')
    
    // 未入金の請求書（sent または overdue ステータス）
    const { data: unpaidRows, error: unpaidError } = await supabase
      .from('invoices')
      .select('total_amount')
      .in('status', ['sent', 'pending', 'overdue'])
      .eq('user_id', DEMO_USER_ID)

    if (unpaidError) return handleSupabaseError(c, unpaidError, 'invoices select unpaid')
    const unpaidCount = (unpaidRows || []).length
    const unpaidTotal = (unpaidRows || []).reduce((sum, row) => sum + (row.total_amount || 0), 0)
    
    // 直近6ヶ月の売上データ
    const monthlySalesData = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const salesStart = d.toISOString().split('T')[0]
      const salesEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().split('T')[0]
      const { data: salesRows, error: salesError } = await supabase
        .from('deliveries')
        .select('subtotal')
        .eq('user_id', DEMO_USER_ID)
        .gte('delivery_date', salesStart)
        .lt('delivery_date', salesEnd)

      if (salesError) return handleSupabaseError(c, salesError, 'deliveries select monthly sales chart')
      const salesTotal = (salesRows || []).reduce((sum, row) => sum + (row.subtotal || 0), 0)
      monthlySalesData.push({
        month: ym,
        label: `${d.getMonth() + 1}月`,
        total: salesTotal || 0
      })
    }
    
    return c.json({
      monthly_sales: monthlySalesTotal || 0,
      client_sales: clientSales,
      uninvoiced_count: uninvoicedCount || 0,
      monthly_estimates: monthlyEstimatesCount || 0,
      monthly_deliveries: monthlyDeliveryCount || 0,
      monthly_invoices: monthlyInvoicesCount || 0,
      unpaid_invoices: {
        count: unpaidCount || 0,
        total: unpaidTotal || 0
      },
      monthly_sales_chart: monthlySalesData
    }, 200)
  } catch (err) {
    return handleSupabaseError(c, err, 'dashboard summary catch')
  }
})

// =====================================
// 請求書データ API
// =====================================

// 締め日から請求期間を計算するヘルパー関数
function calculateBillingPeriod(closingDay: number | string, targetMonth: string): { start: string, end: string } {
  // targetMonth: "YYYY-MM" 形式
  const [year, month] = targetMonth.split('-').map(Number)
  const closing = parseInt(String(closingDay)) || 31
  
  let startDate: Date, endDate: Date
  
  if (closing >= 28 || closing === 31) {
    // 末締め: 当月1日〜末日
    startDate = new Date(year, month - 1, 1)
    endDate = new Date(year, month, 0) // 当月末日
  } else {
    // N日締め: 前月(N+1)日〜当月N日
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    startDate = new Date(prevYear, prevMonth - 1, closing + 1)
    endDate = new Date(year, month - 1, closing)
  }
  
  const formatDate = (d: Date) => d.toISOString().split('T')[0]
  return { start: formatDate(startDate), end: formatDate(endDate) }
}

// 最近編集した請求書
api.get('/invoices/recent', async (c) => {
  try {
    const limitParam = c.req.query('limit')
    const parsedLimit = Number(limitParam)
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 5
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_no, invoice_date, total_amount, status, updated_at, clients(client_name)')
      .eq('user_id', DEMO_USER_ID)
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (error) return handleSupabaseError(c, error, 'invoices select recent')

    const rows = (data || []).map((row: any) => ({
      ...row,
      client_name: row.clients?.client_name || null,
      invoice_display_no: row.invoice_no || (row.id ? `INV-${String(row.id).padStart(6, '0')}` : null),
      invoice_number: row.invoice_no || null
    }))
    return c.json(rows, 200)
  } catch (err) {
    return handleSupabaseError(c, err, 'invoices recent catch')
  }
})

// 次の請求番号を取得
api.get('/invoices/next-no', async (c) => {
  const queryDate = c.req.query('doc_date') || c.req.query('date')
  const today = new Date().toISOString().split('T')[0]
  const docDate = queryDate && queryDate.length >= 10 ? queryDate : today
  const requestUrl = c.req.url
  const query = {
    doc_date: c.req.query('doc_date'),
    date: c.req.query('date')
  }

  if (isDev) {
    const { error: pingError } = await supabase
      .from('document_number_sequences')
      .select('doc_type')
      .limit(1)
    if (pingError) {
      console.error('[next-no][invoice][ping]', {
        requestUrl,
        query,
        docDate,
        error: {
          code: pingError.code,
          message: pingError.message,
          details: pingError.details,
          hint: pingError.hint
        }
      })
    } else {
      console.log('[next-no][invoice][ping]', { requestUrl, query, docDate, ok: true })
    }
  }

  const { data, error } = await supabase.rpc('next_document_no', {
    p_doc_type: 'invoice',
    p_doc_date: docDate
  })

  if (error) {
    const responseBody = {
      success: false,
      error: 'RPC next_document_no failed (invoice)',
      rpc_error_code: error.code || null,
      rpc_error_message: error.message || null,
      rpc_error_details: error.details || null,
      rpc_error_hint: error.hint || null
    }
    console.error('[next-no][invoice][rpc-error]', {
      requestUrl,
      query,
      docDate,
      rpc: responseBody,
      status: 500
    })
    return c.json(responseBody, 500)
  }

  if (isDev) {
    console.log('[next-no][invoice][rpc-ok]', {
      requestUrl,
      query,
      docDate,
      status: 200,
      body: { next_no: data }
    })
  }
  return c.json({ next_no: data })
})

// 未請求の納品書を取得（締め日計算対応）
api.get('/invoices/uninvoiced-deliveries', async (c) => {
  const clientId = c.req.query('client_id')
  const closingDay = c.req.query('closing_day') || '31'
  const targetMonth = c.req.query('month') || new Date().toISOString().slice(0, 7)
  
  const { start, end } = calculateBillingPeriod(closingDay, targetMonth)
  
  let query = supabase
    .from('deliveries')
    .select('*, clients(client_name)')
    .is('invoice_id', null)
    .in('status', ['delivered', 'issued'])
    .gte('delivery_date', start)
    .lte('delivery_date', end)
    .eq('user_id', DEMO_USER_ID)

  if (clientId) {
    query = query.eq('client_id', clientId)
  }

  const { data, error } = await query
    .order('delivery_date', { ascending: true })
    .order('id', { ascending: true })

  if (error) return handleSupabaseError(c, error, 'deliveries select uninvoiced')

  const deliveries = (data || []).map((row: any) => ({
    ...row,
    client_name: row.clients?.client_name || null
  }))

  return c.json({
    deliveries,
    billing_period: { start, end }
  })
})

// 得意先ごとの未請求納品書サマリ（一括作成用）
api.get('/invoices/uninvoiced-summary', async (c) => {
  const targetMonth = c.req.query('month') || new Date().toISOString().slice(0, 7)
  
  // 各得意先の締め日を考慮して未請求納品書をカウント
  const { data, error } = await supabase
    .from('deliveries')
    .select('id, total_amount, delivery_date, client_id, clients(client_name, client_code, closing_day, payment_day)')
    .is('invoice_id', null)
    .in('status', ['delivered', 'issued'])
    .like('delivery_date', `${targetMonth}%`)
    .eq('user_id', DEMO_USER_ID)

  if (error) return handleSupabaseError(c, error, 'deliveries select uninvoiced summary')

  const summary = new Map<string, any>()
  for (const row of data || []) {
    const clientId = String(row.client_id || '')
    if (!clientId) continue
    const client = row.clients || {}
    const existing = summary.get(clientId)
    const deliveryDate = row.delivery_date || ''
    if (!existing) {
      summary.set(clientId, {
        client_id: row.client_id,
        client_name: client.client_name || '',
        client_code: client.client_code || '',
        closing_day: client.closing_day || null,
        payment_day: client.payment_day || null,
        delivery_count: 1,
        total_amount: row.total_amount || 0,
        first_delivery_date: deliveryDate,
        last_delivery_date: deliveryDate
      })
    } else {
      existing.delivery_count += 1
      existing.total_amount += row.total_amount || 0
      if (deliveryDate && (!existing.first_delivery_date || deliveryDate < existing.first_delivery_date)) {
        existing.first_delivery_date = deliveryDate
      }
      if (deliveryDate && (!existing.last_delivery_date || deliveryDate > existing.last_delivery_date)) {
        existing.last_delivery_date = deliveryDate
      }
    }
  }

  const results = Array.from(summary.values()).sort((a, b) => {
    return String(a.client_name).localeCompare(String(b.client_name))
  })

  return c.json(results)
})

// 未納品データのチェック（アラート用）
api.get('/invoices/undelivered-check', async (c) => {
  const targetMonth = c.req.query('month') || new Date().toISOString().slice(0, 7)
  
  // 納品日がターゲット月で、ステータスが「納品済」以外のデータをカウント
  const { data, error } = await supabase
    .from('deliveries')
    .select('status, clients(client_name)')
    .like('delivery_date', `${targetMonth}%`)
    .not('status', 'in', '("delivered","issued","invoiced")')
    .eq('user_id', DEMO_USER_ID)

  if (error) return handleSupabaseError(c, error, 'deliveries select undelivered check')

  const clientNames = new Set<string>()
  for (const row of data || []) {
    if (row.clients?.client_name) {
      clientNames.add(row.clients.client_name)
    }
  }

  return c.json({
    has_undelivered: (data || []).length > 0,
    count: (data || []).length,
    client_names: Array.from(clientNames).join(',')
  })
})

// 一括請求書作成
api.post('/invoices/batch-create', async (c) => {
  const data = await c.req.json()
  const { client_ids, target_month, bank_info } = data
  
  if (!client_ids || client_ids.length === 0) {
    return c.json({ error: '得意先を選択してください' }, 400)
  }
  
  const createdInvoices: any[] = []
  
  for (const clientId of client_ids) {
    // 得意先情報を取得
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('user_id', DEMO_USER_ID)
      .maybeSingle()

    if (clientError) return handleSupabaseError(c, clientError, 'clients select for batch-create')
    if (!client) continue

    const closingDay = client.closing_day || 31
    const { start, end } = calculateBillingPeriod(closingDay, target_month)
    
    // 未請求納品書を取得
    const { data: deliveries, error: deliveriesError } = await supabase
      .from('deliveries')
      .select('*')
      .eq('client_id', clientId)
      .is('invoice_id', null)
      .in('status', ['delivered', 'issued'])
      .gte('delivery_date', start)
      .lte('delivery_date', end)
      .eq('user_id', DEMO_USER_ID)
      .order('delivery_date', { ascending: true })

    if (deliveriesError) return handleSupabaseError(c, deliveriesError, 'deliveries select for batch-create')
    if (!deliveries || deliveries.length === 0) continue
    
    // 納品書の明細を集約
    let subtotal = 0
    let totalTax = 0
    const items: any[] = []
    
    for (const delivery of deliveries as any[]) {
      const { data: deliveryItems, error: deliveryItemsError } = await supabase
        .from('delivery_items')
        .select('*')
        .eq('delivery_id', delivery.id)
        .order('display_order', { ascending: true })

      if (deliveryItemsError) return handleSupabaseError(c, deliveryItemsError, 'delivery_items select for batch-create')

      if (deliveryItems && deliveryItems.length > 0) {
        for (const item of deliveryItems as any[]) {
          const amount = item.quantity * item.unit_price
          subtotal += amount
          totalTax += Math.floor(amount * getTaxRate(item.tax_rate) / 100)
          items.push({
            delivery_id: delivery.id,
            delivery_date: delivery.delivery_date,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            tax_rate: item.tax_rate || 10
          })
        }
      } else {
        // 明細がない場合は納品書単位で追加
        subtotal += delivery.subtotal || 0
        totalTax += delivery.tax_amount || 0
        items.push({
          delivery_id: delivery.id,
          delivery_date: delivery.delivery_date,
          product_name: delivery.delivery_no + ' 分',
          quantity: 1,
          unit_price: delivery.subtotal || 0,
          tax_rate: 10
        })
      }
    }
    
    const totalAmount = subtotal + totalTax
    
    // 請求番号を生成
    const now = new Date()
    const invoiceDate = now.toISOString().split('T')[0]
    const { data: invoiceNo, error: invoiceNoError } = await supabase.rpc('next_document_no', {
      doc_type: 'invoice',
      doc_date: invoiceDate
    })

    if (invoiceNoError) return handleSupabaseError(c, invoiceNoError, 'invoices rpc next-no (batch-create)')
    
    // 支払期限を計算
    const paymentDay = client.payment_day || null
    let paymentDueDate = null
    if (paymentDay) {
      const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, parseInt(paymentDay) || 1)
      paymentDueDate = dueDate.toISOString().split('T')[0]
    }
    
    // 請求書を作成
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        user_id: DEMO_USER_ID,
        invoice_no: invoiceNo,
        invoice_date: invoiceDate,
        client_id: clientId,
        billing_period_start: start,
        billing_period_end: end,
        payment_due_date: paymentDueDate,
        subtotal,
        tax_amount: totalTax,
        total_amount: totalAmount,
        notes: '',
        status: 'draft',
        bank_info: bank_info || ''
      })
      .select('id')
      .maybeSingle()

    if (invoiceError) return handleSupabaseError(c, invoiceError, 'invoices insert batch-create')
    const invoiceId = invoice?.id
    
    // 明細を追加
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const { error: itemError } = await supabase
        .from('invoice_items')
        .insert({
          invoice_id: invoiceId,
          delivery_id: item.delivery_id,
          delivery_date: item.delivery_date,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate,
          amount: item.quantity * item.unit_price,
          display_order: i + 1
        })

      if (itemError) return handleSupabaseError(c, itemError, 'invoice_items insert batch-create')
    }
    
    // 納品書を請求済みに更新
    for (const delivery of deliveries as any[]) {
      const { error: updateError } = await supabase
        .from('deliveries')
        .update({ invoice_id: invoiceId, status: 'invoiced', updated_at: new Date().toISOString() })
        .eq('id', delivery.id)
        .eq('user_id', DEMO_USER_ID)

      if (updateError) return handleSupabaseError(c, updateError, 'deliveries update batch-create')
    }
    
    createdInvoices.push({
      id: invoiceId,
      invoice_no: invoiceNo,
      client_name: client.client_name,
      total_amount: totalAmount,
      delivery_count: deliveries.length
    })
  }
  
  return c.json({ 
    success: true, 
    created_count: createdInvoices.length,
    invoices: createdInvoices 
  })
})

// 請求書一覧
api.get('/invoices', async (c) => {
  const clientId = c.req.query('client_id')
  const search = c.req.query('search')
  const status = c.req.query('status')
  const month = c.req.query('month')
  
  let query = supabase
    .from('invoices')
    .select('*, clients(client_name)')
    .eq('user_id', DEMO_USER_ID)

  if (clientId) {
    query = query.eq('client_id', clientId)
  }

  if (search) {
    const searchPattern = `%${search}%`
    query = query.or(
      `invoice_no.ilike.${searchPattern},notes.ilike.${searchPattern},clients.client_name.ilike.${searchPattern}`
    )
  }

  if (status) {
    query = query.eq('status', status)
  }

  if (month) {
    query = query.like('invoice_date', `${month}%`)
  }

  const { data, error } = await query
    .order('invoice_date', { ascending: false })
    .order('id', { ascending: false })

  if (error) return handleSupabaseError(c, error, 'invoices select list')

  const rows = (data || []).map((row: any) => ({
    ...row,
    client_name: row.clients?.client_name || null,
    invoice_display_no: row.invoice_no || (row.id ? `INV-${String(row.id).padStart(6, '0')}` : null),
    invoice_number: row.invoice_no || null
  }))
  return c.json(rows)
})

// 請求書詳細取得
api.get('/invoices/:id', async (c) => {
  try {
    const idParam = c.req.param('id')
    const id = Number(idParam)
    if (!Number.isFinite(id) || id <= 0) {
      return c.json(null, 200)
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*, clients(client_name, closing_day, payment_day)')
      .eq('id', id)
      .eq('user_id', DEMO_USER_ID)
      .maybeSingle()

    if (invoiceError) return handleSupabaseError(c, invoiceError, 'invoices select one')
    if (!invoice) return c.json(null, 200)

    const { data: items, error: itemsError } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', id)
      .order('display_order', { ascending: true })

    if (itemsError) return handleSupabaseError(c, itemsError, 'invoice_items select')

    // 紐づく納品書も取得
    const { data: deliveries, error: deliveriesError } = await supabase
      .from('deliveries')
      .select('id, delivery_date, total_amount')
      .eq('invoice_id', id)
      .eq('user_id', DEMO_USER_ID)
      .order('delivery_date', { ascending: true })

    if (deliveriesError) return handleSupabaseError(c, deliveriesError, 'deliveries select invoice-linked')

    return c.json({
      ...(invoice || {}),
      client_name: invoice?.clients?.client_name || null,
      closing_day: invoice?.clients?.closing_day || null,
      payment_day: invoice?.clients?.payment_day || null,
      items: items || [],
      deliveries: deliveries || []
    }, 200)
  } catch (err) {
    return handleSupabaseError(c, err, 'invoices detail catch')
  }
})

// 請求書作成
api.post('/invoices', async (c) => {
  const data = await c.req.json()
  
  // 小計・税・合計計算
  let subtotal = 0
  let totalTax = 0
  for (const item of data.items) {
    const amount = item.quantity * item.unit_price
    subtotal += amount
    totalTax += Math.floor(amount * getTaxRate(item.tax_rate) / 100)
  }
  const totalAmount = subtotal + totalTax
  
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      user_id: DEMO_USER_ID,
      invoice_no: data.invoice_no,
      invoice_date: data.invoice_date,
      client_id: data.client_id,
      billing_period_start: data.billing_period_start || null,
      billing_period_end: data.billing_period_end || null,
      closing_date: data.closing_date || null,
      payment_due_date: data.payment_due_date || null,
      subtotal,
      tax_amount: totalTax,
      total_amount: totalAmount,
      notes: data.notes || '',
      status: data.status || 'draft',
      bank_info: data.bank_info || ''
    })
    .select('id')
    .maybeSingle()

  if (invoiceError) return handleSupabaseError(c, invoiceError, 'invoices insert')
  const invoiceId = invoice?.id
  
  // 明細を追加
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i]
    const { error: itemError } = await supabase
      .from('invoice_items')
      .insert({
        invoice_id: invoiceId,
        delivery_id: item.delivery_id || null,
        delivery_date: item.delivery_date || null,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: getTaxRate(item.tax_rate),
        amount: item.quantity * item.unit_price,
        display_order: i + 1
      })

    if (itemError) return handleSupabaseError(c, itemError, 'invoice_items insert')
  }
  
  // 対象納品書のinvoice_idを更新
  if (data.delivery_ids && data.delivery_ids.length > 0) {
    for (const deliveryId of data.delivery_ids) {
      const { error: updateError } = await supabase
        .from('deliveries')
        .update({ invoice_id: invoiceId, status: 'invoiced', updated_at: new Date().toISOString() })
        .eq('id', deliveryId)
        .eq('user_id', DEMO_USER_ID)

      if (updateError) return handleSupabaseError(c, updateError, 'deliveries update invoice link')
    }
  }
  
  return c.json({ success: true, id: invoiceId })
})

// 請求書更新
api.put('/invoices/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  
  // 小計・税・合計計算
  let subtotal = 0
  let totalTax = 0
  for (const item of data.items) {
    const amount = item.quantity * item.unit_price
    subtotal += amount
    totalTax += Math.floor(amount * getTaxRate(item.tax_rate) / 100)
  }
  const totalAmount = subtotal + totalTax
  
  const { error: invoiceError } = await supabase
    .from('invoices')
    .update({
      invoice_date: data.invoice_date,
      client_id: data.client_id,
      billing_period_start: data.billing_period_start || null,
      billing_period_end: data.billing_period_end || null,
      closing_date: data.closing_date || null,
      payment_due_date: data.payment_due_date || null,
      subtotal,
      tax_amount: totalTax,
      total_amount: totalAmount,
      notes: data.notes || '',
      status: data.status || 'draft',
      bank_info: data.bank_info || '',
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', DEMO_USER_ID)

  if (invoiceError) return handleSupabaseError(c, invoiceError, 'invoices update')
  
  // 既存の明細を削除
  const { error: deleteError } = await supabase
    .from('invoice_items')
    .delete()
    .eq('invoice_id', id)

  if (deleteError) return handleSupabaseError(c, deleteError, 'invoice_items delete')
  
  // 新しい明細を追加
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i]
    const { error: itemError } = await supabase
      .from('invoice_items')
      .insert({
        invoice_id: id,
        delivery_id: item.delivery_id || null,
        delivery_date: item.delivery_date || null,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: getTaxRate(item.tax_rate),
        amount: item.quantity * item.unit_price,
        display_order: i + 1
      })

    if (itemError) return handleSupabaseError(c, itemError, 'invoice_items insert')
  }
  
  return c.json({ success: true })
})

// ステータスのみ更新
api.patch('/invoices/:id/status', async (c) => {
  const id = c.req.param('id')
  const { status } = await c.req.json()
  
  const { error } = await supabase
    .from('invoices')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', DEMO_USER_ID)
  
  if (error) return handleSupabaseError(c, error, 'invoices update status')
  return c.json({ success: true })
})

// 請求書削除
api.delete('/invoices/:id', async (c) => {
  const id = c.req.param('id')
  
  // 紐づく納品書のinvoice_idをクリア
  const { error: clearError } = await supabase
    .from('deliveries')
    .update({ invoice_id: null, status: 'delivered', updated_at: new Date().toISOString() })
    .eq('invoice_id', id)
    .eq('user_id', DEMO_USER_ID)

  if (clearError) return handleSupabaseError(c, clearError, 'deliveries clear invoice link')

  const { error: itemsError } = await supabase
    .from('invoice_items')
    .delete()
    .eq('invoice_id', id)

  if (itemsError) return handleSupabaseError(c, itemsError, 'invoice_items delete')

  const { error: invoiceError } = await supabase
    .from('invoices')
    .delete()
    .eq('id', id)
    .eq('user_id', DEMO_USER_ID)

  if (invoiceError) return handleSupabaseError(c, invoiceError, 'invoices delete')
  return c.json({ success: true })
})

export default api
