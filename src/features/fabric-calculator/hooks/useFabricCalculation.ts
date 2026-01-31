import type {
  CalculationResult,
  ChairPart,
  CutDirection,
  FabricSpec,
} from '../types'
import { calculateFabricUsage } from '../utils/calculation'

export const useFabricCalculation = (
  parts: ChairPart[],
  fabricSpec: FabricSpec,
  cutDirection: CutDirection
): CalculationResult => {
  return calculateFabricUsage(parts, fabricSpec, cutDirection)
}
