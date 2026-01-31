export type CutDirection = 'regular' | 'railroading'

export interface FabricSpec {
  productCode: string
  width: number
  repeatVertical: number
  repeatHorizontal: number
  pricePerMeter?: number
}

export interface ChairPart {
  id: string
  name: string
  count: number
  width: number
  depth: number
  allowRailroading: boolean
}

export interface PartCalculationResult {
  partId: string
  name: string
  count: number
  pieceWidth: number
  pieceLength: number
  columns: number
  rows: number
  lengthRequired: number
  warnings: string[]
}

export interface CalculationResult {
  cutDirection: CutDirection
  fabricSpec: FabricSpec
  parts: PartCalculationResult[]
  totalLengthMm: number
  totalLengthMeter: number
  warnings: string[]
}
