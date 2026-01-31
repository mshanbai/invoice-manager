import type { ChairPart } from '../types'

export interface TemplateDefinition {
  id: string
  label: string
  parts: ChairPart[]
}

export const templates: TemplateDefinition[] = [
  {
    id: 'dining-chair-seat',
    label: 'ダイニングチェア（座面のみ）',
    parts: [
      {
        id: 'seat',
        name: '座面',
        count: 1,
        width: 450,
        depth: 450,
        allowRailroading: true,
      },
    ],
  },
  {
    id: 'sofa-1p',
    label: '1人掛けソファ（座面、背もたれ、肘×2）',
    parts: [
      {
        id: 'seat',
        name: '座面',
        count: 1,
        width: 600,
        depth: 550,
        allowRailroading: true,
      },
      {
        id: 'back',
        name: '背もたれ',
        count: 1,
        width: 600,
        depth: 650,
        allowRailroading: true,
      },
      {
        id: 'arm',
        name: '肘',
        count: 2,
        width: 200,
        depth: 650,
        allowRailroading: true,
      },
    ],
  },
  {
    id: 'sofa-3p',
    label: '3人掛けソファ（座面、背もたれ、肘×2、前垂れ）',
    parts: [
      {
        id: 'seat',
        name: '座面',
        count: 1,
        width: 1800,
        depth: 600,
        allowRailroading: true,
      },
      {
        id: 'back',
        name: '背もたれ',
        count: 1,
        width: 1800,
        depth: 650,
        allowRailroading: true,
      },
      {
        id: 'arm',
        name: '肘',
        count: 2,
        width: 250,
        depth: 650,
        allowRailroading: true,
      },
      {
        id: 'front-skirt',
        name: '前垂れ',
        count: 1,
        width: 1800,
        depth: 250,
        allowRailroading: true,
      },
    ],
  },
]
