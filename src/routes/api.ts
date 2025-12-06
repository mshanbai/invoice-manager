import { Hono } from 'hono'
import type { Bindings } from '../types'

const api = new Hono<{ Bindings: Bindings }>()

// SaaS用: 開発中は仮のユーザーIDを使用
const DEMO_USER_ID = 'demo-user-001'

// 税率を取得するヘルパー関数（0%に対応）
function getTaxRate(taxRate: number | null | undefined): number {
  return (taxRate !== null && taxRate !== undefined) ? taxRate : 10
}

// =====================================
// 自社情報 API
// =====================================
api.get('/company', async (c) => {
  const result = await c.env.DB.prepare('SELECT * FROM company_info WHERE user_id = ? LIMIT 1').bind(DEMO_USER_ID).first()
  return c.json(result || {})
})

api.put('/company', async (c) => {
  const data = await c.req.json()
  const existing = await c.env.DB.prepare('SELECT id FROM company_info WHERE user_id = ? LIMIT 1').bind(DEMO_USER_ID).first()
  
  // 銀行口座情報をJSON文字列に変換
  const bankAccountsJson = JSON.stringify(data.bank_accounts || [])
  
  if (existing) {
    await c.env.DB.prepare(`
      UPDATE company_info SET
        company_name = ?, department_name = ?, person_name = ?,
        representative_title = ?, representative_name = ?,
        postal_code = ?, address = ?, address_number = ?, building_name = ?,
        tel = ?, fax = ?, email = ?, website = ?,
        invoice_registration_no = ?,
        logo_url = ?, stamp_url = ?,
        bank_name = ?, bank_branch = ?, account_type = ?, account_number = ?, account_holder = ?,
        bank_accounts = ?,
        default_bank_account_index = ?,
        default_tax_type = ?, default_tax_rate = ?,
        default_closing_day = ?, default_payment_day = ?,
        show_tax_on_estimate_delivery = ?,
        estimate_valid_days = ?,
        default_delivery_place = ?,
        default_payment_terms = ?,
        default_delivery_date = ?,
        delivery_note_format = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      data.company_name, data.department_name || '', data.person_name || '',
      data.representative_title || '', data.representative_name || '',
      data.postal_code || '', data.address || '', data.address_number || '', data.building_name || '',
      data.tel || '', data.fax || '', data.email || '', data.website || '',
      data.invoice_registration_no || '',
      data.logo_url || '', data.stamp_url || '',
      data.bank_name || '', data.bank_branch || '', data.account_type || '', data.account_number || '', data.account_holder || '',
      bankAccountsJson,
      data.default_bank_account_index !== undefined ? data.default_bank_account_index : -1,
      data.default_tax_type || 'standard', data.default_tax_rate || 10,
      data.default_closing_day || '', data.default_payment_day || '',
      data.show_tax_on_estimate_delivery ? 1 : 0,
      data.estimate_valid_days || 30,
      data.default_delivery_place || '',
      data.default_payment_terms || '',
      data.default_delivery_date || '',
      data.delivery_note_format || 'half',
      existing.id
    ).run()
  } else {
    await c.env.DB.prepare(`
      INSERT INTO company_info (
        user_id,
        company_name, department_name, person_name,
        representative_title, representative_name,
        postal_code, address, address_number, building_name,
        tel, fax, email, website,
        invoice_registration_no,
        logo_url, stamp_url,
        bank_name, bank_branch, account_type, account_number, account_holder,
        bank_accounts,
        default_bank_account_index,
        default_tax_type, default_tax_rate,
        default_closing_day, default_payment_day,
        show_tax_on_estimate_delivery,
        estimate_valid_days,
        default_delivery_place,
        default_payment_terms,
        default_delivery_date,
        delivery_note_format
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      DEMO_USER_ID,
      data.company_name, data.department_name || '', data.person_name || '',
      data.representative_title || '', data.representative_name || '',
      data.postal_code || '', data.address || '', data.address_number || '', data.building_name || '',
      data.tel || '', data.fax || '', data.email || '', data.website || '',
      data.invoice_registration_no || '',
      data.logo_url || '', data.stamp_url || '',
      data.bank_name || '', data.bank_branch || '', data.account_type || '', data.account_number || '', data.account_holder || '',
      bankAccountsJson,
      data.default_bank_account_index !== undefined ? data.default_bank_account_index : -1,
      data.default_tax_type || 'standard', data.default_tax_rate || 10,
      data.default_closing_day || '', data.default_payment_day || '',
      data.show_tax_on_estimate_delivery ? 1 : 0,
      data.estimate_valid_days || 30,
      data.default_delivery_place || '',
      data.default_payment_terms || '',
      data.default_delivery_date || '',
      data.delivery_note_format || 'half'
    ).run()
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
  const result = await c.env.DB.prepare(`
    SELECT id, category_code, category_name, tax_rate, tax_type, updated_at 
    FROM categories 
    WHERE is_active = 1 
    ORDER BY updated_at DESC 
    LIMIT ?
  `).bind(parseInt(limit)).all()
  return c.json(result.results)
})

// 次の分類コードを取得 ※ :id より前に定義
api.get('/categories/next-code', async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT MAX(CAST(SUBSTR(category_code, 2) AS INTEGER)) as max_code FROM categories WHERE category_code LIKE 'C%'"
  ).first()
  const nextNum = (result?.max_code || 0) + 1
  const nextCode = 'C' + String(nextNum).padStart(3, '0')
  return c.json({ next_code: nextCode })
})

api.get('/categories', async (c) => {
  const search = c.req.query('search')
  
  let query = 'SELECT * FROM categories WHERE is_active = 1 AND user_id = ?'
  const params: any[] = [DEMO_USER_ID]
  
  // 統合検索: 分類コード・分類名・メモを横断検索
  if (search) {
    query += ' AND (category_code LIKE ? OR category_name LIKE ? OR notes LIKE ?)'
    const searchPattern = `%${search}%`
    params.push(searchPattern, searchPattern, searchPattern)
  }
  
  query += ' ORDER BY display_order, category_name'
  
  const stmt = c.env.DB.prepare(query)
  const result = await stmt.bind(...params).all()
  return c.json(result.results)
})

