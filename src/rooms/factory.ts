import { getTemplate } from '../core/score/templates'
import type { ScorecardTemplateId } from '../core/score/types'
import { defaultRangeTimer } from '../core/timer/types'
import type { HotPotatoRoom, RoomPlayer, ScorecardRoom } from './types'

export function createHotPotatoRoom(opts: {
  code: string
  host: RoomPlayer
  minSec: number
  maxSec: number
}): HotPotatoRoom {
  return {
    v: 1,
    kind: 'hot-potato',
    code: opts.code,
    hostId: opts.host.id,
    createdAt: Date.now(),
    players: { [opts.host.id]: opts.host },
    status: 'lobby',
    timer: defaultRangeTimer(opts.minSec, opts.maxSec),
    aliveIds: [opts.host.id],
    placements: [],
  }
}

export function createScorecardRoom(opts: {
  code: string
  host: RoomPlayer
  templateId: ScorecardTemplateId
  pointLimit?: number
}): ScorecardRoom {
  const template = getTemplate(opts.templateId)
  if (!template) {
    throw new Error(`Unknown template: ${opts.templateId}`)
  }
  return {
    v: 1,
    kind: 'scorecard',
    code: opts.code,
    hostId: opts.host.id,
    createdAt: Date.now(),
    templateId: template.id,
    templateName: template.name,
    players: { [opts.host.id]: opts.host },
    status: 'lobby',
    currentRound: 1,
    completedRounds: 0,
    scores: {},
    winDirection: template.winDirection,
    endMode: template.endMode,
    totalRounds: template.totalRounds,
    pointLimit:
      template.endMode === 'limit'
        ? opts.pointLimit ?? template.defaultPointLimit ?? 100
        : undefined,
  }
}
