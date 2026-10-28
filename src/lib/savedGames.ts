import { compressJson, decompressJson } from './compress'
import type { RoomState } from '../rooms/types'

export interface SavedGameMeta {
  id: string
  title: string
  code: string
  kind: RoomState['kind']
  templateName?: string
  pausedAt: number
  createdAt: number
  playerNames: string[]
}

export interface SavedGame extends SavedGameMeta {
  room: RoomState
}

const INDEX_KEY = 'fg_saved_index'
const ENTRY_PREFIX = 'fg_saved_'

function readIndex(): SavedGameMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedGameMeta[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeIndex(list: SavedGameMeta[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list))
}

export function listSavedGames(): SavedGameMeta[] {
  return readIndex().sort((a, b) => b.pausedAt - a.pausedAt)
}

export async function saveGame(room: RoomState, title?: string): Promise<SavedGameMeta> {
  const existing = readIndex().find((g) => g.code === room.code)
  const id = existing?.id ?? `sg_${room.code}_${Date.now()}`
  const meta: SavedGameMeta = {
    id,
    title: (title || ('title' in room ? room.title : '') || room.code).trim() || room.code,
    code: room.code,
    kind: room.kind,
    templateName: room.kind === 'scorecard' ? room.templateName : 'Hot Potato',
    pausedAt: Date.now(),
    createdAt: existing?.createdAt ?? room.createdAt,
    playerNames: Object.values(room.players).map((p) => p.name),
  }
  const payload = await compressJson({ ...meta, room } satisfies SavedGame)
  localStorage.setItem(ENTRY_PREFIX + id, payload)
  const next = [meta, ...readIndex().filter((g) => g.id !== id)]
  writeIndex(next)
  return meta
}

export async function loadSavedGame(id: string): Promise<SavedGame | null> {
  const raw = localStorage.getItem(ENTRY_PREFIX + id)
  if (!raw) return null
  try {
    return await decompressJson<SavedGame>(raw)
  } catch {
    return null
  }
}

export function deleteSavedGame(id: string): void {
  localStorage.removeItem(ENTRY_PREFIX + id)
  writeIndex(readIndex().filter((g) => g.id !== id))
}

export function findSavedByCode(code: string): SavedGameMeta | undefined {
  return readIndex().find((g) => g.code === code.toUpperCase())
}
