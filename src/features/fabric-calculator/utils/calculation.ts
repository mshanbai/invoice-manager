import type {
  CalculationResult,
  ChairPart,
  CutDirection,
  FabricSpec,
  PartCalculationResult,
} from '../types'

const normalizePositive = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0
  return value
}

const applyRepeat = (dimension: number, repeat: number): number => {
  const safeDimension = normalizePositive(dimension)
  const safeRepeat = normalizePositive(repeat)
  if (!safeDimension) return 0
  if (!safeRepeat) return safeDimension
  return Math.ceil(safeDimension / safeRepeat) * safeRepeat
}

const roundToMillimeter = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  return Math.round(value)
}

const calculatePart = (
  part: ChairPart,
  fabricSpec: FabricSpec,
  cutDirection: CutDirection
): PartCalculationResult => {
  const warnings: string[] = []
  const rawAcross = cutDirection === 'regular' ? part.width : part.depth
  const rawAlong = cutDirection === 'regular' ? part.depth : part.width

  const pieceWidth = applyRepeat(rawAcross, fabricSpec.repeatHorizontal)
  const pieceLength = applyRepeat(rawAlong, fabricSpec.repeatVertical)

  if (!pieceWidth || !pieceLength) {
    warnings.push('寸法が不足しているため計算できません')
  }

  const fabricWidth = normalizePositive(fabricSpec.width)
  if (!fabricWidth) {
    warnings.push('有効巾が未入力のため計算できません')
  }

  let columns = 0
  if (fabricWidth && pieceWidth) {
    columns = Math.floor(fabricWidth / pieceWidth)
    if (columns < 1) {
      columns = 1
      warnings.push('パーツ幅が有効巾を超えています')
    }
  }

  const count = Math.max(0, Math.floor(part.count || 0))
  const rows = columns ? Math.ceil(count / columns) : 0
  const lengthRequired = roundToMillimeter(rows * pieceLength)

  return {
    partId: part.id,
    name: part.name,
    count,
    pieceWidth: roundToMillimeter(pieceWidth),
    pieceLength: roundToMillimeter(pieceLength),
    columns,
    rows,
    lengthRequired,
    warnings,
  }
}

export const calculateFabricUsage = (
  parts: ChairPart[],
  fabricSpec: FabricSpec,
  cutDirection: CutDirection
): CalculationResult => {
  const warnings: string[] = []
  const validParts = parts.filter((part) => part && part.count > 0)
  const partResults = validParts.map((part) =>
    calculatePart(part, fabricSpec, cutDirection)
  )

  const totalLengthMm = partResults.reduce(
    (sum, part) => sum + part.lengthRequired,
    0
  )
  const totalLengthMeter = Number((totalLengthMm / 1000).toFixed(3))

  partResults.forEach((result) => {
    result.warnings.forEach((warning) => warnings.push(`${result.name}: ${warning}`))
  })

  if (!partResults.length) {
    warnings.push('パーツが未入力のため計算できません')
  }

  return {
    cutDirection,
    fabricSpec,
    parts: partResults,
    totalLengthMm,
    totalLengthMeter,
    warnings,
  }
}
