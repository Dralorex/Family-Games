import type { HostReturnRequest } from '../rooms/types'

export function HostReturnPrompt(props: {
  request: HostReturnRequest
  onAccept: () => void
  onDecline: () => void
}) {
  return (
    <div className="bubble host-return-prompt">
      <p>
        <strong>{props.request.name}</strong> (original host) rejoined. Give them game master
        ownership back?
      </p>
      <div className="modal-actions">
        <button type="button" className="btn secondary" onClick={props.onDecline}>
          Keep ownership
        </button>
        <button type="button" className="btn primary" onClick={props.onAccept}>
          Give ownership to {props.request.name}
        </button>
      </div>
    </div>
  )
}
