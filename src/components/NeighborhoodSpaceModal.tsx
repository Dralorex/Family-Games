import { NeighborhoodDeedCard } from './NeighborhoodDeedCard'
import { spaceAt } from '../core/neighborhood/board'
import { trayIdForPlayer } from '../core/neighborhood/engine'
import { formatCash } from '../core/neighborhood/money'
import type { NeighborhoodRoom } from '../rooms/types'
import type { useRoom } from '../hooks/useRoom'

export function NeighborhoodSpaceModal(props: {
  room: NeighborhoodRoom
  playerId: string
  spaceIndex: number
  /** When set, show buy / decline actions for this landing */
  buyPrice?: number
  send?: ReturnType<typeof useRoom>['send']
  onClose: () => void
}) {
  const { room, playerId, spaceIndex, buyPrice, send, onClose } = props
  const game = room.game
  if (!game) return null

  const myTrayId = trayIdForPlayer(room.rules, playerId, room.teamOf)
  const names: Record<string, string> = {}
  for (const [id, p] of Object.entries(room.players)) names[id] = p.name
  const space = spaceAt(spaceIndex)
  const isBuy = buyPrice != null && send

  return (
    <div
      className="modal-backdrop nb-space-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={isBuy ? `Buy ${space.name}` : space.name}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBuy) onClose()
      }}
    >
      <div className="bubble modal-card nb-space-card">
        {isBuy ? <h2>Buy this deed?</h2> : <h2>Deed</h2>}
        <NeighborhoodDeedCard
          game={game}
          spaceIndex={spaceIndex}
          names={names}
          myTrayId={myTrayId}
          showGroup
        />
        {isBuy ? (
          <div className="modal-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => send!({ type: 'nb-buy', fromId: playerId })}
            >
              Buy {formatCash(buyPrice!)}
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => send!({ type: 'nb-decline-buy', fromId: playerId })}
            >
              {room.rules.noAuctions ? 'Decline' : 'Decline / Auction'}
            </button>
          </div>
        ) : (
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
