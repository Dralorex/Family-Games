import { useMemo, useRef, type RefObject } from 'react'
import { toPng } from 'html-to-image'
import {
  playerTotal,
  shouldShowRunningSums,
} from '../core/score/engine'
import type { ScorecardRoom } from '../rooms/types'

export function ScorecardTable(props: {
  room: ScorecardRoom
  focusPlayerId: string
  showOthers: boolean
  exportRef?: RefObject<HTMLDivElement | null>
}) {
  const { room, focusPlayerId, showOthers } = props
  const localRef = useRef<HTMLDivElement>(null)
  const wrapRef = props.exportRef ?? localRef

  const players = useMemo(() => {
    const all = Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt)
    if (showOthers) return all
    return all.filter((p) => p.id === focusPlayerId)
  }, [room.players, showOthers, focusPlayerId])

  const maxRound = Math.max(room.currentRound, room.completedRounds, 1)
  const showSums = shouldShowRunningSums(room.completedRounds)

  const rows: { kind: 'round' | 'sum'; round: number }[] = []
  for (let r = 1; r <= maxRound; r++) {
    rows.push({ kind: 'round', round: r })
    if (showSums && r >= 2 && r <= room.completedRounds) {
      rows.push({ kind: 'sum', round: r })
    }
  }

  return (
    <div className="scorecard-table-card" ref={wrapRef}>
      <div className="score-table-wrap">
        <table className="score-table transposed">
          <thead>
            <tr>
              <th>Round</th>
              {players.map((p) => (
                <th key={p.id} className={p.id === focusPlayerId ? 'me' : ''}>
                  {p.name}
                  {p.left ? ' (out)' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              row.kind === 'round' ? (
                <tr key={`r-${row.round}`}>
                  <th scope="row">R{row.round}</th>
                  {players.map((p) => (
                    <td key={p.id} className={p.id === focusPlayerId ? 'me' : ''}>
                      {room.scores[p.id]?.[row.round] ?? '—'}
                    </td>
                  ))}
                </tr>
              ) : (
                <tr key={`s-${row.round}`} className="sum-row">
                  <th scope="row">Sum</th>
                  {players.map((p) => (
                    <td key={p.id} className={`total-cell ${p.id === focusPlayerId ? 'me' : ''}`}>
                      {playerTotal(room.scores, p.id, row.round)}
                    </td>
                  ))}
                </tr>
              ),
            )}
            <tr className="game-total-row">
              <th scope="row">Total</th>
              {players.map((p) => (
                <td key={p.id} className={`total-cell ${p.id === focusPlayerId ? 'me' : ''}`}>
                  {room.completedRounds >= 1 || room.status === 'finished'
                    ? playerTotal(room.scores, p.id)
                    : '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="game-total-foot">
        {room.title} · {room.winDirection === 'low' ? 'lowest wins' : 'highest wins'}
        {room.pointLimit ? ` · limit ${room.pointLimit}` : ''}
      </p>
    </div>
  )
}

/** Capture the full scorecard node (not just the viewport). */
export async function exportScorecardPng(node: HTMLElement, filename: string): Promise<void> {
  const dataUrl = await toPng(node, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: '#f6f1e6',
  })
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}