api.get('/categories/:id', async (c) => {
  const id = c.req.param('id')
  const result = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first()
  return c.json(result)
})

api.post('/categories', async (c) => {
  const data = await c.req.json()
  const maxOrder = await c.env.DB.prepare('SELECT MAX(display_order) as max FROM categories WHERE user_id = ?').bind(DEMO_USER_ID).first()
  
  // 分類コードが空の場合は自動採番
  let categoryCode = data.category_code
  if (!categoryCode) {
    const result = await c.env.DB.prepare(
      "SELECT MAX(CAST(SUBSTR(category_code, 2) AS INTEGER)) as max_code FROM categories WHERE category_code LIKE 'C%' AND user_id = ?"
    ).bind(DEMO_USER_ID).first()
    const nextNum = (result?.max_code || 0) + 1
    categoryCode = 'C' + String(nextNum).padStart(3, '0')
  }
  
  await c.env.DB.prepare(`
    INSERT INTO categories (user_id, category_code, category_name, tax_rate, tax_type, display_order, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    DEMO_USER_ID,
    categoryCode,
    data.category_name, 
    data.tax_rate || 10, 
    data.tax_type || 'standard',
    (maxOrder?.max || 0) + 1,
    data.notes || ''
  ).run()
  
  return c.json({ success: true, category_code: categoryCode })
})

api.put('/categories/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  
  await c.env.DB.prepare(`
    UPDATE categories SET
      category_code = ?, category_name = ?, tax_rate = ?, tax_type = ?, display_order = ?, notes = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    data.category_code || '',
    data.category_name, 
    data.tax_rate, 
    data.tax_type || 'standard',
    data.display_order,
    data.notes || '',
    id
  ).run()
  
  return c.json({ success: true })
})

api.delete('/categories/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('UPDATE categories SET is_active = 0 WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// =====================================
// 商品マスタ API
// =====================================

// 最近編集した商品を取得 ※ :id より前に定義
api.get('/products/recent', async (c) => {
  const limit = c.req.query('limit') || '5'
  const result = await c.env.DB.prepare(`
    SELECT p.id, p.product_code, p.product_name, p.category_id, c.category_name, p.updated_at 
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.is_active = 1 
    ORDER BY p.updated_at DESC 
    LIMIT ?
  `).bind(parseInt(limit)).all()
  return c.json(result.results)
})

// 次の商品コードを取得 ※ :id より前に定義
api.get('/products/next-code', async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT MAX(CAST(SUBSTR(product_code, 2) AS INTEGER)) as max_code FROM products WHERE product_code LIKE 'P%'"
  ).first()
  const nextNum = (result?.max_code || 0) + 1
  const nextCode = 'P' + String(nextNum).padStart(4, '0')
  return c.json({ next_code: nextCode })
})

// 分類内の商品名一覧を取得（サジェスト用）
api.get('/products/by-category/:categoryId', async (c) => {
  const categoryId = c.req.param('categoryId')
  const result = await c.env.DB.prepare(`
    SELECT DISTINCT product_name FROM products 
    WHERE category_id = ? AND is_active = 1
    ORDER BY product_name
  `).bind(categoryId).all()
  return c.json(result.results)
})

api.get('/products', async (c) => {
  const categoryId = c.req.query('category_id')
  const search = c.req.query('search')
  const isWholesale = c.req.query('is_wholesale')
  
  let query = `
    SELECT p.*, c.category_name, c.category_code
    FROM products p 
    LEFT JOIN categories c ON p.category_id = c.id 
    WHERE p.is_active = 1 AND p.user_id = ?
  `
  const params: any[] = [DEMO_USER_ID]
  
  if (categoryId) {
    query += ' AND p.category_id = ?'
    params.push(categoryId)
  }
  
  // 統合検索: 商品コード、商品名、JANコード、分類名、備考、メモを横断検索
  if (search) {
    query += ` AND (
      p.product_code LIKE ? OR 
      p.product_name LIKE ? OR 
      p.jan_code LIKE ? OR 
      c.category_name LIKE ? OR
      p.remarks LIKE ? OR
      p.notes LIKE ?
    )`
    const searchPattern = `%${search}%`
    params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern)
  }
  
  // 上代商品フィルター
  if (isWholesale !== undefined && isWholesale !== '') {
    query += ' AND p.is_wholesale = ?'
    params.push(parseInt(isWholesale))
  }
  
  query += ' ORDER BY c.display_order, p.product_code, p.product_name'
  
  const stmt = c.env.DB.prepare(query)
  const result = await stmt.bind(...params).all()
  return c.json(result.results)
})

api.get('/products/:id', async (c) => {
  const id = c.req.param('id')
  const result = await c.env.DB.prepare(`
    SELECT p.*, c.category_name, c.category_code, c.tax_rate as category_tax_rate, c.tax_type as category_tax_type
    FROM products p 
    LEFT JOIN categories c ON p.category_id = c.id 
    WHERE p.id = ?
  `).bind(id).first()
  return c.json(result)
})

