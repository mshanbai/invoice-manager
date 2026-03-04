export type TaxRoundingUnit = 'PER_LINE' | 'PER_RATE'
export type TaxRoundingMode = 'FLOOR' | 'CEIL' | 'ROUND'

export interface TaxCalculationSettings {
  tax_rounding_unit?: unknown
  tax_rounding_mode?: unknown
  default_tax_rate?: unknown
}

export interface TaxCalculationItem {
  quantity?: unknown
  unit_price?: unknown
  tax_rate?: unknown
  tax_type?: unknown
}

export interface TaxSummary {
  subtotal: number
  tax_by_rate: Record<number, number>
  tax_amount: number
  total_amount: number
}

export function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function normalizeTaxRoundingUnit(value: unknown): TaxRoundingUnit {
  const normalized = String(value ?? '').trim().toUpperCase()
  return normalized === 'PER_RATE' ? 'PER_RATE' : 'PER_LINE'
}

export function normalizeTaxRoundingMode(value: unknown): TaxRoundingMode {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (normalized === 'CEIL') return 'CEIL'
  if (normalized === 'ROUND') return 'ROUND'
  return 'FLOOR'
}

export function roundByTaxMode(value: number, mode: TaxRoundingMode): number {
  if (mode === 'CEIL') return Math.ceil(value)
  if (mode === 'ROUND') return Math.round(value)
  return Math.floor(value)
}

export function resolveItemTaxRate(item: TaxCalculationItem, defaultTaxRate = 10): number {
  const taxType = String(item?.tax_type ?? '').trim().toLowerCase()
  if (taxType === 'non_taxable' || taxType === 'exempt' || taxType === 'excluded') return 0
  if (taxType === 'reduced') return 8
  if (taxType === 'standard') return 10

  const taxRate = toFiniteNumber(item?.tax_rate, defaultTaxRate)
  return taxRate
}

export function pickTaxCalculationSettings(companyInfo: any): TaxCalculationSettings {
  return {
    tax_rounding_unit: normalizeTaxRoundingUnit(companyInfo?.tax_rounding_unit),
    tax_rounding_mode: normalizeTaxRoundingMode(companyInfo?.tax_rounding_mode),
  }
}

export function calculateTaxSummary(
  items: TaxCalculationItem[] | unknown,
  settings: TaxCalculationSettings
): TaxSummary {
  const normalizedItems = Array.isArray(items) ? items : []
  const roundingUnit = normalizeTaxRoundingUnit(settings?.tax_rounding_unit)
  const roundingMode = normalizeTaxRoundingMode(settings?.tax_rounding_mode)
  const defaultTaxRate = toFiniteNumber(settings?.default_tax_rate, 10)

  let subtotal = 0
  const taxByRate: Record<number, number> = {}

  if (roundingUnit === 'PER_RATE') {
    const amountByRate: Record<number, number> = {}
    for (const item of normalizedItems) {
      const quantity = toFiniteNumber(item?.quantity, 0)
      const unitPrice = toFiniteNumber(item?.unit_price, 0)
      const amount = quantity * unitPrice
      const rate = resolveItemTaxRate(item, defaultTaxRate)

      subtotal += amount
      amountByRate[rate] = (amountByRate[rate] || 0) + amount
    }

    Object.keys(amountByRate).forEach((rateKey) => {
      const rate = Number(rateKey)
      const rateSubtotal = amountByRate[rate] || 0
      const tax = rate === 0 ? 0 : roundByTaxMode(rateSubtotal * rate / 100, roundingMode)
      taxByRate[rate] = tax
    })
  } else {
    for (const item of normalizedItems) {
      const quantity = toFiniteNumber(item?.quantity, 0)
      const unitPrice = toFiniteNumber(item?.unit_price, 0)
      const amount = quantity * unitPrice
      const rate = resolveItemTaxRate(item, defaultTaxRate)
      const tax = rate === 0 ? 0 : roundByTaxMode(amount * rate / 100, roundingMode)

      subtotal += amount
      taxByRate[rate] = (taxByRate[rate] || 0) + tax
    }
  }

  const taxAmount = Object.values(taxByRate).reduce((sum, tax) => sum + toFiniteNumber(tax, 0), 0)
  const totalAmount = subtotal + taxAmount

  return {
    subtotal,
    tax_by_rate: taxByRate,
    tax_amount: taxAmount,
    total_amount: totalAmount,
  }
}
