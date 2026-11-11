import {
  applyNeighborhoodGameAction,
  initNeighborhoodGame,
  isOpenJoin,
  trayIdForPlayer,
} from '../core/neighborhood/engine'
import type { SeatInput } from '../core/neighborhood/engine'
import { applySliceCAction } from '../core/neighborhood/sliceC'
import {
  allianceGroupIds,
  allianceGroupSize,
  maxPhonesForRules,
  NEIGHBORHOOD_PIECES,
  SHARED_TRAY_IDS,
  type NeighborhoodPieceId,
} from '../core/neighborhood/types'
import {
  allScoresEntered,
  lastPlacePlayerId,
  nameTaken,
  shouldEndGame,
  worstScoreForRound,
} from '../core/score/engine'
import { endTimer, isExpired, resetTimer, startTimer } from '../core/timer/engine'
import type {
  HotPotatoRoom,
  NeighborhoodRoom,
  RoomAction,
  RoomPlayer,
  RoomState,
  ScorecardRoom,
} from './types'

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

/** Soft-left seats and mid-join “Next Round” seats get the worst score for this round. */
function fillLeftPlayersForRound(room: ScorecardRoom, round: number): ScorecardRoom {
  const scoringIds = activeList(room)
    .filter((p) => !p.joinNextRound)
    .map((p) => p.id)
  const worst = worstScoreForRound(room.scores, scoringIds, round, room.winDirection)
  let scores = room.scores
  let players = room.players
  for (const p of playersList(room)) {
    const deferred = Boolean(p.joinNextRound)
    if (!p.left && !deferred) continue
    if (scores[p.id]?.[round] === undefined) {
      scores = {
        ...scores,
        [p.id]: { ...(scores[p.id] ?? {}), [round]: worst },
      }
    }
    if (deferred) {
      players = {
        ...players,
        [p.id]: { ...players[p.id]!, joinNextRound: false, needsRoundJoinChoice: false },
      }
    }
  }
  return { ...room, scores, players }
}

