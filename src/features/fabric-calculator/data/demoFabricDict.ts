import type { FabricSpec } from '../types'

export const demoFabricDict: Record<string, FabricSpec> = {
  UP5198: {
    productCode: 'UP5198',
    width: 1350,
    repeatVertical: 0,
    repeatHorizontal: 0,
    pricePerMeter: 8800,
  },
  UP5199: {
    productCode: 'UP5199',
    width: 1350,
    repeatVertical: 0,
    repeatHorizontal: 0,
    pricePerMeter: 8800,
  },
  UP5241: {
    productCode: 'UP5241',
    width: 1220,
    repeatVertical: 0,
    repeatHorizontal: 0,
    pricePerMeter: 3000,
  },
  UP6147: {
    productCode: 'UP6147',
    width: 1380,
    repeatVertical: 370,
    repeatHorizontal: 345,
    pricePerMeter: 5800,
  },
  UP6148: {
    productCode: 'UP6148',
    width: 1432,
    repeatVertical: 203,
    repeatHorizontal: 179,
    pricePerMeter: 5800,
  },
  UP6150: {
    productCode: 'UP6150',
    width: 1432,
    repeatVertical: 203,
    repeatHorizontal: 179,
    pricePerMeter: 5800,
  },
  L6222: {
    productCode: 'L6222',
    width: 1370,
    repeatVertical: 0,
    repeatHorizontal: 0,
    pricePerMeter: 4180,
  },
  L6224: {
    productCode: 'L6224',
    width: 1370,
    repeatVertical: 0,
    repeatHorizontal: 0,
    pricePerMeter: 4180,
  },
  L6227: {
    productCode: 'L6227',
    width: 1370,
    repeatVertical: 0,
    repeatHorizontal: 0,
    pricePerMeter: 4180,
  },
  L6229: {
    productCode: 'L6229',
    width: 1370,
    repeatVertical: 0,
    repeatHorizontal: 0,
    pricePerMeter: 4180,
  },
}

export const demoFabricOptions = Object.values(demoFabricDict).map(
  (spec) => spec.productCode
)
