import type { RoomState } from './types'

const cache = new Map<string, RoomState>()

export function getCachedRoom(code: string): RoomState | undefined {
  return cache.get(code)
}

export function setCachedRoom(state: RoomState): void {
  cache.set(state.code, state)
}

export function clearCachedRoom(code: string): void {
  cache.delete(code)
}
