import { allScoresEntered, shouldEndGame } from '../core/score/engine'
import { endTimer, isExpired, resetTimer, startTimer } from '../core/timer/engine'
import type { HotPotatoRoom, RoomAction, RoomState, ScorecardRoom } from './types'

function playersList(room: RoomState) {
  return Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt)
}

export function applyAction(room: RoomState, action: RoomAction, now = Date.now()): RoomState {
  switch (action.type) {
    case 'hello':
      return room
    case 'join': {
      if (room.players[action.player.id]) {
        return {
          ...room,
          players: {
            ...room.players,
            [action.player.id]: { ...room.players[action.player.id]!, name: action.player.name },
          },
        }
      }
      if (room.kind === 'hot-potato' && Object.keys(room.players).length >= 50) {
        return room
      }
      const nextPlayers = { ...room.players, [action.player.id]: action.player }
      if (room.kind === 'hot-potato') {
        const aliveIds =
          room.status === 'lobby'
            ? Object.keys(nextPlayers)
            : room.aliveIds.includes(action.player.id)
              ? room.aliveIds
              : room.status === 'playing'
                ? room.aliveIds
                : [...room.aliveIds, action.player.id]
        return { ...room, players: nextPlayers, aliveIds: room.status === 'lobby' ? Object.keys(nextPlayers) : aliveIds }
      }
      return { ...room, players: nextPlayers }
    }
    case 'leave': {
      const { [action.playerId]: _, ...rest } = room.players
      if (room.kind === 'hot-potato') {
        return {
          ...room,
          players: rest,
          aliveIds: room.aliveIds.filter((id) => id !== action.playerId),
        }
      }
      return { ...room, players: rest }
    }
    case 'set-timer-range': {
      if (room.kind !== 'hot-potato' || action.fromId !== room.hostId) return room
      return {
        ...room,
        timer: {
          ...room.timer,
          minMs: action.minMs,
          maxMs: action.maxMs,
        },
      }
    }
    case 'start-hot-potato': {
      if (room.kind !== 'hot-potato' || action.fromId !== room.hostId) return room
      const aliveIds = Object.keys(room.players)
      if (aliveIds.length < 2) return room
      return {
        ...room,
        status: 'playing',
        aliveIds,
        placements: [],
        timer: startTimer(room.timer, now),
      }
    }
    case 'explode': {
      if (room.kind !== 'hot-potato' || room.status !== 'playing') return room
      if (!room.aliveIds.includes(action.fromId)) return room
      // Only allow explode once fuse has ended (or is expired)
      const fuseDone = room.timer.status === 'ended' || isExpired(room.timer, now)
      if (!fuseDone) return room

      const remaining = room.aliveIds.filter((id) => id !== action.fromId)
      const place = remaining.length + 1
      const placements = [...room.placements, { playerId: action.fromId, place }]

      if (remaining.length <= 1) {
        if (remaining[0]) {
          placements.push({ playerId: remaining[0], place: 1 })
        }
        return {
          ...room,
          status: 'finished',
          aliveIds: remaining,
          placements,
          timer: endTimer(room.timer),
        }
      }

      return {
        ...room,
        aliveIds: remaining,
        placements,
        timer: startTimer(resetTimer(room.timer), now),
      }
    }
    case 'restart-fuse': {
      if (room.kind !== 'hot-potato' || action.fromId !== room.hostId) return room
      if (room.status !== 'playing') return room
      return { ...room, timer: startTimer(resetTimer(room.timer), now) }
    }
    case 'set-point-limit': {
      if (room.kind !== 'scorecard' || action.fromId !== room.hostId) return room
      if (room.endMode !== 'limit') return room
      return { ...room, pointLimit: Math.max(1, Math.floor(action.pointLimit)) }
    }
    case 'start-scorecard': {
      if (room.kind !== 'scorecard' || action.fromId !== room.hostId) return room
      if (playersList(room).length < 1) return room
      return {
        ...room,
        status: 'playing',
        currentRound: 1,
        completedRounds: 0,
        scores: {},
      }
    }
    case 'set-score': {
      if (room.kind !== 'scorecard' || room.status !== 'playing') return room
      if (!room.players[action.fromId]) return room
      if (action.round !== room.currentRound) return room
      const playerScores = { ...(room.scores[action.fromId] ?? {}), [action.round]: action.value }
      return {
        ...room,
        scores: { ...room.scores, [action.fromId]: playerScores },
      }
    }
    case 'next-round': {
      if (room.kind !== 'scorecard' || action.fromId !== room.hostId) return room
      if (room.status !== 'playing') return room
      const players = playersList(room)
      if (!allScoresEntered(players, room.scores, room.currentRound)) return room

      const roundComplete = true
      const ended = shouldEndGame({
        endMode: room.endMode,
        currentRound: room.currentRound,
        totalRounds: room.totalRounds,
        pointLimit: room.pointLimit,
        players,
        scores: room.scores,
        roundComplete,
      })

      if (ended) {
        return {
          ...room,
          status: 'finished',
          completedRounds: room.currentRound,
        }
      }

      return {
        ...room,
        currentRound: room.currentRound + 1,
        completedRounds: room.currentRound,
      }
    }
    default:
      return room
  }
}

/** Host-side tick: mark fuse ended when time is up (so explode unlocks). */
export function tickHotPotato(room: HotPotatoRoom, now = Date.now()): HotPotatoRoom {
  if (room.status !== 'playing') return room
  if (room.timer.status === 'running' && isExpired(room.timer, now)) {
    return { ...room, timer: endTimer(room.timer) }
  }
  return room
}

export function isHost(room: RoomState, playerId: string): boolean {
  return room.hostId === playerId
}

export function asScorecard(room: RoomState): ScorecardRoom | null {
  return room.kind === 'scorecard' ? room : null
}

export function asHotPotato(room: RoomState): HotPotatoRoom | null {
  return room.kind === 'hot-potato' ? room : null
}
