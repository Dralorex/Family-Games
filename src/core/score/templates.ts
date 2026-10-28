import type { ScorecardTemplate } from './types'

export const SCORECARD_TEMPLATES: ScorecardTemplate[] = [
  {
    id: 'play-9',
    name: 'Play 9',
    blurb: '9 rounds · lowest score wins',
    winDirection: 'low',
    endMode: 'rounds',
    totalRounds: 9,
  },
  {
    id: 'uno-golf',
    name: 'Uno Golf',
    blurb: '9 rounds · lowest score wins',
    winDirection: 'low',
    endMode: 'rounds',
    totalRounds: 9,
  },
  {
    id: 'five-crowns',
    name: 'Five Crowns',
    blurb: '11 rounds · lowest score wins',
    winDirection: 'low',
    endMode: 'rounds',
    totalRounds: 11,
  },
  {
    id: 'tapped-4',
    name: 'Tapped 4',
    blurb: 'Race to a point limit · lowest wins',
    winDirection: 'low',
    endMode: 'limit',
    defaultPointLimit: 150,
  },
  {
    id: 'flip-7',
    name: 'Flip 7',
    blurb: 'Race to a point limit · highest wins',
    winDirection: 'high',
    endMode: 'limit',
    defaultPointLimit: 200,
  },
]

export function getTemplate(id: string): ScorecardTemplate | undefined {
  return SCORECARD_TEMPLATES.find((t) => t.id === id)
}
