import type { EndVote, RoomPlayer } from '../rooms/types'

const OPTIONS: { vote: EndVote; label: string }[] = [
  { vote: 'new-game', label: 'New Game' },
  { vote: 'change-names', label: 'Change Names' },
  { vote: 'same-players', label: 'Same Players' },
  { vote: 'leave', label: 'Leave' },
]

export function EndGameMenu(props: {
  isHost: boolean
  playerId: string
  players: RoomPlayer[]
  votes: Record<string, EndVote>
  onVote: (vote: EndVote) => void
  onHostNewGame: () => void
  /** Host ends the lobby for everyone — no Continue Game afterward */
  onCloseLobby?: () => void
}) {
  const active = props.players.filter((p) => !p.left)
  const total = active.length
  const counts = OPTIONS.reduce(
    (acc, o) => {
      acc[o.vote] = active.filter((p) => props.votes[p.id] === o.vote).length
      return acc
    },
    {} as Record<EndVote, number>,
  )
  const remaining = active.filter((p) => props.votes[p.id] !== 'leave').length || total
  const myVote = props.votes[props.playerId]

  return (
    <div className="bubble end-menu">
      <h2>What's next?</h2>
      <div className="end-vote-grid">
        {OPTIONS.map((o) => (
          <button
            key={o.vote}
            type="button"
            className={`btn secondary end-vote ${myVote === o.vote ? 'selected' : ''}`}
            onClick={() => {
              props.onVote(o.vote)
              if (props.isHost && o.vote === 'new-game') props.onHostNewGame()
            }}
          >
            <span>{o.label}</span>
            {props.isHost ? (
              <span className="vote-count">
                {counts[o.vote]}/{o.vote === 'leave' ? total : remaining}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {props.isHost && props.onCloseLobby ? (
        <button type="button" className="btn danger" onClick={props.onCloseLobby}>
          Close lobby
        </button>
      ) : null}
      {props.isHost ? (
        <p className="muted end-menu-hint">
          Same Players keeps active names and removes anyone who left. Close lobby ends the room for
          everyone — no Continue Game afterward.
        </p>
      ) : null}
    </div>
  )
}
