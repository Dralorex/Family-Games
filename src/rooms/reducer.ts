import {
  allScoresEntered,
  lastPlacePlayerId,
  nameTaken,
  shouldEndGame,
  worstScoreForRound,
} from '../core/score/engine'
import { endTimer, isExpired, resetTimer, startTimer } from '../core/timer/engine'
import type { HotPotatoRoom, RoomAction, RoomPlayer, RoomState, ScorecardRoom } from './types'

function playersList(room: RoomState) {
  return Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt)
}

function activeList(room: RoomState) {
  return playersList(room).filter((p) => !p.left)
}

function canControl(room: RoomState, fromId: string, targetId: string): boolean {
  if (fromId === targetId) return true
  const target = room.players[targetId]
  return Boolean(target && target.controlledBy === fromId)
}

function fillLeftPlayersForRound(room: ScorecardRoom, round: number): ScorecardRoom {
  const active = activeList(room)
  const worst = worstScoreForRound(
    room.scores,
    active.map((p) => p.id),
    round,
    room.winDirection,
  )
  let scores = room.scores
  for (const p of playersList(room)) {
    if (!p.left) continue
    if (scores[p.id]?.[round] !== undefined) continue
    scores = {
      ...scores,
      [p.id]: { ...(scores[p.id] ?? {}), [round]: worst },
    }
  }
  return { ...room, scores }
}

function copyLastPlaceScores(
  room: ScorecardRoom,
  newPlayerId: string,
  throughRound: number,
): ScorecardRoom {
  if (throughRound < 1) return room
  const others = playersList(room).filter((p) => p.id !== newPlayerId && !p.left)
  if (others.length === 0) return room
  const lastId = lastPlacePlayerId(others, room.scores, room.winDirection, throughRound)
  if (!lastId) return room
  const src = room.scores[lastId] ?? {}
  const copied: Record<number, number> = { ...(room.scores[newPlayerId] ?? {}) }
  for (let r = 1; r <= throughRound; r++) {
    if (src[r] !== undefined) copied[r] = src[r]!
  }
  return { ...room, scores: { ...room.scores, [newPlayerId]: copied } }
}

