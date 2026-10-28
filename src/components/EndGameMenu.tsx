import type { EndVote } from '../rooms/types'
import type { RoomPlayer } from '../rooms/types'

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
  // Denominator shrinks as people leave
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
    </div>
  )
}
