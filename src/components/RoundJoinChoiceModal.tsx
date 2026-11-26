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
          Is <strong>{props.playerName}</strong> joining for this round or starting next round?
        </p>
        <p className="muted">
          This Round: they enter a score now, and the previous round gets that round’s worst score.
          Next Round: when this round ends, it gets that round’s worst score. Earlier rounds stay
          blank.
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