export function applyAction(room: RoomState, action: RoomAction, now = Date.now()): RoomState {
  switch (action.type) {
    case 'hello':
      return room

    case 'join': {
      const existingById = room.players[action.player.id]
      if (existingById) {
        return {
          ...room,
          players: {
            ...room.players,
            [action.player.id]: {
              ...existingById,
              name: action.player.name,
              left: false,
            },
          },
        }
      }
      // Unique names — block if taken by anyone still on the roster (including left)
      if (nameTaken(room.players, action.player.name)) {
        return room
      }
      if (room.kind === 'hot-potato' && Object.keys(room.players).length >= 50) {
        return room
      }
      let next: RoomState = {
        ...room,
        players: { ...room.players, [action.player.id]: { ...action.player, left: false } },
      }
      if (room.kind === 'hot-potato') {
        const hp = next as HotPotatoRoom
        const aliveIds =
          hp.status === 'lobby'
            ? Object.keys(hp.players)
            : hp.status === 'playing'
              ? hp.aliveIds
              : [...hp.aliveIds, action.player.id]
        return { ...hp, aliveIds }
      }
      // Mid-game join: match last place scores for completed rounds
      if (room.kind === 'scorecard' && room.status === 'playing' && room.completedRounds >= 1) {
        next = copyLastPlaceScores(next as ScorecardRoom, action.player.id, room.completedRounds)
      }
      return next
    }

    case 'rejoin': {
      const match = playersList(room).find(
        (p) => p.name.trim().toLowerCase() === action.name.trim().toLowerCase(),
      )
      if (!match) return room
      const revived: RoomPlayer = {
        ...match,
        id: action.playerId,
        left: false,
        joinedAt: match.joinedAt,
      }
      const { [match.id]: _old, ...rest } = room.players
      // Move scores if id changed
      let nextRoom: RoomState = {
        ...room,
        players: { ...rest, [action.playerId]: revived },
      }
      if (room.kind === 'scorecard' && room.scores[match.id] && match.id !== action.playerId) {
        const sc = nextRoom as ScorecardRoom
        const { [match.id]: oldScores, ...scoreRest } = sc.scores
        nextRoom = {
          ...sc,
          scores: { ...scoreRest, [action.playerId]: oldScores ?? {} },
        }
      }
      return nextRoom
    }

    case 'leave': {
      const player = room.players[action.playerId]
      if (!player) return room
      // Soft leave for scorecards (keep on card); hard remove for hot potato lobby only
      if (room.kind === 'scorecard') {
        let next: ScorecardRoom = {
          ...room,
          players: {
            ...room.players,
            [action.playerId]: { ...player, left: true },
          },
          endVotes: { ...(room.endVotes ?? {}) },
        }
        if (next.endVotes) {
          const { [action.playerId]: _, ...votes } = next.endVotes
          next = { ...next, endVotes: votes }
        }
        // If currently playing and no score this round, fill worst now among those who scored
        if (next.status === 'playing') {
          const active = activeList(next).filter((p) => p.id !== action.playerId)
          if (active.some((p) => next.scores[p.id]?.[next.currentRound] !== undefined)) {
            const worst = worstScoreForRound(
              next.scores,
              active.map((p) => p.id),
              next.currentRound,
              next.winDirection,
            )
            if (next.scores[action.playerId]?.[next.currentRound] === undefined) {
              next = {
                ...next,
                scores: {
                  ...next.scores,
                  [action.playerId]: {
                    ...(next.scores[action.playerId] ?? {}),
                    [next.currentRound]: worst,
                  },
                },
              }
            }
          }
        }
        return next
      }
      const { [action.playerId]: _, ...rest } = room.players
      return {
        ...room,
        players: rest,
        aliveIds: room.aliveIds.filter((id) => id !== action.playerId),
      }
    }

    case 'add-player': {
      if (room.kind !== 'scorecard') return room
      if (!room.players[action.fromId] || room.players[action.fromId]!.left) return room
      if (nameTaken(room.players, action.player.name)) return room
      const seat: RoomPlayer = {
        ...action.player,
        controlledBy: action.fromId,
        left: false,
      }
      let next: ScorecardRoom = {
        ...room,
        players: { ...room.players, [seat.id]: seat },
      }
      if (room.status === 'playing' && room.completedRounds >= 1) {
        next = copyLastPlaceScores(next, seat.id, room.completedRounds)
      }
      return next
    }

    case 'set-timer-range': {
      if (room.kind !== 'hot-potato' || action.fromId !== room.hostId) return room
      return {
        ...room,
        timer: { ...room.timer, minMs: action.minMs, maxMs: action.maxMs },
      }
    }

    case 'start-hot-potato': {
      if (room.kind !== 'hot-potato' || action.fromId !== room.hostId) return room
      const aliveIds = activeList(room).map((p) => p.id)
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
      const fuseDone = room.timer.status === 'ended' || isExpired(room.timer, now)
      if (!fuseDone) return room

      const remaining = room.aliveIds.filter((id) => id !== action.fromId)
      const place = remaining.length + 1
      const placements = [...room.placements, { playerId: action.fromId, place }]

      if (remaining.length <= 1) {
        if (remaining[0]) placements.push({ playerId: remaining[0], place: 1 })
        return {
          ...room,
          status: 'finished',
          finishedAt: now,
          aliveIds: remaining,
          placements,
          timer: endTimer(room.timer),
          endVotes: {},
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

    case 'set-title': {
      if (action.fromId !== room.hostId) return room
      return { ...room, title: action.title.trim().slice(0, 48) || room.title }
    }

    case 'start-scorecard': {
      if (room.kind !== 'scorecard' || action.fromId !== room.hostId) return room
      if (activeList(room).length < 1) return room
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
      if (!canControl(room, action.fromId, action.targetPlayerId)) return room
      const target = room.players[action.targetPlayerId]
      if (!target || target.left) return room
      if (action.round !== room.currentRound) return room
      const playerScores = {
        ...(room.scores[action.targetPlayerId] ?? {}),
        [action.round]: action.value,
      }
      return {
        ...room,
        scores: { ...room.scores, [action.targetPlayerId]: playerScores },
      }
    }

    case 'next-round': {
      if (room.kind !== 'scorecard' || action.fromId !== room.hostId) return room
      if (room.status !== 'playing') return room
      // Fill left players first, then require all active scores
      let next = fillLeftPlayersForRound(room, room.currentRound)
      const active = activeList(next)
      if (!allScoresEntered(active, next.scores, next.currentRound)) return room

      const ended = shouldEndGame({
        endMode: next.endMode,
        currentRound: next.currentRound,
        totalRounds: next.totalRounds,
        pointLimit: next.pointLimit,
        players: playersList(next),
        scores: next.scores,
        roundComplete: true,
      })

      if (ended) {
        return {
          ...next,
          status: 'finished',
          completedRounds: next.currentRound,
          finishedAt: now,
          endVotes: {},
        }
      }

      return {
        ...next,
        currentRound: next.currentRound + 1,
        completedRounds: next.currentRound,
      }
    }

    case 'cast-end-vote': {
      if (room.status !== 'finished') return room
      if (!room.players[action.fromId] || room.players[action.fromId]!.left) return room
      return {
        ...room,
        endVotes: { ...(room.endVotes ?? {}), [action.fromId]: action.vote },
      }
    }

    case 'host-new-game': {
      if (action.fromId !== room.hostId || room.status !== 'finished') return room
      return { ...room, regrouping: true }
    }

    case 'pull-party': {
      if (action.fromId !== room.hostId) return room
      return { ...room, pullTo: { code: action.code, path: action.path } }
    }

    case 'close-room': {
      return { ...room, status: 'closed' }
    }

    default:
      return room
  }
}

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
