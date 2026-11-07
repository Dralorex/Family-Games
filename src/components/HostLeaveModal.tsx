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
      : '',
  )

  if (candidates.length === 0) {
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <div className="bubble modal-card">
          <h2>Leave game?</h2>
          <p className="muted">You're the only active player left. Leaving will end your session.</p>
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
        <p className="muted">
          Tap who should become game master. Only players still in the game are shown.
        </p>
        <div className="promote-name-grid" role="listbox" aria-label="Promote player">
          {candidates.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={selected === p.id}
              className={`promote-name-chip ${selected === p.id ? 'selected' : ''}`}
              onClick={() => setSelected(p.id)}
            >
              {p.name}
              {i === 0 ? <span className="promote-hint">next</span> : null}
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={props.onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn danger leave-confirm-btn ${selected ? 'armed' : 'ghosted'}`}
            disabled={!selected}
            onClick={() => props.onConfirm(selected)}
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  )
}