api.post('/products', async (c) => {
  const data = await c.req.json()
  
  // 商品コードが空の場合は自動採番
  let productCode = data.product_code
  if (!productCode) {
    const result = await c.env.DB.prepare(
      "SELECT MAX(CAST(SUBSTR(product_code, 2) AS INTEGER)) as max_code FROM products WHERE product_code LIKE 'P%' AND user_id = ?"
    ).bind(DEMO_USER_ID).first()
    const nextNum = (result?.max_code || 0) + 1
    productCode = 'P' + String(nextNum).padStart(4, '0')
  }
  
  // 下代計算: 上代 × 掛け率 / 100
  const unitPrice = data.is_wholesale 
    ? (data.retail_price * data.discount_rate / 100) 
    : data.unit_price
  
  await c.env.DB.prepare(`
    INSERT INTO products (
      user_id, product_name, product_code, jan_code, category_id,
      unit_price, cost_price, retail_price, discount_rate,
      tax_rate, min_lot, unit, is_wholesale, remarks, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    DEMO_USER_ID,
    data.product_name, productCode, data.jan_code || '',
    data.category_id || null, unitPrice, data.cost_price || 0,
    data.retail_price || 0, data.discount_rate || 100,
    data.tax_rate || null, data.min_lot || 1, data.unit || '個',
    data.is_wholesale || 0, data.remarks || '', data.notes || ''
  ).run()
  
  return c.json({ success: true, product_code: productCode })
})

api.put('/products/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  
  // 下代計算: 上代 × 掛け率 / 100
  const unitPrice = data.is_wholesale 
    ? (data.retail_price * data.discount_rate / 100) 
    : data.unit_price
  
  await c.env.DB.prepare(`
    UPDATE products SET
      product_name = ?, product_code = ?, jan_code = ?, category_id = ?,
      unit_price = ?, cost_price = ?, retail_price = ?, discount_rate = ?,
      tax_rate = ?, min_lot = ?, unit = ?, is_wholesale = ?, remarks = ?, notes = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    data.product_name, data.product_code || '', data.jan_code || '',
    data.category_id || null, unitPrice, data.cost_price || 0,
    data.retail_price || 0, data.discount_rate || 100,
    data.tax_rate || null, data.min_lot || 1, data.unit || '個',
    data.is_wholesale || 0, data.remarks || '', data.notes || '', id
  ).run()
  
  return c.json({ success: true })
})

api.delete('/products/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('UPDATE products SET is_active = 0 WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// =====================================
// 取引先マスタ API
// =====================================

// 最近編集した取引先を取得 ※ :id より前に定義する必要あり
api.get('/clients/recent', async (c) => {
  const limit = c.req.query('limit') || '5'
  const result = await c.env.DB.prepare(`
    SELECT id, client_name, client_code, updated_at 
    FROM clients 
    WHERE is_active = 1 
    ORDER BY updated_at DESC 
    LIMIT ?
  `).bind(parseInt(limit)).all()
  return c.json(result.results)
})

// 次の取引先コードを取得 ※ :id より前に定義する必要あり
api.get('/clients/next-code', async (c) => {
  const result = await c.env.DB.prepare(
    'SELECT MAX(CAST(client_code AS INTEGER)) as max_code FROM clients WHERE client_code GLOB "[0-9]*"'
  ).first()
  const nextCode = String((result?.max_code || 100) + 1)
  return c.json({ next_code: nextCode })
})

api.get('/clients', async (c) => {
  const search = c.req.query('search')
  const useWholesale = c.req.query('use_wholesale')
  
  let query = 'SELECT * FROM clients WHERE is_active = 1 AND user_id = ?'
  const params: any[] = [DEMO_USER_ID]
  
  // 統合検索: 取引先名・担当者名・代表者名・電話・携帯・メール・締め日を横断検索
  if (search) {
    query += ` AND (
      client_name LIKE ? OR 
      person_name LIKE ? OR 
      representative_name LIKE ? OR
      tel LIKE ? OR 
      mobile LIKE ? OR 
      email LIKE ? OR 
      closing_day LIKE ?
    )`
    const searchPattern = `%${search}%`
    params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern)
  }
  
  // 上代/下代フィルター（プルダウンで残す）
  if (useWholesale !== undefined && useWholesale !== '') {
    query += ' AND use_wholesale_price = ?'
    params.push(parseInt(useWholesale))
  }
  
  query += ' ORDER BY client_code, client_name'
  
  const stmt = c.env.DB.prepare(query)
  const result = await stmt.bind(...params).all()
  return c.json(result.results)
})

api.get('/clients/:id', async (c) => {
  const id = c.req.param('id')
  const result = await c.env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first()
  return c.json(result)
})

api.post('/clients', async (c) => {
  const data = await c.req.json()
  
  // 取引先コードが空の場合は自動採番
  let clientCode = data.client_code
  if (!clientCode) {
    const result = await c.env.DB.prepare(
      'SELECT MAX(CAST(client_code AS INTEGER)) as max_code FROM clients WHERE client_code GLOB "[0-9]*" AND user_id = ?'
    ).bind(DEMO_USER_ID).first()
    clientCode = String((result?.max_code || 100) + 1)
  }
  
  await c.env.DB.prepare(`
    INSERT INTO clients (
      user_id, client_name, department_name, postal_code, address,
      address_number, building_name, client_code, person_name,
      email, closing_day, payment_day, use_wholesale_price, discount_rate,
      tel, fax, mobile, website,
      bank_name, bank_branch, bank_account_type, bank_account_number, bank_account_holder,
      representative_title, representative_name,
      notes, tax_display_setting, is_individual
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    DEMO_USER_ID,
    data.client_name, data.department_name || '', data.postal_code || '',
    data.address || '', data.address_number || '', data.building_name || '',
    clientCode, data.person_name || '', data.email || '',
    data.closing_day || '', data.payment_day || '', data.use_wholesale_price || 0,
    data.discount_rate || 100,
    data.tel || '', data.fax || '', data.mobile || '', data.website || '',
    data.bank_name || '', data.bank_branch || '', data.bank_account_type || '',
    data.bank_account_number || '', data.bank_account_holder || '',
    data.representative_title || '', data.representative_name || '',
    data.notes || '', data.tax_display_setting || 'default', data.is_individual || 0
  ).run()
  
  return c.json({ success: true, client_code: clientCode })
})

api.put('/clients/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  
  await c.env.DB.prepare(`
    UPDATE clients SET
      client_name = ?, department_name = ?, postal_code = ?, address = ?,
      address_number = ?, building_name = ?, client_code = ?, person_name = ?,
      email = ?, closing_day = ?, payment_day = ?, use_wholesale_price = ?, discount_rate = ?,
      tel = ?, fax = ?, mobile = ?, website = ?,
      bank_name = ?, bank_branch = ?, bank_account_type = ?, bank_account_number = ?, bank_account_holder = ?,
      representative_title = ?, representative_name = ?,
      notes = ?, tax_display_setting = ?, is_individual = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    data.client_name, data.department_name || '', data.postal_code || '',
    data.address || '', data.address_number || '', data.building_name || '',
    data.client_code || '', data.person_name || '', data.email || '',
    data.closing_day || '', data.payment_day || '', data.use_wholesale_price || 0,
    data.discount_rate || 100,
    data.tel || '', data.fax || '', data.mobile || '', data.website || '',
    data.bank_name || '', data.bank_branch || '', data.bank_account_type || '',
    data.bank_account_number || '', data.bank_account_holder || '',
    data.representative_title || '', data.representative_name || '',
    data.notes || '', data.tax_display_setting || 'default', data.is_individual || 0, id
  ).run()
  
  return c.json({ success: true })
})

