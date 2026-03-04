import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

import { Hono } from 'hono'
import { createHash } from 'node:crypto'
import { supabase } from '../lib/supabaseClient'
import { supabaseAdmin } from '../lib/supabaseAdmin'
import { demoFabricDict } from '../features/fabric-calculator/data/demoFabricDict'
import { calculateFabricUsage } from '../features/fabric-calculator/utils/calculation'
import type {
  ChairPart,
  CutDirection,
  FabricSpec,
} from '../features/fabric-calculator/types'
import { accountTypeCodeToLabel, normalizeAccountTypeToCode } from '../utils/bankAccount'
import {
  calculateTaxSummary,
  normalizeTaxRoundingMode,
  normalizeTaxRoundingUnit,
  pickTaxCalculationSettings,
  resolveItemTaxRate,
} from '../utils/taxCalculation'
import { sendInvoiceNotification } from '../utils/email'

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

const normalizeBankAccountIdsInput = (value: unknown): { ids: string[] } => {
  let rawList: unknown[] = []

  if (value === undefined || value === null) {
    rawList = []
  } else if (Array.isArray(value)) {
    rawList = value
  } else if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) {
      rawList = []
    } else if (raw.startsWith('[') && raw.endsWith(']')) {
      try {
        const parsed = JSON.parse(raw)
        rawList = Array.isArray(parsed) ? parsed : [raw]
      } catch {
        rawList = [raw]
      }
    } else {
      rawList = raw.split(/[,\s]+/)
    }
  } else {
    rawList = [value]
  }

  const normalized = rawList
    .map((id) => String(id).trim())
    .filter(Boolean)
    .filter((id) => /^\d+$/.test(id))

  const unique: string[] = []
  const seen = new Set<string>()
  normalized.forEach((id) => {
    if (seen.has(id)) return
    seen.add(id)
    unique.push(id)
  })

  return { ids: unique.slice(0, 3) }
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

const isMissingBankAccountIdsColumn = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false
  const code = (err as any).code
  const message = String((err as any).message || '')
  return code === 'PGRST204' && message.includes('bank_account_ids')
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
const INVOICE_PDF_BUCKET = 'invoice-pdfs'

