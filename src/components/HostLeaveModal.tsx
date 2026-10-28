import { useMemo, useState } from 'react'
import type { RoomPlayer } from '../rooms/types'

export function HostLeaveModal(props: {
  players: RoomPlayer[]
  hostId: string
  defaultNextId?: string
  onConfirm: (newHostId: string) => void
  onCancel: () => void
}) {
  const candidates = useMemo(
    () =>
      props.players
        .filter((p) => !p.left && p.id !== props.hostId)
        .sort((a, b) => a.joinedAt - b.joinedAt),
    [props.players, props.hostId],
  )
  const [selected, setSelected] = useState(
    props.defaultNextId && candidates.some((c) => c.id === props.defaultNextId)
      ? props.defaultNextId
      : candidates[0]?.id ?? '',
  )

  if (candidates.length === 0) {
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <div className="bubble modal-card">
          <h2>Leave game?</h2>
          <p className="muted">You're the only one left. Leaving will end your session.</p>
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={props.onCancel}>
              Stay
            </button>
            <button type="button" className="btn danger" onClick={() => props.onConfirm('')}>
              Leave anyway
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="bubble modal-card">
        <h2>Hand off game master</h2>
        <p className="muted">Pick who becomes game master when you leave. Next in line is selected by default.</p>
        <label className="field">
          <span>New game master</span>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {candidates.map((p, i) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {i === 0 ? ' (next in line)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={props.onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!selected}
            onClick={() => props.onConfirm(selected)}
          >
            Leave & hand off
          </button>
        </div>
      </div>
    </div>
  )
}