api.delete('/clients/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('UPDATE clients SET is_active = 0 WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// =====================================
// 納品データ API
// =====================================

// 最近編集した納品
api.get('/deliveries/recent', async (c) => {
  const limit = c.req.query('limit') || '5'
  const result = await c.env.DB.prepare(`
    SELECT d.*, cl.client_name 
    FROM deliveries d 
    LEFT JOIN clients cl ON d.client_id = cl.id 
    ORDER BY d.updated_at DESC 
    LIMIT ?
  `).bind(parseInt(limit)).all()
  return c.json(result.results)
})

// 次の納品番号を取得
api.get('/deliveries/next-no', async (c) => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const prefix = `D${year}${month}-`
  
  const result = await c.env.DB.prepare(`
    SELECT delivery_no 
    FROM deliveries 
    WHERE delivery_no LIKE ? 
    ORDER BY delivery_no DESC 
    LIMIT 1
  `).bind(`${prefix}%`).first()
  
  let nextNum = 1
  if (result?.delivery_no) {
    const match = result.delivery_no.match(/-(\d+)$/)
    if (match) {
      nextNum = parseInt(match[1]) + 1
    }
  }
  
  return c.json({ next_no: `${prefix}${String(nextNum).padStart(3, '0')}` })
})

api.get('/deliveries', async (c) => {
  const clientId = c.req.query('client_id')
  const search = c.req.query('search')
  const status = c.req.query('status')
  const month = c.req.query('month')
  
  let query = `
    SELECT d.*, cl.client_name 
    FROM deliveries d 
    LEFT JOIN clients cl ON d.client_id = cl.id 
    WHERE d.user_id = ?
  `
  const params: any[] = [DEMO_USER_ID]
  
  if (clientId) {
    query += ' AND d.client_id = ?'
    params.push(clientId)
  }
  
  if (search) {
    query += ' AND (d.delivery_no LIKE ? OR cl.client_name LIKE ? OR d.notes LIKE ?)'
    const searchPattern = `%${search}%`
    params.push(searchPattern, searchPattern, searchPattern)
  }
  
  if (status) {
    query += ' AND d.status = ?'
    params.push(status)
  }
  
  if (month) {
    query += ' AND d.delivery_date LIKE ?'
    params.push(`${month}%`)
  }
  
  query += ' ORDER BY d.delivery_date DESC, d.id DESC'
  
  const stmt = c.env.DB.prepare(query)
  const result = await stmt.bind(...params).all()
  return c.json(result.results)
})

api.get('/deliveries/:id', async (c) => {
  const id = c.req.param('id')
  const delivery = await c.env.DB.prepare(`
    SELECT d.*, cl.client_name 
    FROM deliveries d 
    LEFT JOIN clients cl ON d.client_id = cl.id 
    WHERE d.id = ?
  `).bind(id).first()
  
  const items = await c.env.DB.prepare(`
    SELECT * FROM delivery_items WHERE delivery_id = ? ORDER BY display_order
  `).bind(id).all()
  
  return c.json({ ...delivery, items: items.results })
})

// 納品書番号生成
api.get('/deliveries/next-number', async (c) => {
  const clientId = c.req.query('client_id')
  const date = c.req.query('date') || new Date().toISOString().split('T')[0]
  
  const client = await c.env.DB.prepare(
    'SELECT client_code FROM clients WHERE id = ?'
  ).bind(clientId).first()
  
  const clientCode = client?.client_code || '000'
  const year = date.substring(2, 4)
  const monthDay = date.substring(5, 7) + date.substring(8, 10)
  
  // 同日同取引先の既存納品書をカウント
  const existing = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM deliveries 
    WHERE delivery_date = ? AND client_id = ?
  `).bind(date, clientId).first()
  
  const seq = (existing?.count || 0) + 1
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
  
  const result = await c.env.DB.prepare(`
    INSERT INTO deliveries (
      user_id, delivery_no, delivery_date, client_id, subject, subtotal, tax_amount, total_amount, notes, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    DEMO_USER_ID,
    data.delivery_no, data.delivery_date, data.client_id, data.subject || '',
    subtotal, totalTax, totalAmount, data.notes || '', data.status || 'draft'
  ).run()
  
  const deliveryId = result.meta.last_row_id
  
  // 明細を追加
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i]
    await c.env.DB.prepare(`
      INSERT INTO delivery_items (
        delivery_id, product_id, product_name, jan_code, category_id,
        quantity, unit_price, tax_rate, amount, notes, display_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      deliveryId, item.product_id || null, item.product_name,
      item.jan_code || '', item.category_id || null,
      item.quantity, item.unit_price, getTaxRate(item.tax_rate),
      item.quantity * item.unit_price, item.notes || '', i + 1
    ).run()
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
  
  await c.env.DB.prepare(`
    UPDATE deliveries SET
      delivery_no = ?, delivery_date = ?, client_id = ?, subject = ?,
      subtotal = ?, tax_amount = ?, total_amount = ?, notes = ?, status = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    data.delivery_no, data.delivery_date, data.client_id, data.subject || '',
    subtotal, totalTax, totalAmount, data.notes || '', data.status || 'draft', id
  ).run()
  
  // 既存明細を削除
  await c.env.DB.prepare('DELETE FROM delivery_items WHERE delivery_id = ?').bind(id).run()
  
  // 新しい明細を追加
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i]
    await c.env.DB.prepare(`
      INSERT INTO delivery_items (
        delivery_id, product_id, product_name, jan_code, category_id,
        quantity, unit_price, tax_rate, amount, notes, display_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, item.product_id || null, item.product_name,
      item.jan_code || '', item.category_id || null,
      item.quantity, item.unit_price, getTaxRate(item.tax_rate),
      item.quantity * item.unit_price, item.notes || '', i + 1
    ).run()
  }
  
  return c.json({ success: true })
})

// ステータスのみ更新
api.patch('/deliveries/:id/status', async (c) => {
  const id = c.req.param('id')
  const { status } = await c.req.json()
  
  await c.env.DB.prepare(`
    UPDATE deliveries SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(status, id).run()
  
  return c.json({ success: true })
})