const toSafePdfFileNameBase = (value: unknown): string => {
  const raw = String(value || '').trim()
  if (!raw) return 'invoice'
  return raw.replace(/[\\/:*?"<>|]/g, '_')
}

const toContentDispositionFileName = (value: unknown): string => {
  return `${toSafePdfFileNameBase(value)}.pdf`
}

function toAsciiFallbackFilename(input: unknown): string {
  const base = String(input || '')
    .replace(/[^0-9A-Za-z._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return base ? base : 'file.pdf'
}

function encodeRFC5987ValueChars(str: string): string {
  return encodeURIComponent(str)
    .replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A')
}

function buildContentDispositionAttachment(filenameUtf8: string): string {
  const ascii = toAsciiFallbackFilename(filenameUtf8)
  const encoded = encodeRFC5987ValueChars(filenameUtf8)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

const toPdfStoragePath = (userId: string, invoiceId: number, invoiceNo: unknown): string => {
  const safeInvoiceNo = toSafePdfFileNameBase(invoiceNo || `invoice-${invoiceId}`)
  return `${userId}/${invoiceId}/${safeInvoiceNo}.pdf`
}

const toSha256Hex = (bytes: Buffer): string => {
  return createHash('sha256').update(bytes).digest('hex')
}

function getResolvedUserId(_c?: any): string {
  // TODO: Supabase Auth 導入後はここだけ差し替える
  return DEMO_USER_ID
}

async function fetchCompanyTaxSettings(userId: string) {
  const { data, error } = await supabase
    .from('company_info')
    .select('tax_rounding_unit, tax_rounding_mode')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.warn('[API] fetchCompanyTaxSettings fallback used', error)
    return pickTaxCalculationSettings({})
  }
  return pickTaxCalculationSettings(data || {})
}

function buildSimplePdfBuffer(lines: string[]): ArrayBuffer {
  const safeLines = lines.map((line) =>
    String(line || '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
  )
  const textCommands = safeLines
    .map((line, idx) => `BT /F1 12 Tf 50 ${780 - idx * 18} Td (${line}) Tj ET`)
    .join('\n')

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${textCommands.length} >> stream\n${textCommands}\nendstream endobj`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (const obj of objects) {
    offsets.push(pdf.length)
    pdf += `${obj}\n`
  }
  const xrefStart = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  const encoded = new TextEncoder().encode(pdf)
  return encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength
  ) as ArrayBuffer
}

function normalizeTaxRateColumnMode(value: unknown): 'AUTO' | 'ON' | 'OFF' {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (normalized === 'ON') return 'ON'
  if (normalized === 'OFF') return 'OFF'
  return 'AUTO'
}

function normalizeEstimateCodeColumnKind(value: unknown): 'JAN' | 'PRODUCT_CODE' {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (normalized === 'PRODUCT_CODE') return 'PRODUCT_CODE'
  return 'JAN'
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

function parseSignedNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function parseTrimmedText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function normalizeTaxAdjustmentByRateInput(value: unknown): Record<string, number> {
  let source: any = value
  if (typeof source === 'string') {
    const raw = source.trim()
    if (!raw) return {}
    try {
      source = JSON.parse(raw)
    } catch {
      return {}
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {}

  const normalized: Record<string, number> = {}
  Object.keys(source).forEach((key) => {
    const rate = Number(key)
    const amount = Number((source as any)[key])
    if (!Number.isFinite(rate) || rate <= 0) return
    if (!Number.isFinite(amount) || amount === 0) return
    normalized[String(rate)] = amount
  })
  return normalized
}

function toBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function toOrderNum(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 999999
}

function normalizeDefaultInMemory(rows: any[]): any[] {
  if (!Array.isArray(rows) || rows.length === 0) return []
  const sorted = [...rows].sort((a, b) => {
    const ad = toBool(a?.is_default) ? 1 : 0
    const bd = toBool(b?.is_default) ? 1 : 0
    if (bd !== ad) return bd - ad
    const ao = toOrderNum(a?.display_order)
    const bo = toOrderNum(b?.display_order)
    if (ao !== bo) return ao - bo
    const ai = Number(a?.id ?? 0)
    const bi = Number(b?.id ?? 0)
    return ai - bi
  })
  return sorted.map((r, idx) => ({
    ...r,
    is_default: idx === 0,
  }))
}

async function persistSingleDefault(supabase: any, userId: string, defaultId: number | null) {
  try {
    const now = new Date().toISOString()
    const { error: clearError } = await supabase
      .from('bank_accounts')
      .update({ is_default: false, updated_at: now })
      .eq('user_id', userId)
      .is('customer_id', null)
      .eq('is_archived', false)
    if (clearError) {
      console.warn('[API] default normalize: failed to clear is_default', clearError)
      return
    }
    if (!defaultId) return
    const { error: setError } = await supabase
      .from('bank_accounts')
      .update({ is_default: true, updated_at: now })
      .eq('user_id', userId)
      .is('customer_id', null)
      .eq('is_archived', false)
      .eq('id', defaultId)
    if (setError) {
      console.warn('[API] default normalize: failed to set is_default', setError)
      return
    }
    console.log('[API] default normalize: ok defaultId=', defaultId)
  } catch (err) {
    console.warn('[API] default normalize: unexpected error', err)
  }
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
  const company = data || {}
  let bankAccountsList: any[] = []
  try {
    const r0 = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', DEMO_USER_ID)
      .is('customer_id', null)
      .eq('is_archived', false)
      .order('is_default', { ascending: false })
      .order('display_order', { ascending: true })
      .order('id', { ascending: true })
      .limit(5)
    if (!r0.error) {
      bankAccountsList = normalizeDefaultInMemory(r0.data || [])
    } else {
      console.error('[API] GET /api/company bank_accounts r0 error=', r0.error)
      bankAccountsList = []
    }
  } catch (e) {
    console.error('[API] GET /api/company bank_accounts r0 exception=', e)
    bankAccountsList = []
  }

  const normalizedBankAccounts = (bankAccountsList || []).map((row: any) => {
    const branchName = row.branch_name ?? row.bank_branch ?? ''
    const accountType = normalizeAccountTypeToCode(row.account_type) || 'ordinary'
    const accountHolder = row.account_holder ?? row.account_name ?? ''
    return {
      ...row,
      branch_name: branchName,
      bank_branch: branchName,
      account_type: accountType,
      account_type_label: accountTypeCodeToLabel(accountType),
      account_number: row.account_number ?? '',
      account_holder: accountHolder,
      is_default: toBool(row.is_default),
      display_order: row.display_order ?? 0,
      id: row.id
    }
  })

  console.log('[API] GET /api/company bank_accounts length=', (normalizedBankAccounts || []).length)

  // ★重要：bank_accounts が取れなくても 500 にしない（company を返す）
  return c.json({
    ...company,
    bank_accounts: normalizedBankAccounts,
    bank_accounts_list: normalizedBankAccounts,
  })
})

// =====================================
// 振込先 API
// =====================================
api.get('/bank-accounts', async (c) => {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('user_id', DEMO_USER_ID)
    .eq('is_archived', false)
    .order('is_default', { ascending: false })
    .order('id', { ascending: true })

  if (error) {
    console.error('[API][error] GET /api/bank-accounts supabase_error=', error)
    return handleSupabaseError(c, error, 'bank_accounts select list')
  }
  const rows = (data || []).map((row: any) => {
    const accountName =
      row.account_name ??
      row.account_holder ??
      row.account_holder_name ??
      row.holder_name ??
      row.account_name_kana ??
      row.account_name_katakana ??
      ''
    return {
      id: row.id,
      bank_name: row.bank_name || '',
      bankName: row.bank_name || '',
      branch_name: row.branch_name || '',
      branchName: row.branch_name || '',
      account_type: row.account_type || '',
      accountType: row.account_type || '',
      account_number: row.account_number || '',
      accountNumber: row.account_number || '',
      account_name: accountName,
      accountName: accountName,
      is_default: row.is_default ?? 0,
      isDefault: row.is_default ?? 0,
      created_at: row.created_at ?? null,
      createdAt: row.created_at ?? null
    }
  })
  console.log(`[API] GET /api/bank-accounts user_id=${DEMO_USER_ID} count=${rows.length}`)
  return c.json({ success: true, bank_accounts: rows })
})

api.put('/company', async (c) => {
  const data = await c.req.json()
  const bankAccounts =
    Array.isArray(data.bank_accounts)
      ? data.bank_accounts
      : Array.isArray(data.bankAccounts)
        ? data.bankAccounts
        : []
  if (bankAccounts.length > 5) {
    return c.json({ success: false, error: 'bank_accounts must be at most 5' }, 400)
  }
  const toTrimmedString = (value: unknown): string => {
    if (value === null || value === undefined) return ''
    return String(value).trim()
  }
  const normalizedBankAccounts = bankAccounts.map((a: any) => {
    const branchName = toTrimmedString(a?.branch_name ?? a?.bank_branch ?? '')
    const accountType = normalizeAccountTypeToCode(a?.account_type ?? a?.accountType) || 'ordinary'
    const accountHolder = toTrimmedString(a?.account_holder ?? a?.account_name ?? '')
    return {
      ...a,
      bank_name: toTrimmedString(a?.bank_name ?? a?.bankName ?? ''),
      branch_name: branchName,
      bank_branch: branchName,
      account_type: accountType,
      accountType: accountType,
      account_number: toTrimmedString(a?.account_number ?? a?.accountNumber ?? ''),
      account_holder: accountHolder,
      account_name: accountHolder,
    }
  })
  let hasDefault = false
  normalizedBankAccounts.forEach((a: any, index: number) => {
    const isDefault = toBool(a?.is_default ?? a?.isDefault)
    if (!hasDefault && isDefault) {
      hasDefault = true
      a.is_default = true
    } else {
      a.is_default = false
    }
    a.display_order = index + 1
  })
  if (!hasDefault && normalizedBankAccounts.length > 0) {
    normalizedBankAccounts[0].is_default = true
  }
  let requestedDefaultCandidate: any = null
  if (data.default_bank_account_index !== null && data.default_bank_account_index !== undefined) {
    const requestedIndex = Number(data.default_bank_account_index)
    if (Number.isFinite(requestedIndex) && requestedIndex >= 0 && requestedIndex < normalizedBankAccounts.length) {
      requestedDefaultCandidate = normalizedBankAccounts[requestedIndex]
    }
  }
  let bankAccountIds = bankAccounts
    .map((a: any) => a?.id ?? a?.bank_account_id ?? a?.bankAccountId)
    .filter((v: any) => v !== null && v !== undefined && v !== '')
    .map((v: any) => String(v))
  const toValidId = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) return null
    return n
  }
  const requestedDefaultId = toValidId(requestedDefaultCandidate?.id ?? requestedDefaultCandidate?.bank_account_id ?? requestedDefaultCandidate?.bankAccountId)
  const requestedDefaultMatch = requestedDefaultCandidate
    ? {
        bank_name: toTrimmedString(requestedDefaultCandidate?.bank_name ?? requestedDefaultCandidate?.bankName ?? ''),
        branch_name: toTrimmedString(requestedDefaultCandidate?.branch_name ?? requestedDefaultCandidate?.bank_branch ?? ''),
        account_type: normalizeAccountTypeToCode(requestedDefaultCandidate?.account_type ?? requestedDefaultCandidate?.accountType) || 'ordinary',
        account_number: toTrimmedString(requestedDefaultCandidate?.account_number ?? requestedDefaultCandidate?.accountNumber ?? ''),
        account_holder: toTrimmedString(requestedDefaultCandidate?.account_holder ?? requestedDefaultCandidate?.account_name ?? requestedDefaultCandidate?.accountName ?? ''),
      }
    : null
  const accountsWithId = normalizedBankAccounts.filter((a: any) => toValidId(a?.id ?? a?.bank_account_id ?? a?.bankAccountId) !== null)
  const accountsWithoutId = normalizedBankAccounts.filter((a: any) => toValidId(a?.id ?? a?.bank_account_id ?? a?.bankAccountId) === null)
  console.log('[API] PUT /api/company existing=', accountsWithId.length, 'fresh=', accountsWithoutId.length)
  let upsertedIds: string[] = []
  let insertedIds: string[] = []
  if (accountsWithId.length > 0) {
    const upsertRows = accountsWithId.map((a: any, index: number) => ({
      id: toValidId(a?.id ?? a?.bank_account_id ?? a?.bankAccountId) as number,
      user_id: DEMO_USER_ID,
      customer_id: null,
      bank_name: toTrimmedString(a?.bank_name ?? a?.bankName ?? ''),
      branch_name: toTrimmedString(a?.branch_name ?? a?.bank_branch ?? ''),
      account_type: normalizeAccountTypeToCode(a?.account_type ?? a?.accountType) || 'ordinary',
      account_number: toTrimmedString(a?.account_number ?? a?.accountNumber ?? ''),
      account_holder: toTrimmedString(a?.account_holder ?? a?.account_name ?? a?.accountName ?? ''),
      is_default: false,
      is_archived: false,
      display_order: a?.display_order ?? a?.displayOrder ?? index + 1,
      updated_at: new Date().toISOString(),
    }))
    const { data: upserted, error: upsertError } = await supabase
      .from('bank_accounts')
      .upsert(upsertRows, { onConflict: 'id' })
      .select('id')
    if (upsertError) return handleSupabaseError(c, upsertError, 'bank_accounts upsert')
    upsertedIds = (upserted || [])
      .map((row: any) => row?.id)
      .filter((v: any) => v !== null && v !== undefined && v !== '')
      .map((v: any) => String(v))
    console.log('[API] PUT /api/company upserted ids=', upsertedIds)
  }
  if (accountsWithoutId.length > 0) {
    const insertRows = accountsWithoutId.map((a: any, index: number) => ({
      user_id: DEMO_USER_ID,
      customer_id: null,
      bank_name: toTrimmedString(a?.bank_name ?? a?.bankName ?? ''),
      branch_name: toTrimmedString(a?.branch_name ?? a?.bank_branch ?? ''),
      account_type: normalizeAccountTypeToCode(a?.account_type ?? a?.accountType) || 'ordinary',
      account_number: toTrimmedString(a?.account_number ?? a?.accountNumber ?? ''),
      account_holder: toTrimmedString(a?.account_holder ?? a?.account_name ?? a?.accountName ?? ''),
      is_default: false,
      is_archived: false,
      display_order: a?.display_order ?? a?.displayOrder ?? index + 1,
      updated_at: new Date().toISOString(),
    }))
    const { data: inserted, error: insertError } = await supabase
      .from('bank_accounts')
      .insert(insertRows)
      .select('id')
    if (insertError) return handleSupabaseError(c, insertError, 'bank_accounts insert')
    insertedIds = (inserted || [])
      .map((row: any) => row?.id)
      .filter((v: any) => v !== null && v !== undefined && v !== '')
      .map((v: any) => String(v))
    console.log('[API] PUT /api/company inserted ids=', insertedIds)
  }
  if (upsertedIds.length > 0 || insertedIds.length > 0) {
    bankAccountIds = [...upsertedIds, ...insertedIds]
  }
  if (Array.isArray(bankAccounts)) {
    const payloadIds = bankAccountIds
    if (payloadIds.length > 0) {
      const { error: archiveError } = await supabase
        .from('bank_accounts')
        .update({ is_archived: true, is_default: false, updated_at: new Date().toISOString() })
        .eq('user_id', DEMO_USER_ID)
        .is('customer_id', null)
        .not('id', 'in', `(${payloadIds.join(',')})`)
      if (archiveError && archiveError.code !== '23503') {
        return handleSupabaseError(c, archiveError, 'bank_accounts archive')
      }
      if (archiveError && archiveError.code === '23503') {
        console.warn('[API] bank_accounts archive skipped due to FK constraint', archiveError)
      }
    } else {
      const { error: archiveError } = await supabase
        .from('bank_accounts')
        .update({ is_archived: true, is_default: false, updated_at: new Date().toISOString() })
        .eq('user_id', DEMO_USER_ID)
        .is('customer_id', null)
      if (archiveError && archiveError.code !== '23503') {
        return handleSupabaseError(c, archiveError, 'bank_accounts archive')
      }
      if (archiveError && archiveError.code === '23503') {
        console.warn('[API] bank_accounts archive skipped due to FK constraint', archiveError)
      }
    }
  }
  const { data: existing, error: existingError } = await supabase
    .from('company_info')
    .select('id')
    .eq('user_id', DEMO_USER_ID)
    .maybeSingle()

  if (existingError) return handleSupabaseError(c, existingError, 'company_info select id')
  
  // 銀行口座情報をJSON文字列に変換
  const bankAccountsJson = JSON.stringify(normalizedBankAccounts)
  
  if (existing) {
    const updatePayload: any = {
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
      bank_account_ids: bankAccountIds,
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
      tax_rate_column_mode: normalizeTaxRateColumnMode(data.tax_rate_column_mode),
      tax_rounding_unit: normalizeTaxRoundingUnit(data.tax_rounding_unit),
      tax_rounding_mode: normalizeTaxRoundingMode(data.tax_rounding_mode),
      estimate_code_column_enabled: toBool(data.estimate_code_column_enabled) ? 1 : 0,
      estimate_code_column_kind: normalizeEstimateCodeColumnKind(data.estimate_code_column_kind),
      updated_at: new Date().toISOString()
    }
    let { error } = await supabase
      .from('company_info')
      .update(updatePayload)
      .eq('id', existing.id)
    if (error && isMissingBankAccountIdsColumn(error)) {
      console.warn('[API] bank_account_ids column missing, skipped')
      delete updatePayload.bank_account_ids
      const retry = await supabase
        .from('company_info')
        .update(updatePayload)
        .eq('id', existing.id)
      error = retry.error
    }
    if (error) return handleSupabaseError(c, error, 'company_info update')
  } else {
    const insertPayload: any = {
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
      bank_account_ids: bankAccountIds,
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
      tax_rate_column_mode: normalizeTaxRateColumnMode(data.tax_rate_column_mode),
      tax_rounding_unit: normalizeTaxRoundingUnit(data.tax_rounding_unit),
      tax_rounding_mode: normalizeTaxRoundingMode(data.tax_rounding_mode),
      estimate_code_column_enabled: toBool(data.estimate_code_column_enabled) ? 1 : 0,
      estimate_code_column_kind: normalizeEstimateCodeColumnKind(data.estimate_code_column_kind)
    }
    let { error } = await supabase
      .from('company_info')
      .insert(insertPayload)
    if (error && isMissingBankAccountIdsColumn(error)) {
      console.warn('[API] bank_account_ids column missing, skipped')
      delete insertPayload.bank_account_ids
      const retry = await supabase
        .from('company_info')
        .insert(insertPayload)
      error = retry.error
    }
    if (error) return handleSupabaseError(c, error, 'company_info insert')
  }
  
  let responseBankAccounts: any[] = []
  try {
    const r0 = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', DEMO_USER_ID)
      .is('customer_id', null)
      .eq('is_archived', false)
      .order('is_default', { ascending: false })
      .order('display_order', { ascending: true })
      .order('id', { ascending: true })
      .limit(5)
    if (!r0.error) {
      const normalizedRows = normalizeDefaultInMemory(r0.data || [])
      responseBankAccounts = normalizedRows.map((row: any) => {
        const branchName = row.branch_name ?? row.bank_branch ?? ''
        const accountType = normalizeAccountTypeToCode(row.account_type) || 'ordinary'
        const accountHolder = row.account_holder ?? row.account_name ?? ''
        return {
          ...row,
          branch_name: branchName,
          bank_branch: branchName,
          account_type: accountType,
          account_type_label: accountTypeCodeToLabel(accountType),
          account_number: row.account_number ?? '',
          account_holder: accountHolder,
          is_default: toBool(row.is_default),
          display_order: row.display_order ?? 0,
          id: row.id
        }
      })
      bankAccountIds = responseBankAccounts.map((row: any) => String(row.id))
    }
  } catch (e) {
    console.error('[API] PUT /api/company bank_accounts select exception=', e)
  }
  try {
    let defaultId: number | null = null
    if (requestedDefaultId) {
      defaultId = requestedDefaultId
    } else if (requestedDefaultMatch) {
      const matched = responseBankAccounts.find((row: any) => {
        const bankName = toTrimmedString(row?.bank_name ?? row?.bankName ?? '')
        const branchName = toTrimmedString(row?.branch_name ?? row?.bank_branch ?? '')
        const accountType = normalizeAccountTypeToCode(row?.account_type ?? row?.accountType) || 'ordinary'
        const accountNumber = toTrimmedString(row?.account_number ?? row?.accountNumber ?? '')
        const accountHolder = toTrimmedString(row?.account_holder ?? row?.account_name ?? row?.accountName ?? '')
        return (
          bankName === requestedDefaultMatch.bank_name &&
          branchName === requestedDefaultMatch.branch_name &&
          accountType === requestedDefaultMatch.account_type &&
          accountNumber === requestedDefaultMatch.account_number &&
          accountHolder === requestedDefaultMatch.account_holder
        )
      })
      defaultId = toValidId(matched?.id ?? matched?.bank_account_id ?? matched?.bankAccountId)
    }
    if (!defaultId && responseBankAccounts.length > 0) {
      const fallbackId = Number(responseBankAccounts[0].id)
      defaultId = Number.isFinite(fallbackId) ? fallbackId : null
    }
    await persistSingleDefault(supabase, DEMO_USER_ID, defaultId)
    const r1 = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', DEMO_USER_ID)
      .is('customer_id', null)
      .eq('is_archived', false)
      .order('is_default', { ascending: false })
      .order('display_order', { ascending: true })
      .order('id', { ascending: true })
      .limit(5)
    if (!r1.error) {
      const normalizedRows = normalizeDefaultInMemory(r1.data || [])
      responseBankAccounts = normalizedRows.map((row: any) => {
        const branchName = row.branch_name ?? row.bank_branch ?? ''
        const accountType = normalizeAccountTypeToCode(row.account_type) || 'ordinary'
        const accountHolder = row.account_holder ?? row.account_name ?? ''
        return {
          ...row,
          branch_name: branchName,
          bank_branch: branchName,
          account_type: accountType,
          account_type_label: accountTypeCodeToLabel(accountType),
          account_number: row.account_number ?? '',
          account_holder: accountHolder,
          is_default: toBool(row.is_default),
          display_order: row.display_order ?? 0,
          id: row.id
        }
      })
      bankAccountIds = responseBankAccounts.map((row: any) => String(row.id))
    } else {
      console.warn('[API] PUT /api/company bank_accounts reselect error=', r1.error)
    }
  } catch (e) {
    console.warn('[API] default normalize: reselect exception=', e)
  }
  console.log('[API] PUT /api/company response bank_accounts count=', responseBankAccounts.length, 'ids=', bankAccountIds)
  return c.json({ success: true, bank_account_ids: bankAccountIds, bank_accounts: responseBankAccounts })
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
      portal_email: data.portal_email || null,
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
      portal_email: data.portal_email || null,
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
    delivery_no: row.delivery_no || null,
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
    doc_type: 'delivery',
    doc_date: docDate
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
    try {
      const { startDate, endDate } = monthRangeISO(month)
      query = query.gte('delivery_date', startDate).lt('delivery_date', endDate)
    } catch (err) {
      return c.json({ error: 'Invalid month format' }, 400)
    }
  }

  const { data, error } = await query
    .order('delivery_date', { ascending: false })
    .order('id', { ascending: false })

  if (error) return handleSupabaseError(c, error, 'deliveries select list')

  const rows = (data || []).map((row: any) => ({
    ...row,
    client_name: row.clients?.client_name || null,
    delivery_no: row.delivery_no || null,
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
    delivery_no: delivery?.delivery_no || null,
    delivery_number: delivery?.delivery_no || null,
    client_name: delivery?.clients?.client_name || null,
    items: items || []
  })
})

// 納品書番号生成
api.get('/deliveries/next-number', async (c) => {
  const date = c.req.query('date') || new Date().toISOString().split('T')[0]
  const docDate = date && date.length >= 10 ? date : new Date().toISOString().split('T')[0]
  
  const { data, error } = await supabase.rpc('next_document_no', {
    doc_type: 'delivery',
    doc_date: docDate
  })

  if (error) return handleSupabaseError(c, error, 'deliveries rpc next-number')
  return c.json({ delivery_no: data })
})

api.post('/deliveries', async (c) => {
  const data = await c.req.json()
  
  const rawDeliveryNo = typeof data.delivery_no === 'string' ? data.delivery_no.trim() : ''
  let deliveryNo = rawDeliveryNo
  if (!deliveryNo) {
    const docDate = data.delivery_date || new Date().toISOString().split('T')[0]
    const { data: nextNo, error: nextNoError } = await supabase.rpc('next_document_no', {
      doc_type: 'delivery',
      doc_date: docDate
    })
    if (nextNoError) return handleSupabaseError(c, nextNoError, 'deliveries rpc next-no')
    deliveryNo = nextNo
  }

  const taxSettings = await fetchCompanyTaxSettings(DEMO_USER_ID)
  const taxSummary = calculateTaxSummary(data.items || [], taxSettings)
  const subtotal = taxSummary.subtotal
  const totalTax = taxSummary.tax_amount
  const totalAmount = taxSummary.total_amount
  
  const { data: delivery, error: deliveryError } = await supabase
    .from('deliveries')
    .insert({
      user_id: DEMO_USER_ID,
      delivery_no: deliveryNo,
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
        tax_rate: resolveItemTaxRate(item, 10),
        amount: item.quantity * item.unit_price,
        notes: item.notes || '',
        display_order: i + 1
      })

    if (itemError) return handleSupabaseError(c, itemError, 'delivery_items insert')
  }
  
  return c.json({
    success: true,
    id: deliveryId,
    delivery_no: deliveryNo,
    delivery_number: deliveryNo
  })
})

api.put('/deliveries/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  
  const taxSettings = await fetchCompanyTaxSettings(DEMO_USER_ID)
  const taxSummary = calculateTaxSummary(data.items || [], taxSettings)
  const subtotal = taxSummary.subtotal
  const totalTax = taxSummary.tax_amount
  const totalAmount = taxSummary.total_amount
  
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
        tax_rate: resolveItemTaxRate(item, 10),
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
    doc_type: 'estimate',
    doc_date: docDate
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
  
  const rawEstimateNo = typeof data.estimate_no === 'string' ? data.estimate_no.trim() : ''
  let estimateNo = rawEstimateNo
  if (!estimateNo) {
    const docDate = data.estimate_date || new Date().toISOString().split('T')[0]
    const { data: nextNo, error: nextNoError } = await supabase.rpc('next_document_no', {
      doc_type: 'estimate',
      doc_date: docDate
    })
    if (nextNoError) return handleSupabaseError(c, nextNoError, 'estimates rpc next-no')
    estimateNo = nextNo
  }

  const taxSettings = await fetchCompanyTaxSettings(DEMO_USER_ID)
  const taxSummary = calculateTaxSummary(data.items || [], taxSettings)
  const subtotal = taxSummary.subtotal
  const taxAmount = taxSummary.tax_amount
  const totalAmount = taxSummary.total_amount
  
  const { data: estimate, error: estimateError } = await supabase
    .from('estimates')
    .insert({
      user_id: DEMO_USER_ID,
      estimate_no: estimateNo,
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
        tax_rate: resolveItemTaxRate(item, 10),
        amount: item.quantity * item.unit_price,
        notes: item.notes || '',
        display_order: i + 1,
        item_notes: item.item_notes || ''
      })

    if (itemError) return handleSupabaseError(c, itemError, 'estimate_items insert')
  }
  
  return c.json({ success: true, id: estimateId, estimate_no: estimateNo })
})

api.put('/estimates/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  
  const taxSettings = await fetchCompanyTaxSettings(DEMO_USER_ID)
  const taxSummary = calculateTaxSummary(data.items || [], taxSettings)
  const subtotal = taxSummary.subtotal
  const taxAmount = taxSummary.tax_amount
  const totalAmount = taxSummary.total_amount
  
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
        tax_rate: resolveItemTaxRate(item, 10),
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

function normalizeToYYYYMM(input: unknown): string {
  const s = String(input ?? '').trim()

  if (/^\d{4}-\d{2}$/.test(s)) return s
  if (/^\d{4}\/\d{2}$/.test(s)) return s.replace('/', '-')
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7)
  if (/^\d{4}\/\d{2}\/\d{2}/.test(s)) return s.slice(0, 7).replace('/', '-')

  const jp = /^(\d{4})年(\d{1,2})月/.exec(s)
  if (jp) {
    const y = jp[1]
    const m = String(jp[2]).padStart(2, '0')
    return `${y}-${m}`
  }

  return ''
}

function parseYYYYMM(yyyyMm: string): { year: number, month: number, yyyyMm: string } | null {
  const normalized = normalizeToYYYYMM(yyyyMm)
  const m = /^(\d{4})-(\d{2})$/.exec(normalized)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null
  }
  return { year, month, yyyyMm: normalized }
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function lastDayOfMonthUTC(year: number, month1to12: number): Date {
  return new Date(Date.UTC(year, month1to12, 0))
}

function monthRangeISO(yyyyMm: string): { startDate: string, endDate: string } {
  const parsed = parseYYYYMM(yyyyMm)
  if (!parsed) throw new Error('Invalid month format. expected YYYY-MM')
  const { year, month } = parsed
  const start = new Date(Date.UTC(year, month - 1, 1))
  const endExclusive = new Date(Date.UTC(year, month, 1))
  return { startDate: toISODate(start), endDate: toISODate(endExclusive) }
}

function addDaysUTC(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + days)
  return toISODate(d)
}

function clampDayToMonthEndUTC(year: number, month1to12: number, day: number): number {
  const end = lastDayOfMonthUTC(year, month1to12)
  const endDay = end.getUTCDate()
  return Math.min(Math.max(1, day), endDay)
}

function normalizeClosingDay(closingDay: unknown): number | 'eom' | null {
  if (closingDay === undefined || closingDay === null || closingDay === '') return null
  if (closingDay === 'eom' || closingDay === '末') return 'eom'
  const n = Number(closingDay)
  if (!Number.isFinite(n)) return null
  if (n === 0 || n === 31) return 'eom'
  return n
}

function calcBillingPeriodFromClosing(yyyyMm: string, closingDayRaw: unknown): { periodStart: string, periodEnd: string, issueDate: string } | null {
  const parsed = parseYYYYMM(yyyyMm)
  if (!parsed) return null
  const { year, month } = parsed
  const closingDay = normalizeClosingDay(closingDayRaw)

  if (closingDay === 'eom' || closingDay === null) {
    const start = new Date(Date.UTC(year, month - 1, 1))
    const end = lastDayOfMonthUTC(year, month)
    const startDate = toISODate(start)
    const endDate = toISODate(end)
    const issueDate = addDaysUTC(endDate, 1)
    return { periodStart: startDate, periodEnd: endDate, issueDate }
  }

  const endDay = clampDayToMonthEndUTC(year, month, closingDay)
  const periodEnd = toISODate(new Date(Date.UTC(year, month - 1, endDay)))

  const prev = { year: month === 1 ? year - 1 : year, month: month === 1 ? 12 : month - 1 }
  const prevEndDay = clampDayToMonthEndUTC(prev.year, prev.month, closingDay)
  const prevPeriodEnd = toISODate(new Date(Date.UTC(prev.year, prev.month - 1, prevEndDay)))
  const periodStart = addDaysUTC(prevPeriodEnd, 1)

  const issueDate = addDaysUTC(periodEnd, 1)
  return { periodStart, periodEnd, issueDate }
}

function normalizeDueDay(dueDayRaw: unknown): number | 'eom' | null {
  if (dueDayRaw === undefined || dueDayRaw === null || dueDayRaw === '') return null
  if (dueDayRaw === 'eom' || dueDayRaw === '末') return 'eom'
  const n = Number(dueDayRaw)
  if (!Number.isFinite(n)) return null
  if (n === 0 || n === 31) return 'eom'
  return n
}

function parsePaymentRule(paymentDayRaw: unknown): { monthOffset: number, dueDayRaw: unknown } | null {
  if (paymentDayRaw === undefined || paymentDayRaw === null || paymentDayRaw === '') return null
  const value = String(paymentDayRaw).trim()
  if (!value) return null
  let monthOffset = 1
  if (value.includes('翌々月')) {
    monthOffset = 2
  } else if (value.includes('翌月')) {
    monthOffset = 1
  } else if (value.includes('当月')) {
    monthOffset = 0
  }
  let dueDayRaw: unknown = null
  if (value.includes('末')) {
    dueDayRaw = 'eom'
  } else {
    const m = value.match(/(\d{1,2})/)
    if (m) dueDayRaw = Number(m[1])
  }
  return { monthOffset, dueDayRaw }
}

function calcDueDateFromRule(periodEndISO: string, monthOffsetRaw: unknown, dueDayRaw: unknown): string {
  const monthOffset = Number(monthOffsetRaw ?? 0)
  const dueDay = normalizeDueDay(dueDayRaw)

  const base = new Date(periodEndISO + 'T00:00:00.000Z')
  const y = base.getUTCFullYear()
  const m = base.getUTCMonth() + 1

  const payMonthFirst = new Date(Date.UTC(y, m - 1, 1))
  payMonthFirst.setUTCMonth(payMonthFirst.getUTCMonth() + monthOffset)

  const payYear = payMonthFirst.getUTCFullYear()
  const payMonth = payMonthFirst.getUTCMonth() + 1

  if (dueDay === 'eom' || dueDay === null) {
    return toISODate(lastDayOfMonthUTC(payYear, payMonth))
  }

  const d = clampDayToMonthEndUTC(payYear, payMonth, dueDay)
  return toISODate(new Date(Date.UTC(payYear, payMonth - 1, d)))
}

function normalizeBankAccountId(account: any, index: number): string {
  if (account.id) return String(account.id)
  return ''
}

async function fetchBankAccountsForUser(): Promise<any[]> {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('user_id', DEMO_USER_ID)
  if (error || !data) return []
  return data
}

async function fetchInvoiceBankAccounts(invoiceIds: number[]): Promise<Map<number, any[]>> {
  const map = new Map<number, any[]>()
  if (!invoiceIds || invoiceIds.length === 0) return map
  let data: any[] | null = null
  const ordered = await supabase
    .from('invoice_bank_accounts')
    .select('invoice_id, bank_account_id, sort_order')
    .in('invoice_id', invoiceIds)
    .order('sort_order', { ascending: true })
  if (!ordered.error && ordered.data) {
    data = ordered.data as any[]
  } else {
    const fallback = await supabase
      .from('invoice_bank_accounts')
      .select('invoice_id, bank_account_id')
      .in('invoice_id', invoiceIds)
    if (!fallback.error && fallback.data) {
      data = fallback.data as any[]
    }
  }
  if (!data) return map
  for (const row of data) {
    const id = Number(row.invoice_id)
    if (!map.has(id)) map.set(id, [])
    map.get(id)!.push(row)
  }
  return map
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
    doc_type: 'invoice',
    doc_date: docDate
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
  const targetMonth = c.req.query('month') || new Date().toISOString().slice(0, 7)
  
  const { data: companyInfo, error: companyError } = await supabase
    .from('company_info')
    .select('default_closing_day, default_payment_day')
    .eq('user_id', DEMO_USER_ID)
    .maybeSingle()

  if (companyError) return handleSupabaseError(c, companyError, 'company_info select defaults')

  let clientClosingDay: unknown = c.req.query('closing_day') || null
  let clientPaymentDay: unknown = null
  if (clientId) {
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('closing_day, payment_day')
      .eq('id', clientId)
      .eq('user_id', DEMO_USER_ID)
      .maybeSingle()

    if (clientError) return handleSupabaseError(c, clientError, 'clients select for uninvoiced-deliveries')
    if (client) {
      clientClosingDay = client.closing_day || clientClosingDay
      clientPaymentDay = client.payment_day || clientPaymentDay
    }
  }

  const resolvedClosingDay = clientClosingDay || companyInfo?.default_closing_day || null
  const resolvedPaymentDay = clientPaymentDay || companyInfo?.default_payment_day || null
  let periodStart: string
  let periodEnd: string
  let issueDate: string
  let dueDate: string | null = null
  try {
    const billing = calcBillingPeriodFromClosing(targetMonth, resolvedClosingDay)
    if (!billing) return c.json({ error: 'Invalid month format' }, 400)
    periodStart = billing.periodStart
    periodEnd = billing.periodEnd
    issueDate = billing.issueDate
    const paymentRule = parsePaymentRule(resolvedPaymentDay)
    dueDate = paymentRule ? calcDueDateFromRule(periodEnd, paymentRule.monthOffset, paymentRule.dueDayRaw) : null
  } catch (err) {
    return c.json({ error: 'Invalid month format' }, 400)
  }
  
  let query = supabase
    .from('deliveries')
    .select('*, clients(client_name)')
    .is('invoice_id', null)
    .in('status', ['delivered', 'issued'])
    .gte('delivery_date', periodStart)
    .lte('delivery_date', periodEnd)
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
    billing_period: { start: periodStart, end: periodEnd, issue_date: issueDate, due_date: dueDate }
  })
})

// 得意先ごとの未請求納品書サマリ（一括作成用）
api.get('/invoices/uninvoiced-summary', async (c) => {
  const targetMonth = c.req.query('month') || new Date().toISOString().slice(0, 7)
  
  let nextMonthStart: string
  let prevMonthStart: string
  try {
    const { startDate, endDate } = monthRangeISO(targetMonth)
    nextMonthStart = endDate
    const parsed = parseYYYYMM(targetMonth)
    if (!parsed) return c.json({ error: 'Invalid month format' }, 400)
    const { year, month } = parsed
    prevMonthStart = toISODate(new Date(Date.UTC(year, month - 2, 1)))
  } catch (err) {
    return c.json({ error: 'Invalid month format' }, 400)
  }

  const { data: companyInfo, error: companyError } = await supabase
    .from('company_info')
    .select('default_closing_day, default_payment_day')
    .eq('user_id', DEMO_USER_ID)
    .maybeSingle()

  if (companyError) return handleSupabaseError(c, companyError, 'company_info select defaults')

  const defaultClosingDay = companyInfo?.default_closing_day || null
  const defaultPaymentDay = companyInfo?.default_payment_day || null

  // 各得意先の締め日を考慮して未請求納品書をカウント
  const { data, error } = await supabase
    .from('deliveries')
    .select('id, total_amount, delivery_date, client_id, clients(client_name, client_code, closing_day, payment_day)')
    .is('invoice_id', null)
    .in('status', ['delivered', 'issued'])
    .gte('delivery_date', prevMonthStart)
    .lt('delivery_date', nextMonthStart)
    .eq('user_id', DEMO_USER_ID)

  if (error) return handleSupabaseError(c, error, 'deliveries select uninvoiced summary')

  const summary = new Map<string, any>()
  for (const row of data || []) {
    const clientId = String(row.client_id || '')
    if (!clientId) continue
    const client = row.clients || {}
    const closingDay = client.closing_day || defaultClosingDay || null
    const paymentDay = client.payment_day || defaultPaymentDay || null
    const billing = calcBillingPeriodFromClosing(targetMonth, closingDay)
    if (!billing) continue
    const { periodStart, periodEnd, issueDate } = billing
    const existing = summary.get(clientId)
    const deliveryDate = row.delivery_date || ''
    if (!deliveryDate || deliveryDate < periodStart || deliveryDate > periodEnd) continue
    const paymentRule = parsePaymentRule(paymentDay)
    const dueDate = paymentRule ? calcDueDateFromRule(periodEnd, paymentRule.monthOffset, paymentRule.dueDayRaw) : null
    if (!existing) {
      summary.set(clientId, {
        client_id: row.client_id,
        client_name: client.client_name || '',
        client_code: client.client_code || '',
        closing_day: closingDay,
        payment_day: paymentDay,
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
        issue_date: issueDate,
        due_date: dueDate,
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
  let startDate: string
  let endDate: string
  try {
    const range = monthRangeISO(targetMonth)
    startDate = range.startDate
    endDate = range.endDate
  } catch (err) {
    return c.json({ error: 'Invalid month format' }, 400)
  }
  
  // 納品日がターゲット月で、ステータスが「納品済」以外のデータをカウント
  const { data, error } = await supabase
    .from('deliveries')
    .select('status, clients(client_name)')
    .gte('delivery_date', startDate)
    .lt('delivery_date', endDate)
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
  
  const { data: companyInfo, error: companyError } = await supabase
    .from('company_info')
    .select('default_closing_day, default_payment_day')
    .eq('user_id', DEMO_USER_ID)
    .maybeSingle()

  if (companyError) return handleSupabaseError(c, companyError, 'company_info select defaults')

  const bankAccounts = await fetchBankAccountsForUser()
  const defaultBankAccountIds = bankAccounts
    .map((account: any, index: number) => normalizeBankAccountId(account, index))
    .filter((id: string) => /^\d+$/.test(id))
    .slice(0, 3)
  const requestedBankAccountIds = Array.isArray(data.bank_account_ids)
    ? data.bank_account_ids
        .map((id: any) => String(id).trim())
        .filter((id: string) => /^\d+$/.test(id))
        .slice(0, 3)
    : []
  const bankAccountIdsForInsert = requestedBankAccountIds.length > 0 ? requestedBankAccountIds : defaultBankAccountIds
  const taxSettings = pickTaxCalculationSettings(companyInfo || {})

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

    const closingDay = client.closing_day || companyInfo?.default_closing_day || null
    let periodStart: string
    let periodEnd: string
    let issueDate: string
    try {
      const billing = calcBillingPeriodFromClosing(target_month, closingDay)
      if (!billing) return c.json({ error: 'Invalid month format' }, 400)
      periodStart = billing.periodStart
      periodEnd = billing.periodEnd
      issueDate = billing.issueDate
    } catch (err) {
      return c.json({ error: 'Invalid month format' }, 400)
    }
    
    // 未請求納品書を取得
    const { data: deliveries, error: deliveriesError } = await supabase
      .from('deliveries')
      .select('*')
      .eq('client_id', clientId)
      .is('invoice_id', null)
      .in('status', ['delivered', 'issued'])
      .gte('delivery_date', periodStart)
      .lte('delivery_date', periodEnd)
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
        const deliveryTaxSummary = calculateTaxSummary(deliveryItems as any[], taxSettings)
        subtotal += deliveryTaxSummary.subtotal
        totalTax += deliveryTaxSummary.tax_amount
        for (const item of deliveryItems as any[]) {
          items.push({
            delivery_id: delivery.id,
            delivery_date: delivery.delivery_date,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            tax_rate: resolveItemTaxRate(item, 10)
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
    const invoiceDate = issueDate
    const sequenceBaseDate = `${target_month}-01`
    const { data: invoiceNo, error: invoiceNoError } = await supabase.rpc('next_document_no', {
      doc_type: 'invoice',
      doc_date: sequenceBaseDate
    })

    if (invoiceNoError) return handleSupabaseError(c, invoiceNoError, 'invoices rpc next-no (batch-create)')
    
    // 支払期限を計算
    const paymentDay = client.payment_day || companyInfo?.default_payment_day || null
    let paymentDueDate: string | null = null
    const paymentRule = parsePaymentRule(paymentDay)
    if (paymentRule) {
      paymentDueDate = calcDueDateFromRule(periodEnd, paymentRule.monthOffset, paymentRule.dueDayRaw)
    }
    
    // 請求書を作成
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        user_id: DEMO_USER_ID,
        invoice_no: invoiceNo,
        invoice_date: invoiceDate,
        client_id: clientId,
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
        payment_due_date: paymentDueDate,
        bank_account_id: bankAccountIdsForInsert[0] || null,
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

    if (invoiceId && bankAccountIdsForInsert.length > 0) {
      const rows = bankAccountIdsForInsert.map((bid: string, idx: number) => ({
        invoice_id: invoiceId,
        bank_account_id: bid,
        sort_order: idx + 1
      }))
      const { error: bankLinkError } = await supabase
        .from('invoice_bank_accounts')
        .insert(rows)
      if (bankLinkError) return handleSupabaseError(c, bankLinkError, 'invoice_bank_accounts insert batch-create')
    }
    
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
  const invoiceIds = rows.map((row: any) => Number(row.id)).filter((id: number) => Number.isFinite(id))
  const bankMap = await fetchInvoiceBankAccounts(invoiceIds)
  const enriched = rows.map((row: any) => {
    const items = bankMap.get(Number(row.id)) || []
    return {
      ...row,
      bank_account_ids: items.map((item: any) => item.bank_account_id)
    }
  })
  return c.json(enriched)
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
      .select('id, delivery_no, delivery_date, total_amount')
      .eq('invoice_id', id)
      .eq('user_id', DEMO_USER_ID)
      .order('delivery_date', { ascending: true })

    if (deliveriesError) return handleSupabaseError(c, deliveriesError, 'deliveries select invoice-linked')

    const { data: invoiceBankRows, error: invoiceBankError } = await supabase
      .from('invoice_bank_accounts')
      .select('bank_account_id')
      .eq('invoice_id', id)
      .order('sort_order', { ascending: true })
    if (invoiceBankError) return handleSupabaseError(c, invoiceBankError, 'invoice_bank_accounts select')

    const bankAccountIds = (invoiceBankRows || []).map((row: any) => row.bank_account_id)
    const bankAccounts = await fetchBankAccountsForUser()
    const bankAccountMap = new Map<string, any>()
    bankAccounts.forEach((account: any, index: number) => {
      const normalizedId = normalizeBankAccountId(account, index)
      if (normalizedId) bankAccountMap.set(normalizedId, account)
    })
    const selectedBankAccounts = bankAccountIds
      .map((id: any) => bankAccountMap.get(String(id)))
      .filter(Boolean)

    return c.json({
      ...(invoice || {}),
      client_name: invoice?.clients?.client_name || null,
      closing_day: invoice?.clients?.closing_day || null,
      payment_day: invoice?.clients?.payment_day || null,
      bank_account_ids: bankAccountIds,
      bank_accounts: selectedBankAccounts,
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
  
  const rawInvoiceNo = typeof data.invoice_no === 'string' ? data.invoice_no.trim() : ''
  let invoiceNo = rawInvoiceNo
  if (!invoiceNo) {
    const billingTargetMonth =
      toYYYYMM(data.period_to) ||
      toYYYYMM(data.billing_period_to) ||
      toYYYYMM(data.billing_period_end)
    const docDate = billingTargetMonth ? `${billingTargetMonth}-01` : (data.invoice_date || new Date().toISOString().split('T')[0])
    const { data: nextNo, error: nextNoError } = await supabase.rpc('next_document_no', {
      doc_type: 'invoice',
      doc_date: docDate
    })
    if (nextNoError) return handleSupabaseError(c, nextNoError, 'invoices rpc next-no')
    invoiceNo = nextNo
  }

  const taxSettings = await fetchCompanyTaxSettings(DEMO_USER_ID)
  const taxSummary = calculateTaxSummary(data.items || [], taxSettings)
  const taxAdjustment = parseSignedNumber(data.tax_adjustment, 0)
  const taxAdjustmentByRate = normalizeTaxAdjustmentByRateInput(data.tax_adjustment_by_rate)
  const hasTaxAdjustmentByRate = Object.keys(taxAdjustmentByRate).length > 0
  const taxAdjustmentByRateTotal = Object.values(taxAdjustmentByRate).reduce((sum, n) => sum + Number(n || 0), 0)
  const effectiveTaxAdjustment = hasTaxAdjustmentByRate ? taxAdjustmentByRateTotal : taxAdjustment
  const taxAdjustmentReason = parseTrimmedText(data.tax_adjustment_reason)
  if (effectiveTaxAdjustment !== 0 && !taxAdjustmentReason) {
    return c.json({ success: false, error: '税調整理由は必須です' }, 400)
  }
  const subtotal = taxSummary.subtotal
  const totalTax = taxSummary.tax_amount + effectiveTaxAdjustment
  const totalAmount = subtotal + totalTax

  const normalizedBankIds = normalizeBankAccountIdsInput(data.bank_account_ids)
  const bankAccountIds = normalizedBankIds.ids
  const bankAccountIdNums = bankAccountIds.map((id: string) => Number(id))
  
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      user_id: DEMO_USER_ID,
      invoice_no: invoiceNo,
      invoice_date: data.invoice_date,
      client_id: data.client_id,
      billing_period_start: data.billing_period_start || null,
      billing_period_end: data.billing_period_end || null,
      closing_date: data.closing_date || null,
      payment_due_date: data.payment_due_date || null,
      bank_account_id: bankAccountIdNums[0] || null,
      subtotal,
      tax_adjustment: taxAdjustment,
      tax_adjustment_reason: taxAdjustmentReason || null,
      tax_adjustment_by_rate: taxAdjustmentByRate,
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

  if (invoiceId && bankAccountIdNums.length > 0) {
    const rows = bankAccountIdNums.map((id: number, idx: number) => ({
      invoice_id: invoiceId,
      bank_account_id: id,
      sort_order: idx + 1
    }))
    const { error: bankLinkError } = await supabase
      .from('invoice_bank_accounts')
      .insert(rows)
    if (bankLinkError) return handleSupabaseError(c, bankLinkError, 'invoice_bank_accounts insert')
  }
  
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
        tax_rate: resolveItemTaxRate(item, 10),
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
  
  return c.json({ success: true, id: invoiceId, invoice_no: invoiceNo, bank_account_ids: bankAccountIds })
})

// 請求書更新
api.put('/invoices/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  
  const taxSettings = await fetchCompanyTaxSettings(DEMO_USER_ID)
  const taxSummary = calculateTaxSummary(data.items || [], taxSettings)
  const taxAdjustment = parseSignedNumber(data.tax_adjustment, 0)
  const taxAdjustmentByRate = normalizeTaxAdjustmentByRateInput(data.tax_adjustment_by_rate)
  const hasTaxAdjustmentByRate = Object.keys(taxAdjustmentByRate).length > 0
  const taxAdjustmentByRateTotal = Object.values(taxAdjustmentByRate).reduce((sum, n) => sum + Number(n || 0), 0)
  const effectiveTaxAdjustment = hasTaxAdjustmentByRate ? taxAdjustmentByRateTotal : taxAdjustment
  const taxAdjustmentReason = parseTrimmedText(data.tax_adjustment_reason)
  if (effectiveTaxAdjustment !== 0 && !taxAdjustmentReason) {
    return c.json({ success: false, error: '税調整理由は必須です' }, 400)
  }
  const subtotal = taxSummary.subtotal
  const totalTax = taxSummary.tax_amount + effectiveTaxAdjustment
  const totalAmount = subtotal + totalTax

  const normalizedBankIds = normalizeBankAccountIdsInput(data.bank_account_ids)
  const bankAccountIds = normalizedBankIds.ids
  const bankAccountIdNums = bankAccountIds.map((id: string) => Number(id))
  
  const { error: invoiceError } = await supabase
    .from('invoices')
    .update({
      invoice_date: data.invoice_date,
      client_id: data.client_id,
      billing_period_start: data.billing_period_start || null,
      billing_period_end: data.billing_period_end || null,
      closing_date: data.closing_date || null,
      payment_due_date: data.payment_due_date || null,
      bank_account_id: bankAccountIdNums[0] || null,
      subtotal,
      tax_adjustment: taxAdjustment,
      tax_adjustment_reason: taxAdjustmentReason || null,
      tax_adjustment_by_rate: taxAdjustmentByRate,
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

  const { error: bankDeleteError } = await supabase
    .from('invoice_bank_accounts')
    .delete()
    .eq('invoice_id', id)
  if (bankDeleteError) return handleSupabaseError(c, bankDeleteError, 'invoice_bank_accounts delete')
  if (bankAccountIdNums.length > 0) {
    const rows = bankAccountIdNums.map((bid: number, idx: number) => ({
      invoice_id: Number(id),
      bank_account_id: bid,
      sort_order: idx + 1
    }))
    const { error: bankInsertError } = await supabase
      .from('invoice_bank_accounts')
      .insert(rows)
    if (bankInsertError) return handleSupabaseError(c, bankInsertError, 'invoice_bank_accounts insert')
  }

  let savedBankIds: string[] = []
  if (bankAccountIdNums.length > 0) {
    const { data: bankRows, error: bankSelectError } = await supabase
      .from('invoice_bank_accounts')
      .select('bank_account_id')
      .eq('invoice_id', id)
      .order('sort_order', { ascending: true })
    if (bankSelectError) return handleSupabaseError(c, bankSelectError, 'invoice_bank_accounts select verify')
    if (!bankRows || bankRows.length === 0) {
      return handleSupabaseError(c, new Error('invoice_bank_accounts not saved'), 'invoice_bank_accounts verify')
    }
    savedBankIds = bankRows.map((row: any) => String(row.bank_account_id))
  } else {
    savedBankIds = []
  }
  
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
        tax_rate: resolveItemTaxRate(item, 10),
        amount: item.quantity * item.unit_price,
        display_order: i + 1
      })

    if (itemError) return handleSupabaseError(c, itemError, 'invoice_items insert')
  }
  
  return c.json({ success: true, bank_account_ids: savedBankIds })
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

// 取引先へ送付（受取ページ追加 + メール通知）
// POST /api/invoices/:invoiceId/send
api.post('/invoices/:id/send', async (c) => {
  const id = c.req.param('id')
  const idNum = Number(id)
  const userId = getResolvedUserId(c)
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return c.json({ success: false, error: 'INVALID_INVOICE_ID', message: '請求書IDが無効です' }, 400)
  }

  const body = await c.req.json().catch(() => ({}))
  const addToPortal = body.add_to_portal !== false
  const notifyEmail = body.notify_email !== false
  const overrideEmail = body.override_email && String(body.override_email).trim() ? String(body.override_email).trim() : null
  const pdfBase64Raw = typeof body.pdf_base64 === 'string' ? String(body.pdf_base64).trim() : ''

  if (!addToPortal && !notifyEmail) {
    return c.json({ success: false, error: 'NO_ACTION', message: '受取ページに追加またはメール通知のいずれかを選択してください' }, 400)
  }

  console.log(`[API] POST /api/invoices/${id}/send invoiceId=${idNum} add_to_portal=${addToPortal} notify_email=${notifyEmail}`)

  // 請求書取得
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, client_id, status, user_id, invoice_no, billing_period_start, billing_period_end, email_notify_attempts, subtotal, tax_amount, total_amount, pdf_path')
    .eq('id', idNum)
    .eq('user_id', userId)
    .maybeSingle()

  if (invoiceError) return handleSupabaseError(c, invoiceError, 'invoices select for send')
  if (!invoice) return c.json({ success: false, error: 'INVOICE_NOT_FOUND', message: '請求書が見つかりません' }, 404)

  // 得意先未設定チェック（portal追加前に）
  if (addToPortal && (invoice.client_id == null || invoice.client_id === '')) {
    return c.json({ success: false, error: 'CLIENT_REQUIRED', message: '得意先未設定' }, 400)
  }

  // 送付先メール決定: override_email > portal_email(帳票受取先) > email
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('portal_email, email, client_name')
    .eq('id', invoice.client_id)
    .eq('user_id', userId)
    .maybeSingle()

  if (clientError) return handleSupabaseError(c, clientError, 'clients select for send')
  const portalEmail = client?.portal_email && String(client.portal_email).trim() ? String(client.portal_email).trim() : ''
  const email = client?.email && String(client.email).trim() ? String(client.email).trim() : ''
  const resolvedToEmail = overrideEmail || portalEmail || email || ''

  if (!resolvedToEmail) {
    console.log(`[API] send invoiceId=${idNum} resolved_email=EMPTY (no recipient)`)
    return c.json({ success: false, error: 'NO_RECIPIENT', message: '送付先メールが未設定です' }, 400)
  }

  console.log(`[API] send invoiceId=${idNum} resolved_email=${resolvedToEmail}`)

  let portalOk = false
  let portalInvoiceId: string | null = null
  let portalErrorMessage: string | null = null
  let emailOk = false
  let emailErrorMessage: string | null = null
  let invoiceResponse: any = { id: invoice.id, status: invoice.status, sent_at: null, sent_to_email: null }
  const warnings: string[] = []
  let pdfStoreFailed = false

  // 発行側が渡した正式PDFがあれば先に保存してメタデータを記録する
  if (pdfBase64Raw) {
    try {
      const normalizedBase64 = pdfBase64Raw.replace(/^data:application\/pdf;base64,/i, '')
      const pdfBytes = Buffer.from(normalizedBase64, 'base64')
      if (pdfBytes.length > 0) {
        const storagePath = toPdfStoragePath(userId, idNum, invoice.invoice_no)
        const { error: uploadError } = await supabaseAdmin.storage
          .from(INVOICE_PDF_BUCKET)
          .upload(storagePath, pdfBytes, {
            contentType: 'application/pdf',
            upsert: true,
          })
        if (uploadError) {
          pdfStoreFailed = true
          warnings.push('PDF_STORE_FAILED')
          console.error(
            `[API] invoice pdf upload failed invoice_id=${idNum} path=${storagePath} size=${pdfBytes.length}`,
            uploadError
          )
        } else {
          const now = new Date().toISOString()
          const sha256 = toSha256Hex(pdfBytes)
          const { error: pdfMetaError } = await supabase
            .from('invoices')
            .update({
              pdf_path: storagePath,
              pdf_size: pdfBytes.length,
              pdf_sha256: sha256,
              pdf_generated_at: now,
              updated_at: now,
            })
            .eq('id', idNum)
            .eq('user_id', userId)
          if (pdfMetaError) {
            pdfStoreFailed = true
            warnings.push('PDF_META_UPDATE_FAILED')
            console.error(`[API] invoice pdf meta update failed invoice_id=${idNum} path=${storagePath}`, pdfMetaError)
          } else {
            console.log(`[API] invoice pdf stored invoice_id=${idNum} path=${storagePath} size=${pdfBytes.length}`)
          }
        }
      } else {
        pdfStoreFailed = true
        warnings.push('PDF_BYTES_EMPTY')
        console.warn(`[API] invoice pdf upload skipped invoice_id=${idNum} reason=empty_bytes`)
      }
    } catch (pdfError) {
      pdfStoreFailed = true
      warnings.push('PDF_STORE_EXCEPTION')
      console.error(`[API] invoice pdf upload exception invoice_id=${idNum}`, pdfError)
    }
  }

  if (pdfBase64Raw && pdfStoreFailed) {
    const status = 500
    const message = '正式PDFの保存に失敗したため送付を中断しました'
    console.error(
      `[API] send blocked invoice_id=${idNum} status=${status} message=${message} pdf_path=${invoice.pdf_path || '(null)'}`
    )
    return c.json({ success: false, error: 'PDF_STORE_FAILED', message }, status)
  }

  // 送付前提: 正式PDFが保存されていることを必須化
  const { data: pdfMetaRow, error: pdfMetaError } = await supabase
    .from('invoices')
    .select('pdf_path, pdf_size')
    .eq('id', idNum)
    .eq('user_id', userId)
    .maybeSingle()
  if (pdfMetaError) return handleSupabaseError(c, pdfMetaError, 'invoices select pdf meta for send')
  const storedPdfPath = pdfMetaRow?.pdf_path && String(pdfMetaRow.pdf_path).trim()
    ? String(pdfMetaRow.pdf_path).trim()
    : ''
  if (!storedPdfPath) {
    const status = 409
    const message = '正式PDFの保存に失敗したため送付できません。請求書PDFを再生成してから再実行してください。'
    console.error(
      `[API] send blocked invoice_id=${idNum} status=${status} message=${message} pdf_path=(null)`
    )
    return c.json(
      {
        success: false,
        error: 'PDF_REQUIRED_BEFORE_SEND',
        message,
      },
      status
    )
  }

  // (1) portal先行：失敗したら送付済にしない
  if (addToPortal) {
    let companyInfoId: number | null = null
    let companyInfoSelectError: unknown = null

    const companyInfoWithUser = await supabase
      .from('company_info')
      .select('id')
      .eq('user_id', userId)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (companyInfoWithUser.error) {
      companyInfoSelectError = companyInfoWithUser.error
      console.warn(
        `[API] company_info user-scoped select failed. fallback to first row. invoiceId=${idNum} user_id=${userId}`,
        companyInfoWithUser.error
      )
    } else if (companyInfoWithUser.data?.id != null) {
      companyInfoId = Number(companyInfoWithUser.data.id)
    }

    if (companyInfoId == null) {
      const companyInfoFallback = await supabase
        .from('company_info')
        .select('id')
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (companyInfoFallback.error) {
        const errInfo = {
          code: (companyInfoFallback.error as any)?.code,
          message: (companyInfoFallback.error as any)?.message || 'COMPANY_INFO_SELECT_FAILED',
          details: (companyInfoFallback.error as any)?.details,
          hint: (companyInfoFallback.error as any)?.hint,
        }
        portalErrorMessage = errInfo.message || 'COMPANY_INFO_SELECT_FAILED'
        console.error(
          '[API] portal_company upsert failed company_info lookup error',
          JSON.stringify(errInfo, null, 2)
        )
        const res: Record<string, unknown> = {
          success: false,
          error: 'PORTAL_COMPANY_UPSERT_FAILED',
          message: '受取ページ用会社情報の解決に失敗しました',
          portal: { ok: false, error: portalErrorMessage, portal_invoice_id: null },
          email: { ok: false },
        }
        if (isDev) res.debug = { company_info_error: errInfo }
        return c.json(res, 500)
      }

      if (companyInfoFallback.data?.id == null) {
        portalErrorMessage = 'COMPANY_INFO_NOT_FOUND'
        console.error(
          `[API] portal_company upsert failed company_info not found invoiceId=${idNum} user_id=${userId}`
        )
        const res: Record<string, unknown> = {
          success: false,
          error: 'PORTAL_COMPANY_UPSERT_FAILED',
          message: '受取ページ用会社情報が見つかりません',
          portal: { ok: false, error: portalErrorMessage, portal_invoice_id: null },
          email: { ok: false },
        }
        if (isDev) {
          res.debug = {
            company_info_error: companyInfoSelectError,
            fallback: 'single-tenant first row',
          }
        }
        return c.json(res, 500)
      }

      companyInfoId = Number(companyInfoFallback.data.id)
      console.warn(
        `[API] company_info fallback applied (single-tenant first row). invoiceId=${idNum} user_id=${userId} company_info_id=${companyInfoId}`
      )
    }

    const { data: portalCompanyRow, error: portalCompanyError } = await supabase
      .from('portal_companies')
      .upsert(
        { user_id: userId, company_info_id: companyInfoId },
        { onConflict: 'user_id,company_info_id' }
      )
      .select('id')
      .single()

    if (portalCompanyError || !portalCompanyRow?.id) {
      const errInfo = {
        code: (portalCompanyError as any)?.code,
        message: (portalCompanyError as any)?.message || 'PORTAL_COMPANY_UPSERT_FAILED',
        details: (portalCompanyError as any)?.details,
        hint: (portalCompanyError as any)?.hint,
      }
      portalErrorMessage = errInfo.message || 'PORTAL_COMPANY_UPSERT_FAILED'
      console.log('[API] portal ok=false portal_invoice_id=null')
      console.error('[API] portal_company upsert failed', JSON.stringify(errInfo, null, 2))
      const res: Record<string, unknown> = {
        success: false,
        error: 'PORTAL_COMPANY_UPSERT_FAILED',
        message: '受取ページ用会社情報の登録に失敗しました',
        portal: { ok: false, error: portalErrorMessage, portal_invoice_id: null },
        email: { ok: false },
      }
      if (isDev) res.debug = errInfo
      return c.json(res, 500)
    }

    const portalCompanyId = String(portalCompanyRow.id)
    const portalPayload: Record<string, unknown> = {
      invoice_id: idNum,
      client_id: invoice.client_id,
      company_id: portalCompanyId,
      user_id: userId,
      updated_at: new Date().toISOString(),
    }
    const { data: portalRow, error: portalError } = await supabase
      .from('portal_invoices')
      .upsert(portalPayload, { onConflict: 'invoice_id' })
      .select('id')
      .maybeSingle()

    if (portalError || !portalRow?.id) {
      const errInfo = {
        code: (portalError as any)?.code,
        message: (portalError as any)?.message || 'PORTAL_UPSERT_FAILED',
        details: (portalError as any)?.details,
        hint: (portalError as any)?.hint,
      }
      portalErrorMessage = errInfo.message || 'PORTAL_UPSERT_FAILED'
      console.log(`[API] portal ok=false portal_invoice_id=null`)
      console.error('[API] portal_invoice upsert failed', JSON.stringify(errInfo, null, 2))
      const res: Record<string, unknown> = {
        success: false,
        error: 'PORTAL_UPSERT_FAILED',
        message: '受取ページへの追加に失敗しました',
        portal: { ok: false, error: portalErrorMessage, portal_invoice_id: null },
        email: { ok: false },
      }
      if (isDev) res.debug = errInfo
      return c.json(res, 500)
    }
    portalOk = true
    portalInvoiceId = String(portalRow.id)
    console.log(`[API] portal ok=true portal_invoice_id=${portalInvoiceId}`)
    try {
      await supabase
        .from('portal_invoice_events')
        .insert({
          portal_invoice_id: portalInvoiceId,
          actor_user_id: userId,
          type: 'sent',
          payload: { invoice_id: idNum },
        })
    } catch (eventErr) {
      console.warn('[API] portal sent event insert failed', eventErr)
      warnings.push('PORTAL_SENT_EVENT_SAVE_FAILED')
    }
  } else {
    // 既存仕様互換: ポータル追加をオフにした場合は送付済確定しない
    console.log('[API] portal ok=false portal_invoice_id=null')
    return c.json({
      success: true,
      invoice: {
        id: invoice.id,
        status: invoice.status,
        sent_at: null,
        sent_to_email: null,
      },
      portal: { ok: false, portal_invoice_id: null, skipped: true },
      email: { ok: false, skipped: true }
    }, 200)
  }

  // (2) portal成功後に送付済を確定
  if (portalOk) {
    const now = new Date().toISOString()
    const { data: updatedInvoice, error: updateError } = await supabase
      .from('invoices')
      .update({
        status: 'sent',
        sent_at: now,
        sent_to_email: resolvedToEmail,
        updated_at: now
      })
      .eq('id', idNum)
      .eq('user_id', userId)
      .select('id, status, sent_at, sent_to_email')
      .maybeSingle()

    if (updateError) {
      const errInfo = {
        code: (updateError as any).code,
        message: (updateError as any).message,
        details: (updateError as any).details,
        hint: (updateError as any).hint,
      }
      console.error(`[API] send invoiceId=${idNum} invoices update failed`, JSON.stringify(errInfo, null, 2))
      const res: Record<string, unknown> = {
        success: false,
        error: 'INVOICES_UPDATE_FAILED',
        message: '請求書の更新に失敗しました',
      }
      if (isDev) res.debug = errInfo
      return c.json(res, 500)
    }
    invoiceResponse = updatedInvoice || invoiceResponse
  }

  // (3) portal成功時のみ納品書スナップショットを保存
  if (portalOk && portalInvoiceId) {
    try {
      let deliveries: any[] = []

      const { data: linkedDeliveries, error: linkedError } = await supabase
        .from('deliveries')
        .select('*')
        .eq('invoice_id', idNum)
        .eq('user_id', userId)
        .order('delivery_date', { ascending: true })
        .order('id', { ascending: true })
      if (linkedError) throw linkedError
      deliveries = linkedDeliveries || []

      // invoice_id連携が無い請求書向けに、既存の期間条件（締め期間）でも拾う
      if (
        deliveries.length === 0 &&
        invoice.client_id &&
        invoice.billing_period_start &&
        invoice.billing_period_end
      ) {
        const { data: periodDeliveries, error: periodError } = await supabase
          .from('deliveries')
          .select('*')
          .eq('client_id', invoice.client_id)
          .in('status', ['delivered', 'issued', 'invoiced'])
          .gte('delivery_date', invoice.billing_period_start)
          .lte('delivery_date', invoice.billing_period_end)
          .eq('user_id', userId)
          .order('delivery_date', { ascending: true })
          .order('id', { ascending: true })
        if (periodError) throw periodError
        deliveries = periodDeliveries || []
      }

      if (deliveries.length > 0) {
        const deliveryIds = deliveries
          .map((d: any) => Number(d.id))
          .filter((n: number) => Number.isFinite(n))
        const { data: itemsRows, error: itemsError } = await supabase
          .from('delivery_items')
          .select('*')
          .in('delivery_id', deliveryIds)
          .order('delivery_id', { ascending: true })
          .order('display_order', { ascending: true })
        if (itemsError) throw itemsError
        const itemsByDelivery = new Map<number, any[]>()
        for (const row of (itemsRows || [])) {
          const key = Number((row as any).delivery_id)
          const list = itemsByDelivery.get(key) || []
          list.push(row)
          itemsByDelivery.set(key, list)
        }
        const snapshotRows = deliveries.map((delivery: any) => ({
          portal_invoice_id: portalInvoiceId,
          delivery_id: Number(delivery.id),
          snapshot: {
            delivery: {
              id: Number(delivery.id),
              delivery_no: delivery.delivery_no || null,
              delivery_date: delivery.delivery_date || null,
              subtotal: Number(delivery.subtotal || 0),
              tax_amount: Number(delivery.tax_amount || 0),
              total_amount: Number(delivery.total_amount || 0),
            },
            items: (itemsByDelivery.get(Number(delivery.id)) || []).map((item: any) => ({
              id: item.id,
              product_name: item.product_name || '',
              quantity: Number(item.quantity || 0),
              unit_price: Number(item.unit_price || 0),
              amount: Number(item.amount || (Number(item.quantity || 0) * Number(item.unit_price || 0))),
              tax_rate: resolveItemTaxRate(item, 10),
              notes: item.notes || '',
              item_notes: item.item_notes || '',
              display_order: Number(item.display_order || 0),
            })),
            invoice_summary: {
              subtotal: Number(invoice.subtotal || 0),
              tax_amount: Number(invoice.tax_amount || 0),
              total_amount: Number(invoice.total_amount || 0),
            },
          },
          created_at: new Date().toISOString(),
        }))
        const { error: snapshotError } = await supabase
          .from('portal_invoice_delivery_snapshots')
          .upsert(snapshotRows, { onConflict: 'portal_invoice_id,delivery_id' })
        if (snapshotError) throw snapshotError
      }
    } catch (snapshotErr) {
      warnings.push('SNAPSHOT_FAILED')
      console.error(`[API] send invoiceId=${idNum} snapshot failed`, snapshotErr)
    }
  }

  // (4) email通知は独立。失敗しても送付済は維持
  if (notifyEmail) {
    try {
      const { data: companyInfo } = await supabase
        .from('company_info')
        .select('company_name')
        .eq('user_id', userId)
        .maybeSingle()

      const emailResult = await sendInvoiceNotification({
        to: resolvedToEmail,
        companyName: companyInfo?.company_name || '御社',
        clientName: client?.client_name || '',
        invoiceNo: invoice.invoice_no || `INV-${idNum}`,
        portalPath: portalInvoiceId ? `/portal/invoices/${portalInvoiceId}` : '/portal/invoice'
      })

      emailOk = emailResult.sent
      emailErrorMessage = emailResult.error || null
    } catch (err) {
      emailOk = false
      emailErrorMessage = err instanceof Error ? err.message : String(err)
    }

    const attempts = Number(invoice.email_notify_attempts || 0) + 1
    const { error: emailStateError } = await supabase
      .from('invoices')
      .update({
        email_notify_status: emailOk ? 'sent' : 'failed',
        email_notified_at: emailOk ? new Date().toISOString() : null,
        email_notify_error: emailOk ? null : (emailErrorMessage || 'UNKNOWN_EMAIL_ERROR'),
        email_notify_attempts: attempts,
        updated_at: new Date().toISOString(),
      })
      .eq('id', idNum)
      .eq('user_id', userId)
    if (emailStateError) {
      console.error(`[API] send invoiceId=${idNum} email state update failed`, emailStateError)
      warnings.push('EMAIL_STATE_SAVE_FAILED')
    }
  }

  console.log(`[API] email ok=${emailOk} error=${emailErrorMessage || ''}`)
  if (!emailOk && notifyEmail) warnings.push('EMAIL_FAILED')

  return c.json({
    success: true,
    invoice: {
      id: invoiceResponse?.id,
      status: invoiceResponse?.status || 'sent',
      sent_at: invoiceResponse?.sent_at || null,
      sent_to_email: invoiceResponse?.sent_to_email || null
    },
    portal: { ok: portalOk, portal_invoice_id: portalInvoiceId, ...(portalErrorMessage ? { error: portalErrorMessage } : {}) },
    email: { ok: emailOk, ...(emailErrorMessage ? { error: emailErrorMessage } : {}), ...(notifyEmail ? {} : { skipped: true }) },
    ...(warnings.length > 0 && { warnings })
  }, 200)
})

// =====================================
// 受け取り側ポータル API
// =====================================
api.get('/portal/me/companies', async (c) => {
  const userId = getResolvedUserId(c)
  const { data: profileRows, error: profileError } = await supabase
    .from('portal_company_profiles')
    .select('id, display_name, postal_code, address, phone, fax, email, source, created_at, updated_at')
    .eq('owner_user_id', userId)
    .order('updated_at', { ascending: false })

  if (profileError) return handleSupabaseError(c, profileError, 'portal_company_profiles select')

  const profileIds = (profileRows || []).map((row: any) => row.id).filter(Boolean)
  let linkRows: any[] = []
  if (profileIds.length > 0) {
    const { data: rows, error: linkError } = await supabase
      .from('portal_profile_links')
      .select('profile_id, portal_company_id')
      .in('profile_id', profileIds)
    if (linkError) return handleSupabaseError(c, linkError, 'portal_profile_links select for me/companies')
    linkRows = rows || []
  }

  const linkedProfileIds = new Set<string>(linkRows.map((row: any) => String(row.profile_id)))
  const profiles = (profileRows || []).filter((row: any) => linkedProfileIds.has(String(row.id)))

  const warnings: string[] = []
  if ((profileRows || []).length === 0) warnings.push('profiles=0')
  if (linkRows.length === 0) warnings.push('links=0')
  if ((profileRows || []).length > 0 && profiles.length === 0) warnings.push('linked_profiles=0')

  console.log(
    `[API] GET /api/portal/me/companies user_id=${userId} profiles=${(profileRows || []).length} links=${linkRows.length} selectable=${profiles.length}`
  )
  return c.json({
    success: true,
    profiles,
    ...(warnings.length > 0
      ? {
          warnings,
          debug_counts: {
            profiles: (profileRows || []).length,
            links: linkRows.length,
            selectable_profiles: profiles.length,
          },
        }
      : {}),
  })
})

function isMissingColumnError(error: any): boolean {
  const code = String((error && error.code) || '')
  const message = String((error && error.message) || '').toLowerCase()
  return code === '42703' || message.includes('column') && message.includes('does not exist')
}

async function detectAvailableColumns(table: string, candidates: string[]): Promise<string[]> {
  const found: string[] = []
  for (const col of candidates) {
    const { error } = await supabase
      .from(table)
      .select(col)
      .limit(1)
    if (!error) {
      found.push(col)
      continue
    }
    if (!isMissingColumnError(error)) {
      throw error
    }
  }
  return found
}

function parseFilterYYYYMM(v: string): { y: number; m: number } | null {
  const s = String(v || '').trim()
  if (!/^\d{4}-\d{2}$/.test(s)) return null
  const y = Number(s.slice(0, 4))
  const m = Number(s.slice(5, 7))
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null
  return { y, m }
}

function toYYYYMM(value: unknown): string | null {
  const raw = String(value || '').trim()
  const m = raw.match(/^(\d{4})-(\d{2})/)
  if (!m) return null
  const month = Number(m[2])
  if (!Number.isFinite(month) || month < 1 || month > 12) return null
  return `${m[1]}-${m[2]}`
}

api.get('/portal/invoices', async (c) => {
  const userId = getResolvedUserId(c)
  const profileId = (c.req.query('profile_id') || '').trim()
  const status = (c.req.query('status') || c.req.query('state') || '').trim()
  const q = (c.req.query('q') || c.req.query('search') || '').trim()
  const billingMonthFrom = (c.req.query('billing_month_from') || '').trim()
  const billingMonthTo = (c.req.query('billing_month_to') || '').trim()

  if (!profileId) {
    return c.json({ success: false, error: 'PROFILE_ID_REQUIRED', message: 'profile_id は必須です' }, 400)
  }
  if (status && !['unconfirmed', 'approved', 'rejected'].includes(status)) {
    return c.json({ success: false, error: 'INVALID_STATUS', message: 'status は unconfirmed/approved/rejected のみ指定可能です' }, 400)
  }
  if (billingMonthFrom && !parseFilterYYYYMM(billingMonthFrom)) {
    return c.json({ success: false, error: 'INVALID_BILLING_MONTH_FROM', message: 'billing_month_from は YYYY-MM 形式で指定してください' }, 400)
  }
  if (billingMonthTo && !parseFilterYYYYMM(billingMonthTo)) {
    return c.json({ success: false, error: 'INVALID_BILLING_MONTH_TO', message: 'billing_month_to は YYYY-MM 形式で指定してください' }, 400)
  }
  if (billingMonthFrom && billingMonthTo && billingMonthFrom > billingMonthTo) {
    return c.json({ success: false, error: 'INVALID_BILLING_MONTH_RANGE', message: 'billing_month_from は billing_month_to 以下で指定してください' }, 400)
  }

  const { data: profile, error: profileError } = await supabase
    .from('portal_company_profiles')
    .select('id')
    .eq('id', profileId)
    .eq('owner_user_id', userId)
    .maybeSingle()
  if (profileError) return handleSupabaseError(c, profileError, 'portal_company_profiles validate')
  if (!profile) {
    return c.json({ success: false, error: 'PROFILE_NOT_FOUND', message: 'プロフィールが見つかりません' }, 404)
  }

  const { data: linkRows, error: linkError } = await supabase
    .from('portal_profile_links')
    .select('portal_company_id')
    .eq('profile_id', profileId)
  if (linkError) return handleSupabaseError(c, linkError, 'portal_profile_links select')
  const companyIds = (linkRows || []).map((row: any) => row.portal_company_id).filter(Boolean)
  if (companyIds.length === 0) {
    return c.json({ success: true, invoices: [] })
  }

  let invoiceQuery = supabase
    .from('portal_invoices')
    .select('id, invoice_id, client_id, company_id, user_id, created_at, updated_at')
    .in('company_id', companyIds)
    .order('created_at', { ascending: false })

  let { data: portalInvoices, error: invoicesError } = await invoiceQuery
  if (invoicesError) return handleSupabaseError(c, invoicesError, 'portal_invoices list')
  if (!portalInvoices || portalInvoices.length === 0) {
    return c.json({ success: true, invoices: [] })
  }

  let invoiceIds = portalInvoices.map((row: any) => Number(row.invoice_id)).filter((n: number) => Number.isFinite(n))

  let keywordMatchedInvoiceIds: Set<number> | null = null
  if (q && invoiceIds.length > 0) {
    const keywordColumns = [
      'invoice_no',
      'invoice_number',
      'sender_name',
      'vendor_name',
      'issuer_name',
      'subject',
      'title',
      'memo',
    ]
    const availableKeywordColumns = await detectAvailableColumns('invoices', keywordColumns)
    if (availableKeywordColumns.length > 0) {
      const searchPattern = `%${q}%`
      let keywordQuery: any = supabase
        .from('invoices')
        .select('id')
        .in('id', invoiceIds)
      keywordQuery = keywordQuery.or(
        availableKeywordColumns.map((col: string) => `${col}.ilike.${searchPattern}`).join(',')
      )
      const { data: keywordRows, error: keywordError } = await keywordQuery
      if (keywordError) return handleSupabaseError(c, keywordError, 'invoices keyword filter')
      keywordMatchedInvoiceIds = new Set<number>(
        (keywordRows || []).map((row: any) => Number(row.id)).filter((n: number) => Number.isFinite(n))
      )
    } else {
      keywordMatchedInvoiceIds = new Set<number>()
    }
  }

  const availablePeriodToColumns = await detectAvailableColumns('invoices', [
    'period_to',
    'billing_period_to',
    'billing_period_end',
  ])
  const availablePeriodFromColumns = await detectAvailableColumns('invoices', [
    'period_from',
    'billing_period_from',
    'billing_period_start',
  ])
  const availableIssueDateColumns = await detectAvailableColumns('invoices', [
    'issue_date',
    'invoice_date',
  ])
  const availableDeletedAtColumns = await detectAvailableColumns('invoices', [
    'deleted_at',
  ])
  const availableIsDeletedColumns = await detectAvailableColumns('invoices', [
    'is_deleted',
  ])
  const availableArchivedColumns = await detectAvailableColumns('invoices', [
    'archived',
    'is_archived',
  ])
  const periodToColumn = availablePeriodToColumns[0] || null
  const periodFromColumn = availablePeriodFromColumns[0] || null
  const issueDateColumn = availableIssueDateColumns[0] || null
  const deletedAtColumn = availableDeletedAtColumns[0] || null
  const isDeletedColumn = availableIsDeletedColumns[0] || null
  const archivedColumn = availableArchivedColumns[0] || null
  const invoiceMetaSelectColumns = ['id', 'invoice_no', 'invoice_date', 'total_amount']
  ;[periodToColumn, periodFromColumn, issueDateColumn, deletedAtColumn, isDeletedColumn, archivedColumn].forEach((col) => {
    if (col && !invoiceMetaSelectColumns.includes(col)) invoiceMetaSelectColumns.push(col)
  })

  const portalInvoiceIds = portalInvoices.map((row: any) => row.id)

  const senderUserIds = Array.from(
    new Set((portalInvoices || []).map((row: any) => String(row.user_id || '')).filter(Boolean))
  )

  const [statusRes, viewsRes, invoiceMetaRes, senderCompanyRes] = await Promise.all([
    supabase
      .from('portal_invoice_status')
      .select('portal_invoice_id, state, updated_at, rejected_reason')
      .in('portal_invoice_id', portalInvoiceIds),
    supabase
      .from('portal_invoice_views')
      .select('portal_invoice_id, first_viewed_at')
      .eq('viewer_user_id', userId)
      .in('portal_invoice_id', portalInvoiceIds),
    invoiceIds.length > 0
      ? supabase
          .from('invoices')
          .select(invoiceMetaSelectColumns.join(','))
          .in('id', invoiceIds)
      : Promise.resolve({ data: [], error: null } as any),
    senderUserIds.length > 0
      ? supabase
          .from('company_info')
          .select('user_id, company_name, id')
          .in('user_id', senderUserIds)
      : Promise.resolve({ data: [], error: null } as any),
  ])

  if (statusRes.error) return handleSupabaseError(c, statusRes.error, 'portal_invoice_status list')
  if (viewsRes.error) return handleSupabaseError(c, viewsRes.error, 'portal_invoice_views list')
  if (invoiceMetaRes.error) return handleSupabaseError(c, invoiceMetaRes.error, 'invoices meta list')
  if (senderCompanyRes.error) return handleSupabaseError(c, senderCompanyRes.error, 'company_info sender list')

  const statusMap = new Map<string, any>((statusRes.data || []).map((row: any) => [String(row.portal_invoice_id), row]))
  const viewedSet = new Set<string>((viewsRes.data || []).map((row: any) => String(row.portal_invoice_id)))
  const activeInvoiceMetaRows = (invoiceMetaRes.data || []).filter((row: any) => {
    const deletedAtValue = deletedAtColumn ? row?.[deletedAtColumn] : null
    const isDeletedValue = isDeletedColumn ? row?.[isDeletedColumn] : false
    const archivedValue = archivedColumn ? row?.[archivedColumn] : false
    return !deletedAtValue && isDeletedValue !== true && archivedValue !== true
  })
  const invoiceMetaMap = new Map<string, any>(activeInvoiceMetaRows.map((row: any) => [String(row.id), row]))
  portalInvoices = portalInvoices.filter((row: any) => invoiceMetaMap.has(String(row.invoice_id)))
  if (portalInvoices.length === 0) {
    return c.json({ success: true, invoices: [] })
  }
  const senderCompanyMap = new Map<string, string>()
  for (const row of (senderCompanyRes.data || [])) {
    const key = String((row as any).user_id || '')
    if (!key || senderCompanyMap.has(key)) continue
    senderCompanyMap.set(key, String((row as any).company_name || '').trim())
  }

  let result = portalInvoices.map((row: any) => {
    const statusRow = statusMap.get(String(row.id))
    const meta = invoiceMetaMap.get(String(row.invoice_id))
    const stateValue = statusRow?.state || 'unconfirmed'
    const billingTargetMonth =
      toYYYYMM(periodToColumn ? meta?.[periodToColumn] : null) ||
      toYYYYMM(periodFromColumn ? meta?.[periodFromColumn] : null) ||
      toYYYYMM(issueDateColumn ? meta?.[issueDateColumn] : null)
    return {
      id: String(row.id),
      invoice_id: row.invoice_id,
      client_id: row.client_id,
      company_id: row.company_id,
      user_id: row.user_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      state: stateValue,
      rejected_reason: statusRow?.rejected_reason || null,
      is_read: viewedSet.has(String(row.id)),
      first_viewed_at: viewedSet.has(String(row.id))
        ? (viewsRes.data || []).find((v: any) => String(v.portal_invoice_id) === String(row.id))?.first_viewed_at || null
        : null,
      invoice_no: meta?.invoice_no || null,
      invoice_date: meta?.invoice_date || null,
      billing_target_month: billingTargetMonth,
      total_amount: meta?.total_amount || 0,
      sender_company_name: senderCompanyMap.get(String(row.user_id || '')) || null,
    }
  })

  if (billingMonthFrom) {
    result = result.filter((row: any) => row.billing_target_month && row.billing_target_month >= billingMonthFrom)
  }
  if (billingMonthTo) {
    result = result.filter((row: any) => row.billing_target_month && row.billing_target_month <= billingMonthTo)
  }

  if (status) {
    result = result.filter((row: any) => row.state === status)
  }
  if (q) {
    const lowered = q.toLowerCase()
    result = result.filter((row: any) => {
      const portalInvoiceId = String(row.id || '').toLowerCase()
      const invoiceIdStr = String(row.invoice_id || '').toLowerCase()
      const invoiceNo = String(row.invoice_no || '').toLowerCase()
      const senderCompanyName = String(row.sender_company_name || '').toLowerCase()
      const invoiceIdNum = Number(row.invoice_id)
      const matchedByInvoiceColumns =
        keywordMatchedInvoiceIds !== null &&
        Number.isFinite(invoiceIdNum) &&
        keywordMatchedInvoiceIds.has(invoiceIdNum)
      return (
        matchedByInvoiceColumns ||
        portalInvoiceId.includes(lowered) ||
        invoiceIdStr.includes(lowered) ||
        invoiceNo.includes(lowered) ||
        senderCompanyName.includes(lowered)
      )
    })
  }

  return c.json({ success: true, invoices: result })
})

api.get('/portal/invoices/:portalInvoiceId', async (c) => {
  const userId = getResolvedUserId(c)
  const portalInvoiceId = c.req.param('portalInvoiceId')

  const { data: portalInvoice, error: portalInvoiceError } = await supabase
    .from('portal_invoices')
    .select('id, invoice_id, client_id, company_id, user_id, created_at, updated_at')
    .eq('id', portalInvoiceId)
    .maybeSingle()
  if (portalInvoiceError) return handleSupabaseError(c, portalInvoiceError, 'portal_invoices detail')
  if (!portalInvoice) {
    return c.json({ success: false, error: 'PORTAL_INVOICE_NOT_FOUND', message: '請求書が見つかりません' }, 404)
  }

  const { data: profileRows, error: profileRowsError } = await supabase
    .from('portal_company_profiles')
    .select('id')
    .eq('owner_user_id', userId)
  if (profileRowsError) return handleSupabaseError(c, profileRowsError, 'portal_company_profiles owner list')
  const profileIds = (profileRows || []).map((row: any) => row.id)
  if (profileIds.length === 0) {
    return c.json({ success: false, error: 'FORBIDDEN', message: 'アクセス権がありません' }, 403)
  }

  const { data: accessLink, error: accessError } = await supabase
    .from('portal_profile_links')
    .select('id')
    .in('profile_id', profileIds)
    .eq('portal_company_id', portalInvoice.company_id)
    .limit(1)
    .maybeSingle()
  if (accessError) return handleSupabaseError(c, accessError, 'portal_profile_links access check')
  if (!accessLink) {
    return c.json({ success: false, error: 'FORBIDDEN', message: 'アクセス権がありません' }, 403)
  }

  const [snapshotsRes, statusRes, eventsRes, invoiceRes, currentViewRes] = await Promise.all([
    supabase
      .from('portal_invoice_delivery_snapshots')
      .select('delivery_id, snapshot, created_at')
      .eq('portal_invoice_id', portalInvoiceId)
      .order('delivery_id', { ascending: true }),
    supabase
      .from('portal_invoice_status')
      .select('portal_invoice_id, state, rejected_reason, updated_at')
      .eq('portal_invoice_id', portalInvoiceId)
      .maybeSingle(),
    supabase
      .from('portal_invoice_events')
      .select('id, actor_user_id, type, payload, created_at')
      .eq('portal_invoice_id', portalInvoiceId)
      .order('created_at', { ascending: true }),
    supabase
      .from('invoices')
      .select('id, client_id, invoice_no, invoice_date, subtotal, tax_amount, total_amount, notes')
      .eq('id', portalInvoice.invoice_id)
      .maybeSingle(),
    supabase
      .from('portal_invoice_views')
      .select('id, first_viewed_at')
      .eq('portal_invoice_id', portalInvoiceId)
      .eq('viewer_user_id', userId)
      .maybeSingle(),
  ])

  if (snapshotsRes.error) return handleSupabaseError(c, snapshotsRes.error, 'portal snapshots detail')
  if (statusRes.error) return handleSupabaseError(c, statusRes.error, 'portal status detail')
  if (eventsRes.error) return handleSupabaseError(c, eventsRes.error, 'portal events detail')
  if (invoiceRes.error) return handleSupabaseError(c, invoiceRes.error, 'invoice detail for portal')
  if (currentViewRes.error) return handleSupabaseError(c, currentViewRes.error, 'portal view detail')
  if (!invoiceRes.data) {
    return c.json({ success: false, error: 'INVOICE_NOT_FOUND', message: '請求書は削除済みです' }, 404)
  }

  const senderUserId = String((portalInvoice as any)?.user_id || '')
  let senderCompanyName: string | null = null
  if (senderUserId) {
    const senderRes = await supabase
      .from('company_info')
      .select('company_name')
      .eq('user_id', senderUserId)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (senderRes.error) return handleSupabaseError(c, senderRes.error, 'company_info sender detail')
    senderCompanyName = senderRes.data?.company_name ? String(senderRes.data.company_name) : null
  }

  const invoiceClientId = Number((invoiceRes.data as any)?.client_id || 0)
  let recipientClient: any = null
  if (invoiceClientId > 0) {
    const recipientRes = await supabase
      .from('clients')
      .select('*')
      .eq('id', invoiceClientId)
      .eq('user_id', senderUserId || DEMO_USER_ID)
      .maybeSingle()
    if (recipientRes.error) return handleSupabaseError(c, recipientRes.error, 'clients recipient detail for portal')
    recipientClient = recipientRes.data || null
  }

  if (!currentViewRes.data) {
    const { error: viewUpsertError } = await supabase
      .from('portal_invoice_views')
      .upsert(
        {
          portal_invoice_id: portalInvoiceId,
          viewer_user_id: userId,
          first_viewed_at: new Date().toISOString(),
        },
        { onConflict: 'portal_invoice_id,viewer_user_id' }
      )
    if (viewUpsertError) return handleSupabaseError(c, viewUpsertError, 'portal_invoice_views upsert')

    await supabase.from('portal_invoice_events').insert({
      portal_invoice_id: portalInvoiceId,
      actor_user_id: userId,
      type: 'viewed',
      payload: null,
    })
  }

  return c.json({
    success: true,
    invoice: {
      ...portalInvoice,
      sender_company_name: senderCompanyName,
      state: statusRes.data?.state || 'unconfirmed',
      rejected_reason: statusRes.data?.rejected_reason || null,
      status_updated_at: statusRes.data?.updated_at || null,
      snapshot_rows: snapshotsRes.data || [],
      events: eventsRes.data || [],
      base_invoice: invoiceRes.data || null,
      recipient_client: recipientClient,
      is_read: true,
      first_viewed_at: currentViewRes.data?.first_viewed_at || new Date().toISOString(),
    },
  })
})

api.get('/portal/invoices/:portalInvoiceId/pdf', async (c) => {
  const userId = getResolvedUserId(c)
  const portalInvoiceId = c.req.param('portalInvoiceId')

  const detailRes = await supabase
    .from('portal_invoices')
    .select('id, invoice_id, company_id, user_id, created_at')
    .eq('id', portalInvoiceId)
    .maybeSingle()
  if (detailRes.error) return handleSupabaseError(c, detailRes.error, 'portal invoice pdf detail')
  if (!detailRes.data) {
    return c.json({ success: false, error: 'PORTAL_INVOICE_NOT_FOUND', message: '請求書が見つかりません' }, 404)
  }

  const { data: profileRows, error: profileRowsError } = await supabase
    .from('portal_company_profiles')
    .select('id')
    .eq('owner_user_id', userId)
  if (profileRowsError) return handleSupabaseError(c, profileRowsError, 'portal_company_profiles owner list pdf')
  const profileIds = (profileRows || []).map((row: any) => row.id)
  if (profileIds.length === 0) {
    return c.json({ success: false, error: 'FORBIDDEN', message: 'アクセス権がありません' }, 403)
  }
  const { data: accessLink, error: accessError } = await supabase
    .from('portal_profile_links')
    .select('id')
    .in('profile_id', profileIds)
    .eq('portal_company_id', detailRes.data.company_id)
    .limit(1)
    .maybeSingle()
  if (accessError) return handleSupabaseError(c, accessError, 'portal profile access check pdf')
  if (!accessLink) return c.json({ success: false, error: 'FORBIDDEN', message: 'アクセス権がありません' }, 403)

  const invoiceId = Number(detailRes.data.invoice_id)
  const { data: invoiceMeta } = await supabase
    .from('invoices')
    .select('id, invoice_no, invoice_date, billing_period_start, total_amount, pdf_path, pdf_size')
    .eq('id', invoiceId)
    .maybeSingle()

  let senderCompanyName = 'sender'
  const senderUserId = detailRes.data && (detailRes.data as any).user_id ? String((detailRes.data as any).user_id) : ''
  if (senderUserId) {
    const senderRes = await supabase
      .from('company_info')
      .select('company_name')
      .eq('user_id', senderUserId)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (senderRes.error) return handleSupabaseError(c, senderRes.error, 'company_info sender for portal pdf')
    senderCompanyName = senderRes.data?.company_name ? String(senderRes.data.company_name) : senderCompanyName
  }
  const yyyymmRaw = String(invoiceMeta?.billing_period_start || invoiceMeta?.invoice_date || '')
  const yyyymm = /^(\d{4})-(\d{2})/.test(yyyymmRaw)
    ? `${yyyymmRaw.slice(0, 4)}${yyyymmRaw.slice(5, 7)}`
    : String(new Date().toISOString().slice(0, 7)).replace('-', '')
  const safeSenderName = toSafePdfFileNameBase(senderCompanyName || 'sender').replace(/[\r\n]/g, '')
  const fileNameUtf8 = `${yyyymm}_${safeSenderName}.pdf`
  const contentDisposition = buildContentDispositionAttachment(fileNameUtf8)

  const pdfPath = invoiceMeta?.pdf_path ? String(invoiceMeta.pdf_path).trim() : ''
  if (!pdfPath) {
    const status = 404
    const message = '正式PDFが未保存のためダウンロードできません'
    console.error(
      `[API] portal pdf failed invoice_id=${invoiceId} status=${status} message=${message} pdf_path=(null)`
    )
    return c.json({ success: false, error: 'PDF_NOT_READY', message }, status)
  }

  const { data: fileBlob, error: fileError } = await supabaseAdmin.storage
    .from(INVOICE_PDF_BUCKET)
    .download(pdfPath)
  if (fileError || !fileBlob) {
    const anyErr = fileError as any
    const status = Number(anyErr?.statusCode || anyErr?.status || 502)
    const message = anyErr?.message || 'PDF_STORAGE_DOWNLOAD_FAILED'
    console.error(
      `[API] portal pdf failed invoice_id=${invoiceId} status=${status} message=${message} pdf_path=${pdfPath}`
    )
    return c.json({ success: false, error: 'PDF_STORAGE_DOWNLOAD_FAILED', message }, 502)
  }

  const bytes = await fileBlob.arrayBuffer()
  if (!bytes || bytes.byteLength <= 0) {
    const status = 502
    const message = 'PDF_EMPTY'
    console.error(
      `[API] portal pdf failed invoice_id=${invoiceId} status=${status} message=${message} pdf_path=${pdfPath}`
    )
    return c.json({ success: false, error: 'PDF_EMPTY', message: 'PDFデータが空です' }, status)
  }

  console.log(
    `[API] portal pdf download ok invoice_id=${invoiceId} pdf_path=${pdfPath} size=${bytes.byteLength}`
  )
  return c.newResponse(bytes, 200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': contentDisposition,
    'Content-Length': String(bytes.byteLength),
  })
})

api.post('/portal/invoices/:portalInvoiceId/approve', async (c) => {
  const userId = getResolvedUserId(c)
  const portalInvoiceId = c.req.param('portalInvoiceId')

  const { data: portalInvoice, error: invoiceError } = await supabase
    .from('portal_invoices')
    .select('id, company_id')
    .eq('id', portalInvoiceId)
    .maybeSingle()
  if (invoiceError) return handleSupabaseError(c, invoiceError, 'portal invoice approve check')
  if (!portalInvoice) {
    return c.json({ success: false, error: 'PORTAL_INVOICE_NOT_FOUND', message: '請求書が見つかりません' }, 404)
  }
  const { data: profileRows, error: profileRowsError } = await supabase
    .from('portal_company_profiles')
    .select('id')
    .eq('owner_user_id', userId)
  if (profileRowsError) return handleSupabaseError(c, profileRowsError, 'portal profile list approve')
  const profileIds = (profileRows || []).map((row: any) => row.id)
  const { data: accessLink, error: accessError } = await supabase
    .from('portal_profile_links')
    .select('id')
    .in('profile_id', profileIds.length > 0 ? profileIds : ['00000000-0000-0000-0000-000000000000'])
    .eq('portal_company_id', portalInvoice.company_id)
    .limit(1)
    .maybeSingle()
  if (accessError) return handleSupabaseError(c, accessError, 'portal link access approve')
  if (!accessLink) return c.json({ success: false, error: 'FORBIDDEN', message: 'アクセス権がありません' }, 403)

  const now = new Date().toISOString()
  const { error: statusError } = await supabase
    .from('portal_invoice_status')
    .upsert(
      {
        portal_invoice_id: portalInvoiceId,
        state: 'approved',
        rejected_reason: null,
        updated_at: now,
      },
      { onConflict: 'portal_invoice_id' }
    )
  if (statusError) return handleSupabaseError(c, statusError, 'portal_invoice_status approve')

  const { error: eventError } = await supabase
    .from('portal_invoice_events')
    .insert({
      portal_invoice_id: portalInvoiceId,
      actor_user_id: userId,
      type: 'approved',
      payload: null,
      created_at: now,
    })
  if (eventError) return handleSupabaseError(c, eventError, 'portal_invoice_events approve')

  return c.json({ success: true, state: 'approved' })
})

api.post('/portal/invoices/:portalInvoiceId/reject', async (c) => {
  const userId = getResolvedUserId(c)
  const portalInvoiceId = c.req.param('portalInvoiceId')
  const body = await c.req.json().catch(() => ({}))
  const allowedReasonCodes = new Set([
    'AMOUNT_MISMATCH',
    'ITEM_ERROR',
    'BILLING_MONTH_WRONG',
    'CLIENT_INFO_ERROR',
    'MISSING_DOCS',
    'DUPLICATE',
    'OTHER',
  ])
  const reasonCodeRaw = String(body.reason_code || '').trim().toUpperCase()
  const reasonTextRaw = String(body.reason_text || '').trim()
  const legacyReason = String(body.reason || '').trim()
  const reasonCode = reasonCodeRaw || (legacyReason ? 'OTHER' : '')
  const reasonText = reasonTextRaw || legacyReason
  if (!reasonCode) {
    return c.json({ success: false, error: 'REASON_REQUIRED', message: '差し戻し理由は必須です' }, 400)
  }
  if (!allowedReasonCodes.has(reasonCode)) {
    return c.json({ success: false, error: 'REASON_CODE_INVALID', message: '差し戻し理由の選択が不正です' }, 400)
  }
  if (reasonCode === 'OTHER' && !reasonText) {
    return c.json({ success: false, error: 'REASON_TEXT_REQUIRED', message: 'その他を選択した場合、詳細は必須です' }, 400)
  }
  const reasonCodeLabelMap: Record<string, string> = {
    AMOUNT_MISMATCH: '金額が一致しない',
    ITEM_ERROR: '明細内容の不備（品名・数量など）',
    BILLING_MONTH_WRONG: '請求対象月（年月）が違う',
    CLIENT_INFO_ERROR: '取引先情報の不備（住所・担当など）',
    MISSING_DOCS: '添付/関連書類が不足（納品書など）',
    DUPLICATE: '二重請求の可能性',
    OTHER: 'その他',
  }
  const normalizedReasonForStatus = reasonText || reasonCodeLabelMap[reasonCode] || reasonCode

  const { data: portalInvoice, error: invoiceError } = await supabase
    .from('portal_invoices')
    .select('id, company_id')
    .eq('id', portalInvoiceId)
    .maybeSingle()
  if (invoiceError) return handleSupabaseError(c, invoiceError, 'portal invoice reject check')
  if (!portalInvoice) {
    return c.json({ success: false, error: 'PORTAL_INVOICE_NOT_FOUND', message: '請求書が見つかりません' }, 404)
  }
  const { data: profileRows, error: profileRowsError } = await supabase
    .from('portal_company_profiles')
    .select('id')
    .eq('owner_user_id', userId)
  if (profileRowsError) return handleSupabaseError(c, profileRowsError, 'portal profile list reject')
  const profileIds = (profileRows || []).map((row: any) => row.id)
  const { data: accessLink, error: accessError } = await supabase
    .from('portal_profile_links')
    .select('id')
    .in('profile_id', profileIds.length > 0 ? profileIds : ['00000000-0000-0000-0000-000000000000'])
    .eq('portal_company_id', portalInvoice.company_id)
    .limit(1)
    .maybeSingle()
  if (accessError) return handleSupabaseError(c, accessError, 'portal link access reject')
  if (!accessLink) return c.json({ success: false, error: 'FORBIDDEN', message: 'アクセス権がありません' }, 403)

  const now = new Date().toISOString()
  const { error: statusError } = await supabase
    .from('portal_invoice_status')
    .upsert(
      {
        portal_invoice_id: portalInvoiceId,
        state: 'rejected',
        rejected_reason: normalizedReasonForStatus,
        updated_at: now,
      },
      { onConflict: 'portal_invoice_id' }
    )
  if (statusError) return handleSupabaseError(c, statusError, 'portal_invoice_status reject')

  const { error: eventError } = await supabase
    .from('portal_invoice_events')
    .insert({
      portal_invoice_id: portalInvoiceId,
      actor_user_id: userId,
      type: 'rejected',
      payload: {
        reason_code: reasonCode,
        reason_text: reasonText || null,
      },
      created_at: now,
    })
  if (eventError) return handleSupabaseError(c, eventError, 'portal_invoice_events reject')

  return c.json({ success: true, state: 'rejected' })
})

api.get('/portal/company-profile/:profileId', async (c) => {
  const userId = getResolvedUserId(c)
  const profileId = c.req.param('profileId')

  const profileRes = await supabase
    .from('portal_company_profiles')
    .select('id, display_name, postal_code, address, phone, fax, email, source, created_at, updated_at')
    .eq('id', profileId)
    .eq('owner_user_id', userId)
    .maybeSingle()
  if (profileRes.error) return handleSupabaseError(c, profileRes.error, 'portal_company_profiles detail')
  if (!profileRes.data) {
    return c.json({ success: false, error: 'PROFILE_NOT_FOUND', message: 'プロフィールが見つかりません' }, 404)
  }

  const requestsRes = await supabase
    .from('portal_company_change_requests')
    .select('id, requested_by_user_id, payload, note, status, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
  if (requestsRes.error) return handleSupabaseError(c, requestsRes.error, 'portal_company_change_requests list')

  return c.json({ success: true, profile: profileRes.data, change_requests: requestsRes.data || [] })
})

api.patch('/portal/company-profile/:profileId', async (c) => {
  return c.json(
    {
      ok: false,
      code: 'PROFILE_READ_ONLY',
      message: 'Recipient cannot edit company profile. Please submit a correction request.',
    },
    403
  )
})

api.post('/portal/company-profile/:profileId/change-requests', async (c) => {
  const userId = getResolvedUserId(c)
  const profileId = c.req.param('profileId')
  const body = await c.req.json().catch(() => ({}))

  const profileRes = await supabase
    .from('portal_company_profiles')
    .select('id')
    .eq('id', profileId)
    .eq('owner_user_id', userId)
    .maybeSingle()
  if (profileRes.error) return handleSupabaseError(c, profileRes.error, 'portal_company_profiles check')
  if (!profileRes.data) {
    return c.json({ success: false, error: 'PROFILE_NOT_FOUND', message: 'プロフィールが見つかりません' }, 404)
  }

  const allowedKeys = ['display_name', 'postal_code', 'address', 'phone', 'fax', 'email']
  const payload: Record<string, string> = {}
  for (const key of allowedKeys) {
    if (body[key] !== undefined && body[key] !== null) {
      payload[key] = String(body[key]).trim()
    }
  }
  if (Object.keys(payload).length === 0) {
    return c.json({ success: false, error: 'PAYLOAD_REQUIRED', message: '変更依頼内容が空です' }, 400)
  }

  const { data, error } = await supabase
    .from('portal_company_change_requests')
    .insert({
      profile_id: profileId,
      requested_by_user_id: userId,
      payload,
      note: body.note ? String(body.note).trim() : null,
      status: 'pending',
    })
    .select('id, profile_id, requested_by_user_id, payload, note, status, created_at')
    .single()
  if (error) return handleSupabaseError(c, error, 'portal_company_change_requests insert')

  return c.json({ success: true, request: data })
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

// =====================================
// 椅子張り替え用・生地必要量 自動計算ツール
// =====================================
api.get('/fabric-calculator/fabric-spec', (c) => {
  const rawCode = c.req.query('productCode') || ''
  const productCode = rawCode.trim().toUpperCase()
  if (!productCode) {
    return c.json({ found: false, message: '品番が未入力です' })
  }
  const spec = demoFabricDict[productCode]
  if (!spec) {
    return c.json({ found: false, message: '該当なし（手入力をしてください）' })
  }
  return c.json({ found: true, spec })
})

api.post('/fabric-calculator/calculate', async (c) => {
  const payload = await c.req.json()
  const rawDirection = payload?.cutDirection
  const cutDirection: CutDirection =
    rawDirection === 'railroading' ? 'railroading' : 'regular'

  const fabricSpec: FabricSpec = {
    productCode: String(payload?.fabricSpec?.productCode || '').trim(),
    width: parseNonNegativeNumber(payload?.fabricSpec?.width) || 0,
    repeatVertical: parseNonNegativeNumber(payload?.fabricSpec?.repeatVertical) || 0,
    repeatHorizontal: parseNonNegativeNumber(payload?.fabricSpec?.repeatHorizontal) || 0,
    pricePerMeter: parseNonNegativeNumber(payload?.fabricSpec?.pricePerMeter) || 0,
  }

  const parts: ChairPart[] = Array.isArray(payload?.parts)
    ? payload.parts.map((part: any, index: number) => ({
        id: String(part?.id || `part-${index + 1}`),
        name: String(part?.name || 'パーツ'),
        count: parseNonNegativeNumber(part?.count) || 0,
        width: parseNonNegativeNumber(part?.width) || 0,
        depth: parseNonNegativeNumber(part?.depth) || 0,
        allowRailroading: true,
      }))
    : []

  const result = calculateFabricUsage(parts, fabricSpec, cutDirection)
  return c.json({ result })
})

export default api
