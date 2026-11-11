export function RoundJoinChoiceModal(props: {
  playerName: string
  currentRound: number
  onThisRound: () => void
  onNextRound: () => void
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Round join choice">
      <div className="bubble modal-card">
        <h2>Join round {props.currentRound}?</h2>
        <p>
          Are you participating in this current round or starting on the next round?
        </p>
        <p className="muted">
          For <strong>{props.playerName}</strong>: This Round lets you enter a score now. Next Round
          applies the worst score for round {props.currentRound} when it ends, then you play from
          there.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn primary" onClick={props.onThisRound}>
            This Round
          </button>
          <button type="button" className="btn secondary" onClick={props.onNextRound}>
            Next Round
          </button>
        </div>
      </div>
    </div>
  )
}