api.delete('/deliveries/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM delivery_items WHERE delivery_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM deliveries WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// =====================================
// 見積データ API
// =====================================

// 最近編集した見積を取得
api.get('/estimates/recent', async (c) => {
  const limit = c.req.query('limit') || '5'
  const result = await c.env.DB.prepare(`
    SELECT e.id, e.estimate_no, e.estimate_date, e.total_amount, e.status, 
           cl.client_name, e.updated_at
    FROM estimates e
    LEFT JOIN clients cl ON e.client_id = cl.id
    ORDER BY e.updated_at DESC
    LIMIT ?
  `).bind(parseInt(limit)).all()
  return c.json(result.results)
})

// 次の見積番号を取得
api.get('/estimates/next-no', async (c) => {
  // 年月ベースの採番 例: E202411-001
  const now = new Date()
  const yearMonth = now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, '0')
  const prefix = 'E' + yearMonth + '-'
  
  const result = await c.env.DB.prepare(`
    SELECT MAX(CAST(SUBSTR(estimate_no, 9) AS INTEGER)) as max_num 
    FROM estimates 
    WHERE estimate_no LIKE ?
  `).bind(prefix + '%').first()
  
  const nextNum = (result?.max_num || 0) + 1
  const nextNo = prefix + String(nextNum).padStart(3, '0')
  return c.json({ next_no: nextNo })
})

api.get('/estimates', async (c) => {
  const clientId = c.req.query('client_id')
  const search = c.req.query('search')
  const status = c.req.query('status')
  const month = c.req.query('month')  // 年月フィルター (YYYY-MM形式)
  
  let query = `
    SELECT e.*, cl.client_name 
    FROM estimates e 
    LEFT JOIN clients cl ON e.client_id = cl.id 
    WHERE e.user_id = ?
  `
  const params: any[] = [DEMO_USER_ID]
  
  if (clientId) {
    query += ' AND e.client_id = ?'
    params.push(clientId)
  }
  
  if (search) {
    query += ' AND (e.estimate_no LIKE ? OR cl.client_name LIKE ? OR e.notes LIKE ?)'
    const searchPattern = `%${search}%`
    params.push(searchPattern, searchPattern, searchPattern)
  }
  
  if (status) {
    query += ' AND e.status = ?'
    params.push(status)
  }
  
  if (month) {
    // YYYY-MM形式で前方一致検索
    query += ' AND e.estimate_date LIKE ?'
    params.push(`${month}%`)
  }
  
  query += ' ORDER BY e.estimate_date DESC, e.id DESC'
  
  const stmt = c.env.DB.prepare(query)
  const result = await stmt.bind(...params).all()
  return c.json(result.results)
})

api.get('/estimates/:id', async (c) => {
  const id = c.req.param('id')
  const estimate = await c.env.DB.prepare(`
    SELECT e.*, cl.client_name 
    FROM estimates e 
    LEFT JOIN clients cl ON e.client_id = cl.id 
    WHERE e.id = ?
  `).bind(id).first()
  
  const items = await c.env.DB.prepare(`
    SELECT * FROM estimate_items WHERE estimate_id = ? ORDER BY display_order
  `).bind(id).all()
  
  return c.json({ ...estimate, items: items.results })
})

