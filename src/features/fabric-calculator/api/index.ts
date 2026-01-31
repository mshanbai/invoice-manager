import type { CalculationResult, FabricSpec } from '../types'

export interface FabricSpecLookupResponse {
  found: boolean
  spec?: FabricSpec
  message?: string
}

export interface FabricCalculationRequest {
  cutDirection: 'regular' | 'railroading'
  fabricSpec: FabricSpec
  parts: {
    id: string
    name: string
    count: number
    width: number
    depth: number
    allowRailroading: boolean
  }[]
}

export interface FabricCalculationResponse {
  result: CalculationResult
}
