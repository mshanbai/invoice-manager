export function normalizeAccountTypeToCode(input: unknown): 'ordinary' | 'current' | null {
  if (input === null || input === undefined) return null
  const raw = String(input).trim()
  if (!raw) return null
  if (raw === 'ordinary' || raw === '普通' || raw === '普通預金' || raw === '普通口座') return 'ordinary'
  if (raw === 'current' || raw === '当座' || raw === '当座預金') return 'current'
  const lowered = raw.toLowerCase()
  if (lowered === 'ordinary') return 'ordinary'
  if (lowered === 'current') return 'current'
  return null
}

export function accountTypeCodeToLabel(code: unknown): '普通' | '当座' | '' {
  if (code === 'ordinary') return '普通'
  if (code === 'current') return '当座'
  return ''
}