// 取引先の最新見積単価を取得
api.get('/estimates/latest-price', async (c) => {
  const clientId = c.req.query('client_id')
  const productName = c.req.query('product_name')
  
  const result = await c.env.DB.prepare(`
    SELECT ei.unit_price, ei.retail_price
    FROM estimate_items ei
    JOIN estimates e ON ei.estimate_id = e.id
    WHERE e.client_id = ? AND ei.product_name = ?
    ORDER BY e.estimate_date DESC, e.id DESC
    LIMIT 1
  `).bind(clientId, productName).first()
  
  return c.json(result || null)
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
  
  const result = await c.env.DB.prepare(`
    INSERT INTO estimates (
      user_id, estimate_no, estimate_date, client_id, valid_until, valid_until_text,
      subject, subtotal, tax_amount, total_amount, notes, status,
      delivery_place, payment_terms, delivery_date_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    DEMO_USER_ID,
    data.estimate_no, data.estimate_date, data.client_id,
    data.valid_until || null, data.valid_until_text || '',
    data.subject || '',
    subtotal, taxAmount, totalAmount,
    data.notes || '', data.status || 'draft',
    data.delivery_place || '', data.payment_terms || '', data.delivery_date_text || ''
  ).run()
  
  const estimateId = result.meta.last_row_id
  
  // 明細を追加
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i]
    await c.env.DB.prepare(`
      INSERT INTO estimate_items (
        estimate_id, product_id, product_name, jan_code,
        quantity, unit_price, retail_price, use_retail_price,
        tax_rate, amount, notes, display_order, item_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      estimateId, item.product_id || null, item.product_name,
      item.jan_code || '', item.quantity, item.unit_price,
      item.retail_price || 0, item.use_retail_price || 0,
      getTaxRate(item.tax_rate), item.quantity * item.unit_price,
      item.notes || '', i + 1, item.item_notes || ''
    ).run()
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
  
  await c.env.DB.prepare(`
    UPDATE estimates SET
      estimate_no = ?, estimate_date = ?, client_id = ?, valid_until = ?, valid_until_text = ?,
      subject = ?, subtotal = ?, tax_amount = ?, total_amount = ?, 
      notes = ?, status = ?,
      delivery_place = ?, payment_terms = ?, delivery_date_text = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    data.estimate_no, data.estimate_date, data.client_id,
    data.valid_until || null, data.valid_until_text || '',
    data.subject || '',
    subtotal, taxAmount, totalAmount,
    data.notes || '', data.status || 'draft',
    data.delivery_place || '', data.payment_terms || '', data.delivery_date_text || '',
    id
  ).run()
  
  // 既存明細を削除
  await c.env.DB.prepare('DELETE FROM estimate_items WHERE estimate_id = ?').bind(id).run()
  
  // 新しい明細を追加
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i]
    await c.env.DB.prepare(`
      INSERT INTO estimate_items (
        estimate_id, product_id, product_name, jan_code,
        quantity, unit_price, retail_price, use_retail_price,
        tax_rate, amount, notes, display_order, item_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, item.product_id || null, item.product_name,
      item.jan_code || '', item.quantity, item.unit_price,
      item.retail_price || 0, item.use_retail_price || 0,
      getTaxRate(item.tax_rate), item.quantity * item.unit_price,
      item.notes || '', i + 1, item.item_notes || ''
    ).run()
  }
  
  return c.json({ success: true })
})

// ステータスのみ更新
api.patch('/estimates/:id/status', async (c) => {
  const id = c.req.param('id')
  const { status } = await c.req.json()
  
  await c.env.DB.prepare(`
    UPDATE estimates SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(status, id).run()
  
  return c.json({ success: true })
})

api.delete('/estimates/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM estimate_items WHERE estimate_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM estimates WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// =====================================
// ダッシュボード API
// =====================================
api.get('/dashboard/summary', async (c) => {
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  
  // 今月の売上
  const monthlyDeliveries = await c.env.DB.prepare(`
    SELECT SUM(subtotal) as total FROM deliveries 
    WHERE delivery_date LIKE ?
  `).bind(`${thisMonth}%`).first()
  
  // 取引先別売上
  const clientSales = await c.env.DB.prepare(`
    SELECT cl.client_name, SUM(d.subtotal) as total
    FROM deliveries d
    JOIN clients cl ON d.client_id = cl.id
    WHERE d.delivery_date LIKE ?
    GROUP BY d.client_id
    ORDER BY total DESC
    LIMIT 10
  `).bind(`${thisMonth}%`).all()
  
  // 未請求納品書数
  const uninvoiced = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM deliveries WHERE invoice_id IS NULL
  `).first()
  
  // 今月の見積数
  const monthlyEstimates = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM estimates
    WHERE estimate_date LIKE ?
  `).bind(`${thisMonth}%`).first()
  
  // 今月の納品数
  const monthlyDeliveryCount = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM deliveries
    WHERE delivery_date LIKE ?
  `).bind(`${thisMonth}%`).first()
  
  // 今月の請求数
  const monthlyInvoices = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM invoices
    WHERE invoice_date LIKE ?
  `).bind(`${thisMonth}%`).first()
  
  // 未入金の請求書（sent または overdue ステータス）
  const unpaidInvoices = await c.env.DB.prepare(`
    SELECT COUNT(*) as count, SUM(total_amount) as total FROM invoices
    WHERE status IN ('sent', 'pending', 'overdue')
  `).first()
  
  // 直近6ヶ月の売上データ
  const monthlySalesData = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const sales = await c.env.DB.prepare(`
      SELECT SUM(subtotal) as total FROM deliveries
      WHERE delivery_date LIKE ?
    `).bind(`${ym}%`).first()
    monthlySalesData.push({
      month: ym,
      label: `${d.getMonth() + 1}月`,
      total: sales?.total || 0
    })
  }
  
  return c.json({
    monthly_sales: monthlyDeliveries?.total || 0,
    client_sales: clientSales.results,
    uninvoiced_count: uninvoiced?.count || 0,
    monthly_estimates: monthlyEstimates?.count || 0,
    monthly_deliveries: monthlyDeliveryCount?.count || 0,
    monthly_invoices: monthlyInvoices?.count || 0,
    unpaid_invoices: {
      count: unpaidInvoices?.count || 0,
      total: unpaidInvoices?.total || 0
    },
    monthly_sales_chart: monthlySalesData
  })
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
  const limit = c.req.query('limit') || '5'
  const result = await c.env.DB.prepare(`
    SELECT i.id, i.invoice_no, i.invoice_date, i.total_amount, i.status, 
           cl.client_name, i.updated_at
    FROM invoices i
    LEFT JOIN clients cl ON i.client_id = cl.id
    ORDER BY i.updated_at DESC
    LIMIT ?
  `).bind(parseInt(limit)).all()
  return c.json(result.results)
})

// 次の請求番号を取得
api.get('/invoices/next-no', async (c) => {
  const now = new Date()
  const yearMonth = now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, '0')
  const prefix = 'INV' + yearMonth + '-'
  
  const result = await c.env.DB.prepare(`
    SELECT MAX(CAST(SUBSTR(invoice_no, 11) AS INTEGER)) as max_num 
    FROM invoices 
    WHERE invoice_no LIKE ?
  `).bind(prefix + '%').first()
  
  const nextNum = (result?.max_num || 0) + 1
  const nextNo = prefix + String(nextNum).padStart(3, '0')
  return c.json({ next_no: nextNo })
})

// 未請求の納品書を取得（締め日計算対応）
api.get('/invoices/uninvoiced-deliveries', async (c) => {
  const clientId = c.req.query('client_id')
  const closingDay = c.req.query('closing_day') || '31'
  const targetMonth = c.req.query('month') || new Date().toISOString().slice(0, 7)
  
  const { start, end } = calculateBillingPeriod(closingDay, targetMonth)
  
  let query = `
    SELECT d.*, cl.client_name 
    FROM deliveries d 
    LEFT JOIN clients cl ON d.client_id = cl.id 
    WHERE d.invoice_id IS NULL 
    AND d.status IN ('delivered', 'issued')
    AND d.delivery_date >= ? AND d.delivery_date <= ?
  `
  const params: any[] = [start, end]
  
  if (clientId) {
    query += ' AND d.client_id = ?'
    params.push(clientId)
  }
  
  query += ' ORDER BY d.delivery_date ASC, d.id ASC'
  
  const stmt = c.env.DB.prepare(query)
  const result = await stmt.bind(...params).all()
  
  return c.json({
    deliveries: result.results,
    billing_period: { start, end }
  })
})

// 得意先ごとの未請求納品書サマリ（一括作成用）
api.get('/invoices/uninvoiced-summary', async (c) => {
  const targetMonth = c.req.query('month') || new Date().toISOString().slice(0, 7)
  
  // 各得意先の締め日を考慮して未請求納品書をカウント
  const result = await c.env.DB.prepare(`
    SELECT 
      cl.id as client_id,
      cl.client_name,
      cl.client_code,
      cl.closing_day,
      cl.payment_day,
      COUNT(d.id) as delivery_count,
      SUM(d.total_amount) as total_amount,
      MIN(d.delivery_date) as first_delivery_date,
      MAX(d.delivery_date) as last_delivery_date
    FROM clients cl
    INNER JOIN deliveries d ON d.client_id = cl.id
    WHERE d.invoice_id IS NULL 
    AND d.status IN ('delivered', 'issued')
    AND d.delivery_date LIKE ?
    GROUP BY cl.id
    ORDER BY cl.client_name
  `).bind(`${targetMonth}%`).all()
  
  return c.json(result.results)
})

// 未納品データのチェック（アラート用）
api.get('/invoices/undelivered-check', async (c) => {
  const targetMonth = c.req.query('month') || new Date().toISOString().slice(0, 7)
  
  // 納品日がターゲット月で、ステータスが「納品済」以外のデータをカウント
  const result = await c.env.DB.prepare(`
    SELECT 
      COUNT(*) as count,
      GROUP_CONCAT(DISTINCT cl.client_name) as client_names
    FROM deliveries d
    LEFT JOIN clients cl ON d.client_id = cl.id
    WHERE d.delivery_date LIKE ?
    AND d.status NOT IN ('delivered', 'issued', 'invoiced')
  `).bind(`${targetMonth}%`).first()
  
  return c.json({
    has_undelivered: (result?.count || 0) > 0,
    count: result?.count || 0,
    client_names: result?.client_names || ''
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
    const client = await c.env.DB.prepare(`
      SELECT * FROM clients WHERE id = ?
    `).bind(clientId).first()
    
    if (!client) continue
    
    const closingDay = client.closing_day || 31
    const { start, end } = calculateBillingPeriod(closingDay, target_month)
    
    // 未請求納品書を取得
    const deliveries = await c.env.DB.prepare(`
      SELECT * FROM deliveries 
      WHERE client_id = ? AND invoice_id IS NULL 
      AND status IN ('delivered', 'issued')
      AND delivery_date >= ? AND delivery_date <= ?
      ORDER BY delivery_date
    `).bind(clientId, start, end).all()
    
    if (deliveries.results.length === 0) continue
    
    // 納品書の明細を集約
    let subtotal = 0
    let totalTax = 0
    const items: any[] = []
    
    for (const delivery of deliveries.results as any[]) {
      const deliveryItems = await c.env.DB.prepare(`
        SELECT * FROM delivery_items WHERE delivery_id = ? ORDER BY display_order
      `).bind(delivery.id).all()
      
      if (deliveryItems.results.length > 0) {
        for (const item of deliveryItems.results as any[]) {
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
    const yearMonth = now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, '0')
    const prefix = 'INV' + yearMonth + '-'
    const maxNo = await c.env.DB.prepare(`
      SELECT MAX(CAST(SUBSTR(invoice_no, 11) AS INTEGER)) as max_num 
      FROM invoices WHERE invoice_no LIKE ?
    `).bind(prefix + '%').first()
    const nextNum = ((maxNo?.max_num as number) || 0) + 1
    const invoiceNo = prefix + String(nextNum).padStart(3, '0')
    
    // 支払期限を計算
    const paymentDay = client.payment_day || null
    let paymentDueDate = null
    if (paymentDay) {
      const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, parseInt(paymentDay) || 1)
      paymentDueDate = dueDate.toISOString().split('T')[0]
    }
    
    // 請求書を作成
    const invoiceResult = await c.env.DB.prepare(`
      INSERT INTO invoices (
        user_id, invoice_no, invoice_date, client_id,
        billing_period_start, billing_period_end, payment_due_date,
        subtotal, tax_amount, total_amount, notes, status, bank_info
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      DEMO_USER_ID,
      invoiceNo, now.toISOString().split('T')[0], clientId,
      start, end, paymentDueDate,
      subtotal, totalTax, totalAmount, '', 'draft', bank_info || ''
    ).run()
    
    const invoiceId = invoiceResult.meta.last_row_id
    
    // 明細を追加
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      await c.env.DB.prepare(`
        INSERT INTO invoice_items (
          invoice_id, delivery_id, delivery_date, product_name,
          quantity, unit_price, tax_rate, amount, display_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        invoiceId, item.delivery_id, item.delivery_date,
        item.product_name, item.quantity, item.unit_price,
        item.tax_rate, item.quantity * item.unit_price, i + 1
      ).run()
    }
    
    // 納品書を請求済みに更新
    for (const delivery of deliveries.results as any[]) {
      await c.env.DB.prepare(`
        UPDATE deliveries SET invoice_id = ?, status = 'invoiced', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(invoiceId, delivery.id).run()
    }
    
    createdInvoices.push({
      id: invoiceId,
      invoice_no: invoiceNo,
      client_name: client.client_name,
      total_amount: totalAmount,
      delivery_count: deliveries.results.length
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
  
  let query = `
    SELECT i.*, cl.client_name 
    FROM invoices i 
    LEFT JOIN clients cl ON i.client_id = cl.id 
    WHERE i.user_id = ?
  `
  const params: any[] = [DEMO_USER_ID]
  
  if (clientId) {
    query += ' AND i.client_id = ?'
    params.push(clientId)
  }
  
  if (search) {
    query += ' AND (i.invoice_no LIKE ? OR cl.client_name LIKE ? OR i.notes LIKE ?)'
    const searchPattern = `%${search}%`
    params.push(searchPattern, searchPattern, searchPattern)
  }
  
  if (status) {
    query += ' AND i.status = ?'
    params.push(status)
  }
  
  if (month) {
    query += ' AND i.invoice_date LIKE ?'
    params.push(`${month}%`)
  }
  
  query += ' ORDER BY i.invoice_date DESC, i.id DESC'
  
  const stmt = c.env.DB.prepare(query)
  const result = await stmt.bind(...params).all()
  return c.json(result.results)
})

// 請求書詳細取得
api.get('/invoices/:id', async (c) => {
  const id = c.req.param('id')
  const invoice = await c.env.DB.prepare(`
    SELECT i.*, cl.client_name, cl.closing_day, cl.payment_day
    FROM invoices i 
    LEFT JOIN clients cl ON i.client_id = cl.id 
    WHERE i.id = ?
  `).bind(id).first()
  
  const items = await c.env.DB.prepare(`
    SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY display_order
  `).bind(id).all()
  
  // 紐づく納品書も取得
  const deliveries = await c.env.DB.prepare(`
    SELECT id, delivery_no, delivery_date, total_amount 
    FROM deliveries 
    WHERE invoice_id = ?
    ORDER BY delivery_date
  `).bind(id).all()
  
  return c.json({ ...invoice, items: items.results, deliveries: deliveries.results })
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
  
  const result = await c.env.DB.prepare(`
    INSERT INTO invoices (
      user_id, invoice_no, invoice_date, client_id, 
      billing_period_start, billing_period_end, closing_date, payment_due_date,
      subtotal, tax_amount, total_amount, notes, status, bank_info
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    DEMO_USER_ID,
    data.invoice_no, data.invoice_date, data.client_id,
    data.billing_period_start || null, data.billing_period_end || null,
    data.closing_date || null, data.payment_due_date || null,
    subtotal, totalTax, totalAmount, data.notes || '', data.status || 'draft',
    data.bank_info || ''
  ).run()
  
  const invoiceId = result.meta.last_row_id
  
  // 明細を追加
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i]
    await c.env.DB.prepare(`
      INSERT INTO invoice_items (
        invoice_id, delivery_id, delivery_date, product_name,
        quantity, unit_price, tax_rate, amount, display_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      invoiceId, item.delivery_id || null, item.delivery_date || null,
      item.product_name, item.quantity, item.unit_price,
      getTaxRate(item.tax_rate), item.quantity * item.unit_price, i + 1
    ).run()
  }
  
  // 対象納品書のinvoice_idを更新
  if (data.delivery_ids && data.delivery_ids.length > 0) {
    for (const deliveryId of data.delivery_ids) {
      await c.env.DB.prepare(`
        UPDATE deliveries SET invoice_id = ?, status = 'invoiced', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(invoiceId, deliveryId).run()
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
  
  await c.env.DB.prepare(`
    UPDATE invoices SET
      invoice_no = ?, invoice_date = ?, client_id = ?,
      billing_period_start = ?, billing_period_end = ?, 
      closing_date = ?, payment_due_date = ?,
      subtotal = ?, tax_amount = ?, total_amount = ?, 
      notes = ?, status = ?, bank_info = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    data.invoice_no, data.invoice_date, data.client_id,
    data.billing_period_start || null, data.billing_period_end || null,
    data.closing_date || null, data.payment_due_date || null,
    subtotal, totalTax, totalAmount, data.notes || '', data.status || 'draft',
    data.bank_info || '', id
  ).run()
  
  // 既存の明細を削除
  await c.env.DB.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').bind(id).run()
  
  // 新しい明細を追加
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i]
    await c.env.DB.prepare(`
      INSERT INTO invoice_items (
        invoice_id, delivery_id, delivery_date, product_name,
        quantity, unit_price, tax_rate, amount, display_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, item.delivery_id || null, item.delivery_date || null,
      item.product_name, item.quantity, item.unit_price,
      getTaxRate(item.tax_rate), item.quantity * item.unit_price, i + 1
    ).run()
  }
  
  return c.json({ success: true })
})

// ステータスのみ更新
api.patch('/invoices/:id/status', async (c) => {
  const id = c.req.param('id')
  const { status } = await c.req.json()
  
  await c.env.DB.prepare(`
    UPDATE invoices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(status, id).run()
  
  return c.json({ success: true })
})

// 請求書削除
api.delete('/invoices/:id', async (c) => {
  const id = c.req.param('id')
  
  // 紐づく納品書のinvoice_idをクリア
  await c.env.DB.prepare(`
    UPDATE deliveries SET invoice_id = NULL, status = 'delivered' WHERE invoice_id = ?
  `).bind(id).run()
  
  await c.env.DB.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM invoices WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

export default api
