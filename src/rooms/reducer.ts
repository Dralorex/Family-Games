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

/** Keep past rounds; clear the open round so a returning player enters their own score. */
function continueFromCurrentRound(room: ScorecardRoom, playerId: string): ScorecardRoom {
  if (room.status !== 'playing') return room
  const existing = room.scores[playerId]
  if (!existing || existing[room.currentRound] === undefined) return room
  const { [room.currentRound]: _dropped, ...kept } = existing
  return {
    ...room,
    scores: {
      ...room.scores,
      [playerId]: kept,
    },
  }
}

function findPlayerByName(room: RoomState, name: string): RoomPlayer | undefined {
  const needle = name.trim().toLowerCase()
  return playersList(room).find((p) => p.name.trim().toLowerCase() === needle)
}

function nextHostCandidate(room: RoomState, excludingId: string): string | undefined {
  return activeList(room).find((p) => p.id !== excludingId)?.id
}

/**
 * Move a roster seat onto a new browser/playerId + session.
 * Active host swapping browsers keeps ownership; left creator asks to get it back.
 */
function takeOverSeat(
  room: RoomState,
  match: RoomPlayer,
  playerId: string,
  sessionId: string,
  opts?: { wasLeft?: boolean },
): RoomState {
  const wasLeft = Boolean(opts?.wasLeft ?? match.left)
  const wasHostSeat = room.hostId === match.id
  const revived: RoomPlayer = {
    ...match,
    id: playerId,
    left: false,
    sessionId,
    joinedAt: match.joinedAt,
  }
  const { [match.id]: _old, ...rest } = room.players

  let hostId = room.hostId
  if (wasHostSeat && !wasLeft) {
    // Owner swapped browsers without leaving — stay owner on the new browser
    hostId = playerId
  } else if (wasHostSeat && wasLeft) {
    // Leave should already have moved host; if not, fall back to next active seat
    hostId =
      nextHostCandidate({ ...room, players: { ...rest, [playerId]: revived } }, playerId) ??
      playerId
  }

  let next: RoomState = {
    ...room,
    hostId,
    players: { ...rest, [playerId]: revived },
  }

  const isCreator =
    room.creatorName.trim().toLowerCase() === revived.name.trim().toLowerCase()

  if (room.kind === 'scorecard') {
    let sc = next as ScorecardRoom
    if (room.scores[match.id] && match.id !== playerId) {
      const { [match.id]: oldScores, ...scoreRest } = sc.scores
      sc = { ...sc, scores: { ...scoreRest, [playerId]: oldScores ?? {} } }
    }
    if (wasLeft) {
      sc = continueFromCurrentRound(sc, playerId)
    }
    if (wasLeft && isCreator && sc.hostId !== playerId) {
      sc = { ...sc, pendingHostReturn: { playerId, name: revived.name } }
    }
    next = sc
  } else {
    let hp = next as HotPotatoRoom
    if (hp.aliveIds.includes(match.id)) {
      hp = {
        ...hp,
        aliveIds: hp.aliveIds.map((id) => (id === match.id ? playerId : id)),
      }
    }
    if (wasLeft && isCreator && hp.hostId !== playerId) {
      hp = { ...hp, pendingHostReturn: { playerId, name: revived.name } }
    }
    next = hp
  }

  return next
}

export function applyAction(room: RoomState, action: RoomAction, now = Date.now()): RoomState {
  switch (action.type) {
    case 'hello':
      return room

    case 'join': {
      const sessionId = action.player.sessionId ?? action.player.id
      const existingById = room.players[action.player.id]

      // Same browser/player id reconnect
      if (existingById) {
        let next: RoomState = {
          ...room,
          players: {
            ...room.players,
            [action.player.id]: {
              ...existingById,
              name: action.player.name,
              left: false,
              sessionId,
            },
          },
        }
        if (next.kind === 'scorecard' && existingById.left) {
          next = continueFromCurrentRound(next, action.player.id)
          const isCreator =
            next.creatorName.trim().toLowerCase() === action.player.name.trim().toLowerCase()
          if (isCreator && next.hostId !== action.player.id) {
            next = {
              ...next,
              pendingHostReturn: { playerId: action.player.id, name: action.player.name },
            }
          }
        }
        return next
      }

      const byName = findPlayerByName(room, action.player.name)
      if (byName) {
        // Same name from a new browser → kick old session / take over seat
        return takeOverSeat(room, byName, action.player.id, sessionId, {
          wasLeft: Boolean(byName.left),
        })
      }

      if (room.kind === 'hot-potato' && Object.keys(room.players).length >= 50) {
        return room
      }
      let next: RoomState = {
        ...room,
        players: {
          ...room.players,
          [action.player.id]: { ...action.player, left: false, sessionId },
        },
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
      if (room.kind === 'scorecard' && room.status === 'playing' && room.completedRounds >= 1) {
        next = copyLastPlaceScores(next as ScorecardRoom, action.player.id, room.completedRounds)
      }
      return next
    }

    case 'rejoin': {
      const match = findPlayerByName(room, action.name)
      if (!match) return room
      return takeOverSeat(room, match, action.playerId, action.sessionId, {
        wasLeft: Boolean(match.left),
      })
    }

    case 'leave': {
      const player = room.players[action.playerId]
      if (!player) return room

      const isLeavingHost = room.hostId === action.playerId
      let hostId = room.hostId
      if (isLeavingHost) {
        const preferred = action.newHostId
        const okPreferred =
          preferred &&
          preferred !== action.playerId &&
          room.players[preferred] &&
          !room.players[preferred]!.left
        hostId = okPreferred
          ? preferred
          : nextHostCandidate(room, action.playerId) ?? action.playerId
      }

      if (room.kind === 'scorecard') {
        let next: ScorecardRoom = {
          ...room,
          hostId,
          players: {
            ...room.players,
            [action.playerId]: { ...player, left: true },
          },
          endVotes: { ...(room.endVotes ?? {}) },
          pendingHostReturn:
            room.pendingHostReturn?.playerId === action.playerId ? null : room.pendingHostReturn,
        }
        if (next.endVotes) {
          const { [action.playerId]: _, ...votes } = next.endVotes
          next = { ...next, endVotes: votes }
        }
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
        hostId: hostId === action.playerId ? (Object.keys(rest)[0] ?? hostId) : hostId,
        players: rest,
        aliveIds: room.aliveIds.filter((id) => id !== action.playerId),
        pendingHostReturn:
          room.pendingHostReturn?.playerId === action.playerId ? null : room.pendingHostReturn,
      }
    }

    case 'respond-host-return': {
      if (action.fromId !== room.hostId) return room
      const pending = room.pendingHostReturn
      if (!pending) return room
      if (!action.accept) {
        return { ...room, pendingHostReturn: null }
      }
      const target = room.players[pending.playerId]
      if (!target || target.left) {
        return { ...room, pendingHostReturn: null }
      }
      return {
        ...room,
        hostId: pending.playerId,
        pendingHostReturn: null,
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

export function defaultNextHostId(room: RoomState, leavingHostId: string): string | undefined {
  return nextHostCandidate(room, leavingHostId)
}
