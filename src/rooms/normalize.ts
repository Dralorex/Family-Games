import type { RoomState } from './types'

/** Backfill fields added after v1 launch. */
export function normalizeRoom(room: RoomState): RoomState {
  const title =
    'title' in room && typeof room.title === 'string' && room.title
      ? room.title
      : room.kind === 'scorecard'
        ? room.templateName
        : 'Hot Potato'
  const partyId =
    'partyId' in room && typeof room.partyId === 'string' && room.partyId
      ? room.partyId
      : room.code
  const hostPlayer = room.players[room.hostId]
  const creatorName =
    'creatorName' in room && typeof room.creatorName === 'string' && room.creatorName
      ? room.creatorName
      : hostPlayer?.name ?? 'Host'
  const players = Object.fromEntries(
    Object.entries(room.players).map(([id, p]) => [id, { ...p, left: p.left ?? false }]),
  )
  return {
    ...room,
    title,
    partyId,
    creatorName,
    players,
    pendingHostReturn: room.pendingHostReturn ?? null,
  }
}