function withRoundJoinPrompt(player: RoomPlayer, ask: boolean): RoomPlayer {
  if (!ask) {
    return {
      ...player,
      needsRoundJoinChoice: false,
      joinNextRound: false,
    }
  }
  return {
    ...player,
    needsRoundJoinChoice: true,
    joinNextRound: false,
  }
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

/** Host closed the app — hand off after this, or immediately if the game already ended. */
export const HOST_AWAY_MS = 5 * 60 * 1000

export function shouldAutoClaimHost(room: RoomState, playerId: string, now = Date.now()): boolean {
  if (!room.hostAwayAt) return false
  if (room.hostId === playerId) return false
  if (room.players[playerId]?.left) return false
  const next = nextHostCandidate(room, room.hostId)
  if (next !== playerId) return false
  if (room.status === 'finished') return true
  return now - room.hostAwayAt >= HOST_AWAY_MS
}

function pruneInactivePlayers(room: ScorecardRoom): ScorecardRoom {
  const kept: Record<string, RoomPlayer> = {}
  const scores: ScorecardRoom['scores'] = {}
  for (const p of playersList(room)) {
    if (p.left) continue
    kept[p.id] = { ...p, left: false }
    if (room.scores[p.id]) scores[p.id] = room.scores[p.id]!
  }
  let hostId = room.hostId
  if (!kept[hostId]) {
    hostId = Object.values(kept).sort((a, b) => a.joinedAt - b.joinedAt)[0]?.id ?? room.hostId
  }
  return {
    ...room,
    hostId,
    players: kept,
    scores,
    pendingHostReturn: null,
    hostAwayAt: null,
  }
}

/**
 * Move a roster seat onto a new browser/playerId + session.
 * Active host swapping browsers keeps ownership; left creator asks to get it back
 * unless reclaimHost (Continue-as-host / new browser with ?host=1).
 */
function takeOverSeat(
  room: RoomState,
  match: RoomPlayer,
  playerId: string,
  sessionId: string,
  opts?: { wasLeft?: boolean; reclaimHost?: boolean },
): RoomState {
  const wasLeft = Boolean(opts?.wasLeft ?? match.left)
  const wasHostSeat = room.hostId === match.id
  const reclaimHost = Boolean(opts?.reclaimHost)
  const revived: RoomPlayer = {
    ...match,
    id: playerId,
    left: false,
    sessionId,
    joinedAt: match.joinedAt,
  }
  const { [match.id]: _old, ...rest } = room.players

  const isCreator =
    room.creatorName.trim().toLowerCase() === revived.name.trim().toLowerCase()

  let hostId = room.hostId
  if (reclaimHost && isCreator) {
    // Explicit new-browser / Continue-as-host reclaim
    hostId = playerId
  } else if (wasHostSeat && !wasLeft) {
    // Owner swapped browsers without leaving — stay owner on the new browser
    hostId = playerId
  } else if (wasHostSeat && wasLeft) {
    hostId =
      nextHostCandidate({ ...room, players: { ...rest, [playerId]: revived } }, playerId) ??
      playerId
  }

  let next: RoomState = {
    ...room,
    hostId,
    players: { ...rest, [playerId]: revived },
    pendingHostReturn:
      reclaimHost && isCreator
        ? null
        : room.pendingHostReturn?.playerId === match.id
          ? null
          : room.pendingHostReturn,
  }

  if (room.kind === 'scorecard') {
    let sc = next as ScorecardRoom
    if (room.scores[match.id] && match.id !== playerId) {
      const { [match.id]: oldScores, ...scoreRest } = sc.scores
      sc = { ...sc, scores: { ...scoreRest, [playerId]: oldScores ?? {} } }
    }
    if (wasLeft) {
      sc = continueFromCurrentRound(sc, playerId)
      if (sc.status === 'playing') {
        sc = {
          ...sc,
          players: {
            ...sc.players,
            [playerId]: withRoundJoinPrompt(sc.players[playerId]!, true),
          },
        }
      }
    }
    if (wasLeft && isCreator && sc.hostId !== playerId && !reclaimHost) {
      sc = { ...sc, pendingHostReturn: { playerId, name: revived.name } }
    }
    next = sc
  } else if (room.kind === 'hot-potato') {
    let hp = next as HotPotatoRoom
    if (hp.aliveIds.includes(match.id)) {
      hp = {
        ...hp,
        aliveIds: hp.aliveIds.map((id) => (id === match.id ? playerId : id)),
      }
    }
    if (wasLeft && isCreator && hp.hostId !== playerId && !reclaimHost) {
      hp = { ...hp, pendingHostReturn: { playerId, name: revived.name } }
    }
    next = hp
  } else if (room.kind === 'neighborhood') {
    let nb = next as NeighborhoodRoom
    if (match.id !== playerId) {
      const pieces = { ...nb.pieces }
      const teamOf = { ...nb.teamOf }
      if (pieces[match.id]) {
        pieces[playerId] = pieces[match.id]!
        delete pieces[match.id]
      }
      if (teamOf[match.id]) {
        teamOf[playerId] = teamOf[match.id]!
        delete teamOf[match.id]
      }
      nb = { ...nb, pieces, teamOf }
    }
    if (wasLeft && isCreator && nb.hostId !== playerId && !reclaimHost) {
      nb = { ...nb, pendingHostReturn: { playerId, name: revived.name } }
    }
    next = nb
  }

  return next
}

function pieceTakenByOther(
  room: NeighborhoodRoom,
  pieceId: NeighborhoodPieceId,
  exceptPlayerId: string,
): boolean {
  const style = room.rules.teamStyle
  if (style === 'shared') {
    // Piece unique per tray: if another tray already uses it, block
    const myTray = room.teamOf[exceptPlayerId]
    for (const [pid, piece] of Object.entries(room.pieces)) {
      if (pid === exceptPlayerId || piece !== pieceId) continue
      const theirTray = room.teamOf[pid]
      if (!myTray || !theirTray || theirTray !== myTray) return true
    }
    return false
  }
  return Object.entries(room.pieces).some(
    ([pid, piece]) => pid !== exceptPlayerId && piece === pieceId,
  )
}

/** Lobby ready: every active player has a piece (+ team when required). */
export function neighborhoodLobbyReady(room: NeighborhoodRoom): boolean {
  const active = activeList(room)
  if (active.length < 2) return false
  if (active.length > maxPhonesForRules(room.rules)) return false

  for (const p of active) {
    if (!room.pieces[p.id]) return false
  }

  if (room.rules.teamStyle === 'off') {
    return active.length <= 8
  }

  if (room.rules.teamStyle === 'shared') {
    for (const p of active) {
      if (!room.teamOf[p.id]) return false
    }
    const byTray = new Map<string, string[]>()
    for (const p of active) {
      const tray = room.teamOf[p.id]!
      const list = byTray.get(tray) ?? []
      list.push(p.id)
      byTray.set(tray, list)
    }
    for (const [, ids] of byTray) {
      if (ids.length > 2) return false
      const piece0 = room.pieces[ids[0]!]
      if (!piece0) return false
      if (ids.some((id) => room.pieces[id] !== piece0)) return false
    }
    return byTray.size >= 2
  }

  // Alliance
  const preset = room.rules.alliancePreset ?? '2v2v2v2'
  const groups = allianceGroupIds(preset)
  const size = allianceGroupSize(preset)
  for (const p of active) {
    if (!room.teamOf[p.id] || !groups.includes(room.teamOf[p.id]!)) return false
  }
  if (active.length !== groups.length * size) return false
  for (const g of groups) {
    const count = active.filter((p) => room.teamOf[p.id] === g).length
    if (count !== size) return false
  }
  return true
}

export function applyAction(room: RoomState, action: RoomAction, now = Date.now()): RoomState {
  switch (action.type) {
    case 'hello':
    case 'request-state':
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
        const isCreator =
          next.creatorName.trim().toLowerCase() === action.player.name.trim().toLowerCase()
        if (action.reclaimHost && isCreator) {
          next = { ...next, hostId: action.player.id, pendingHostReturn: null }
        } else if (next.kind === 'scorecard' && existingById.left) {
          next = continueFromCurrentRound(next, action.player.id)
          if (next.status === 'playing') {
            next = {
              ...next,
              players: {
                ...next.players,
                [action.player.id]: withRoundJoinPrompt(next.players[action.player.id]!, true),
              },
            }
          }
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
          reclaimHost: action.reclaimHost,
        })
      }

      if (room.kind === 'hot-potato' && Object.keys(room.players).length >= 50) {
        return room
      }
      if (room.kind === 'neighborhood') {
        const activeCount = activeList(room).length
        if (room.status === 'lobby' && !room.rulesLocked) {
          if (activeCount >= maxPhonesForRules(room.rules)) return room
        } else if (room.game) {
          // Mid-game join: open seat or queue for owner
          if (activeCount >= maxPhonesForRules(room.rules)) return room
          const game = room.game
          if (isOpenJoin(game)) {
            // Continue into normal player add, then seat in game below
          } else {
            const exists = (game.joinRequests ?? []).some((r) => r.playerId === action.player.id)
            if (exists) return room
            return {
              ...room,
              game: {
                ...game,
                joinRequests: [
                  ...(game.joinRequests ?? []),
                  {
                    playerId: action.player.id,
                    name: action.player.name,
                    sessionId: sessionId,
                    at: now,
                  },
                ],
              },
              players: {
                ...room.players,
                [action.player.id]: { ...action.player, left: false, sessionId },
              },
            }
          }
        } else {
          return room
        }
      }
      const askRoundChoice = room.kind === 'scorecard' && room.status === 'playing'
      let next: RoomState = {
        ...room,
        players: {
          ...room.players,
          [action.player.id]: withRoundJoinPrompt(
            { ...action.player, left: false, sessionId },
            askRoundChoice,
          ),
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
      if (room.kind === 'neighborhood' && room.game && isOpenJoin(room.game)) {
        const nb = next as NeighborhoodRoom
        const used = new Set(Object.values(nb.game!.trays).map((t) => t.pieceId))
        const pieceId = NEIGHBORHOOD_PIECES.find((p) => !used.has(p))
        if (!pieceId) return next
        const names = Object.fromEntries(
          Object.values(nb.players).map((p) => [p.id, p.name]),
        )
        // accept-join expects a joinRequests entry
        const withReq = {
          ...nb.game!,
          joinRequests: [
            {
              playerId: action.player.id,
              name: action.player.name,
              sessionId,
              at: now,
            },
          ],
        }
        const seated = applySliceCAction(withReq, nb.rules, names, nb.hostId, {
          type: 'accept-join',
          fromId: nb.hostId,
          playerId: action.player.id,
          pieceId,
        })
        return { ...nb, game: seated, pieces: { ...nb.pieces, [action.player.id]: pieceId } }
      }
      return next
    }

    case 'rejoin': {
      const match = findPlayerByName(room, action.name)
      if (!match) return room
      return takeOverSeat(room, match, action.playerId, action.sessionId, {
        wasLeft: Boolean(match.left),
        reclaimHost: action.reclaimHost,
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

      if (room.kind === 'neighborhood') {
        // Soft-leave in lobby so reconnect works; strip piece/team when leaving lobby
        const pieces = { ...room.pieces }
        const teamOf = { ...room.teamOf }
        delete pieces[action.playerId]
        delete teamOf[action.playerId]
        return {
          ...room,
          hostId,
          players: {
            ...room.players,
            [action.playerId]: { ...player, left: true },
          },
          pieces,
          teamOf,
          pendingHostReturn:
            room.pendingHostReturn?.playerId === action.playerId ? null : room.pendingHostReturn,
        }
      }

      const { [action.playerId]: _, ...rest } = room.players
      const hp = room as HotPotatoRoom
      return {
        ...hp,
        hostId: hostId === action.playerId ? (Object.keys(rest)[0] ?? hostId) : hostId,
        players: rest,
        aliveIds: hp.aliveIds.filter((id) => id !== action.playerId),
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
      const seat: RoomPlayer = withRoundJoinPrompt(
        {
          ...action.player,
          controlledBy: action.fromId,
          left: false,
        },
        room.status === 'playing',
      )
      let next: ScorecardRoom = {
        ...room,
        players: { ...room.players, [seat.id]: seat },
      }
      if (room.status === 'playing' && room.completedRounds >= 1) {
        next = copyLastPlaceScores(next, seat.id, room.completedRounds)
      }
      return next
    }

    case 'set-round-join-choice': {
      if (room.kind !== 'scorecard' || room.status !== 'playing') return room
      if (!canControl(room, action.fromId, action.targetPlayerId)) return room
      const target = room.players[action.targetPlayerId]
      if (!target || target.left || !target.needsRoundJoinChoice) return room
      if (action.choice === 'this-round') {
        return {
          ...room,
          players: {
            ...room.players,
            [action.targetPlayerId]: {
              ...target,
              needsRoundJoinChoice: false,
              joinNextRound: false,
            },
          },
        }
      }
      // Next Round — clear any open-round score so worst is applied at advance
      let scores = room.scores
      const existing = scores[action.targetPlayerId]
      if (existing && existing[room.currentRound] !== undefined) {
        const { [room.currentRound]: _drop, ...kept } = existing
        scores = { ...scores, [action.targetPlayerId]: kept }
      }
      return {
        ...room,
        scores,
        players: {
          ...room.players,
          [action.targetPlayerId]: {
            ...target,
            needsRoundJoinChoice: false,
            joinNextRound: true,
          },
        },
      }
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
      if (target.needsRoundJoinChoice || target.joinNextRound) return room
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
      if (action.fromId !== room.hostId) return room
      return { ...room, status: 'closed', hostAwayAt: null }
    }

    case 'host-away': {
      if (action.fromId !== room.hostId) return room
      return { ...room, hostAwayAt: now }
    }

    case 'host-back': {
      if (action.fromId !== room.hostId) return room
      return { ...room, hostAwayAt: null }
    }

    case 'claim-host': {
      const claimant = room.players[action.fromId]
      if (!claimant || claimant.left) return room
      if (room.hostId === action.fromId) {
        return { ...room, hostAwayAt: null }
      }
      if (!room.hostAwayAt) return room
      const next = nextHostCandidate(room, room.hostId)
      if (next !== action.fromId) return room
      const due =
        room.status === 'finished' || now - room.hostAwayAt >= HOST_AWAY_MS
      if (!due) return room
      return {
        ...room,
        hostId: action.fromId,
        hostAwayAt: null,
        pendingHostReturn: null,
      }
    }

    case 'restart-same-players': {
      if (room.kind !== 'scorecard') return room
      if (action.fromId !== room.hostId || room.status !== 'finished') return room
      const pruned = pruneInactivePlayers(room)
      return {
        ...pruned,
        status: 'lobby',
        currentRound: 1,
        completedRounds: 0,
        scores: {},
        endVotes: {},
        finishedAt: undefined,
        regrouping: false,
        pullTo: undefined,
        pendingHostReturn: null,
        hostAwayAt: null,
      }
    }

    case 'set-neighborhood-piece': {
      if (room.kind !== 'neighborhood' || room.rulesLocked || room.status !== 'lobby') {
        return room
      }
      const me = room.players[action.fromId]
      if (!me || me.left) return room
      if (!NEIGHBORHOOD_PIECES.includes(action.pieceId)) return room
      if (pieceTakenByOther(room, action.pieceId, action.fromId)) return room

      if (room.rules.teamStyle === 'shared') {
        const tray = room.teamOf[action.fromId]
        if (tray) {
          const mates = activeList(room).filter(
            (p) => p.id !== action.fromId && room.teamOf[p.id] === tray,
          )
          // Teammate already set the tray piece — must match
          const matePiece = mates.map((m) => room.pieces[m.id]).find(Boolean)
          if (matePiece && matePiece !== action.pieceId) return room
        }
      }

      return {
        ...room,
        pieces: { ...room.pieces, [action.fromId]: action.pieceId },
      }
    }

    case 'set-neighborhood-team': {
      if (room.kind !== 'neighborhood' || room.rulesLocked || room.status !== 'lobby') {
        return room
      }
      const me = room.players[action.fromId]
      if (!me || me.left) return room
      const style = room.rules.teamStyle
      if (style === 'off') return room

      if (style === 'shared') {
        if (!(SHARED_TRAY_IDS as readonly string[]).includes(action.teamId)) return room
        const onTray = activeList(room).filter(
          (p) => p.id !== action.fromId && room.teamOf[p.id] === action.teamId,
        )
        if (onTray.length >= 2) return room
        let pieces = room.pieces
        const matePiece = onTray.map((m) => room.pieces[m.id]).find(Boolean)
        if (matePiece) {
          pieces = { ...pieces, [action.fromId]: matePiece }
        }
        return {
          ...room,
          teamOf: { ...room.teamOf, [action.fromId]: action.teamId },
          pieces,
        }
      }

      // Alliance
      const preset = room.rules.alliancePreset ?? '2v2v2v2'
      const groups = allianceGroupIds(preset)
      if (!groups.includes(action.teamId)) return room
      const size = allianceGroupSize(preset)
      const onGroup = activeList(room).filter(
        (p) => p.id !== action.fromId && room.teamOf[p.id] === action.teamId,
      )
      if (onGroup.length >= size) return room
      return {
        ...room,
        teamOf: { ...room.teamOf, [action.fromId]: action.teamId },
      }
    }

    case 'start-neighborhood': {
      if (room.kind !== 'neighborhood' || action.fromId !== room.hostId) return room
      if (room.status !== 'lobby' || room.rulesLocked) return room
      if (!neighborhoodLobbyReady(room)) return room
      const seats: SeatInput[] = activeList(room).map((p) => ({
        playerId: p.id,
        pieceId: room.pieces[p.id]!,
        teamId: room.teamOf[p.id],
      }))
      const game = initNeighborhoodGame(seats, room.rules)
      return {
        ...room,
        status: 'playing',
        rulesLocked: true,
        boardReady: true,
        game,
        hostAwayAt: null,
      }
    }

    case 'nb-opening-roll':
    case 'nb-roll':
    case 'nb-buy':
    case 'nb-decline-buy':
    case 'nb-tax':
    case 'nb-ack-card':
    case 'nb-jail':
    case 'nb-auction-raise':
    case 'nb-auction-pass':
    case 'nb-debt-bankrupt':
    case 'nb-end-turn': {
      if (room.kind !== 'neighborhood' || !room.game) return room
      const trayId = trayIdForPlayer(room.rules, action.fromId, room.teamOf)
      const names = Object.fromEntries(
        Object.values(room.players).map((p) => [p.id, p.name]),
      )
      const mapAction = (): Parameters<typeof applyNeighborhoodGameAction>[3] | null => {
        switch (action.type) {
          case 'nb-opening-roll':
            return { type: 'opening-roll', fromId: action.fromId, trayId }
          case 'nb-roll':
            return { type: 'roll', fromId: action.fromId, trayId }
          case 'nb-buy':
            return { type: 'buy', fromId: action.fromId, trayId }
          case 'nb-decline-buy':
            return { type: 'decline-buy', fromId: action.fromId, trayId }
          case 'nb-tax':
            return { type: 'tax', fromId: action.fromId, trayId, choice: action.choice }
          case 'nb-ack-card':
            return { type: 'ack-card', fromId: action.fromId, trayId }
          case 'nb-jail':
            return { type: 'jail', fromId: action.fromId, trayId, choice: action.choice }
          case 'nb-auction-raise':
            return { type: 'auction-raise', fromId: action.fromId, trayId }
          case 'nb-auction-pass':
            return { type: 'auction-pass', fromId: action.fromId, trayId }
          case 'nb-debt-bankrupt':
            return { type: 'debt-bankrupt', fromId: action.fromId, trayId }
          case 'nb-end-turn':
            return { type: 'end-turn', fromId: action.fromId, trayId }
          default:
            return null
        }
      }
      const ga = mapAction()
      if (!ga) return room
      const game = applyNeighborhoodGameAction(room.game, room.rules, names, ga)
      const status = game.phase === 'finished' ? 'finished' : room.status
      return {
        ...room,
        game,
        status,
        finishedAt: game.phase === 'finished' ? now : room.finishedAt,
      }
    }

    case 'nb-debt-select':
    case 'nb-debt-pay':
    case 'nb-build':
    case 'nb-sell-building':
    case 'nb-mortgage':
    case 'nb-unmortgage':
    case 'nb-trade-open':
    case 'nb-trade-draft':
    case 'nb-trade-send':
    case 'nb-trade-accept':
    case 'nb-trade-decline':
    case 'nb-trade-counter':
    case 'nb-leave-game':
    case 'nb-player-away':
    case 'nb-player-back':
    case 'nb-remove-player':
    case 'nb-accept-join':
    case 'nb-decline-join': {
      if (room.kind !== 'neighborhood' || !room.game) return room
      const trayId = trayIdForPlayer(room.rules, action.fromId, room.teamOf)
      const names = Object.fromEntries(
        Object.values(room.players).map((p) => [p.id, p.name]),
      )
      const mapC = (): Parameters<typeof applySliceCAction>[4] | null => {
        switch (action.type) {
          case 'nb-debt-select':
            return {
              type: 'debt-select',
              fromId: action.fromId,
              trayId,
              selectedDeeds: action.selectedDeeds,
              cashOffer: action.cashOffer,
            }
          case 'nb-debt-pay':
            return { type: 'debt-pay', fromId: action.fromId, trayId }
          case 'nb-build':
            return { type: 'build', fromId: action.fromId, trayId, spaceIndex: action.spaceIndex }
          case 'nb-sell-building':
            return {
              type: 'sell-building',
              fromId: action.fromId,
              trayId,
              spaceIndex: action.spaceIndex,
            }
          case 'nb-mortgage':
            return { type: 'mortgage', fromId: action.fromId, trayId, spaceIndex: action.spaceIndex }
          case 'nb-unmortgage':
            return {
              type: 'unmortgage',
              fromId: action.fromId,
              trayId,
              spaceIndex: action.spaceIndex,
            }
          case 'nb-trade-open':
            return {
              type: 'trade-open',
              fromId: action.fromId,
              trayId,
              toTrayId: action.toTrayId,
            }
          case 'nb-trade-draft':
            return {
              type: 'trade-draft',
              fromId: action.fromId,
              trayId,
              offerCash: action.offerCash,
              offerDeeds: action.offerDeeds,
              offerJailFreeWild: action.offerJailFreeWild,
              offerJailFreeNeighbor: action.offerJailFreeNeighbor,
              askCash: action.askCash,
              askDeeds: action.askDeeds,
              askJailFreeWild: action.askJailFreeWild,
              askJailFreeNeighbor: action.askJailFreeNeighbor,
            }
          case 'nb-trade-send':
            return { type: 'trade-send', fromId: action.fromId, trayId }
          case 'nb-trade-accept':
            return { type: 'trade-accept', fromId: action.fromId, trayId }
          case 'nb-trade-decline':
            return { type: 'trade-decline', fromId: action.fromId, trayId }
          case 'nb-trade-counter':
            return { type: 'trade-counter', fromId: action.fromId, trayId }
          case 'nb-leave-game':
            return {
              type: 'leave-game',
              fromId: action.fromId,
              trayId,
              giftTo: action.giftTo,
              spectate: action.spectate,
            }
          case 'nb-player-away':
            return { type: 'player-away', fromId: action.fromId, at: action.at }
          case 'nb-player-back':
            return { type: 'player-back', fromId: action.fromId }
          case 'nb-remove-player':
            return {
              type: 'remove-player',
              fromId: action.fromId,
              targetPlayerId: action.targetPlayerId,
              now,
            }
          case 'nb-accept-join':
            return {
              type: 'accept-join',
              fromId: action.fromId,
              playerId: action.playerId,
              pieceId: action.pieceId,
              teamId: action.teamId,
            }
          case 'nb-decline-join':
            return {
              type: 'decline-join',
              fromId: action.fromId,
              playerId: action.playerId,
            }
          default:
            return null
        }
      }
      const ca = mapC()
      if (!ca) return room
      const game = applySliceCAction(room.game, room.rules, names, room.hostId, ca)
      const status = game.phase === 'finished' ? 'finished' : room.status
      return {
        ...room,
        game,
        status,
        finishedAt: game.phase === 'finished' ? now : room.finishedAt,
      }
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
