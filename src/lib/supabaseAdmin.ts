import dotenv from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

// dotenv は行頭スペース付きの定義を読めないため、環境変数は行頭から定義すること。
// .env を読み込んだ後に .env.local を override してローカル値を優先する。
// 環境変数の変更を反映するには npm run dev の再起動が必要。
dotenv.config({ path: path.resolve(process.cwd(), '.env') })
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true })

const url = process.env.SUPABASE_URL

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

console.log('[supabaseAdmin] loaded env', {
  hasUrl: Boolean(url),
  hasKey: Boolean(serviceKey),
  keyLen: serviceKey ? serviceKey.length : 0,
})

if (!url || typeof url !== 'string' || !url.startsWith('http')) {
  console.error('[supabaseAdmin] missing SUPABASE_URL', { cwd: process.cwd(), url })
  throw new Error('SUPABASE_URL is missing')
}

if (!serviceKey || typeof serviceKey !== 'string' || serviceKey.length < 30) {
  console.error('[supabaseAdmin] missing SUPABASE_SERVICE_ROLE_KEY', {
    cwd: process.cwd(),
    keyLen: serviceKey ? serviceKey.length : 0,
  })
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing')
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
})