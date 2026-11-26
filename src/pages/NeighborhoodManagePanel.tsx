import {
  COLOR_GROUPS,
  LINE_INDEXES,
  WORKS_INDEXES,
  spaceAt,
  type ColorGroup,
} from '../core/neighborhood/board'
import { NeighborhoodDeedCard } from '../components/NeighborhoodDeedCard'
import { COLOR_GROUP_LABELS } from '../core/neighborhood/deedInfo'
import {
  buildCost,
  canBuildOn,
  canMortgage,
  canSellBuilding,
  canUnmortgage,
  sellBuildingRefund,
  unmortgageCost,
} from '../core/neighborhood/economy'
import {
  canTapTray,
  currentTrayId,
  trayIdForPlayer,
} from '../core/neighborhood/engine'
import { formatCash } from '../core/neighborhood/money'
import type { NeighborhoodRoom } from '../rooms/types'
import type { useRoom } from '../hooks/useRoom'

const GROUP_ORDER: Array<ColorGroup | 'line' | 'works'> = [
  'pebble',
  'creek',
  'garden',
  'market',
  'harbor',
  'meadow',
  'forest',
  'crown',
  'line',
  'works',
]

function groupTitle(key: ColorGroup | 'line' | 'works'): string {
  if (key === 'line') return 'Lines'
  if (key === 'works') return 'Works'
  return COLOR_GROUP_LABELS[key]
}

function indexesForGroup(key: ColorGroup | 'line' | 'works'): number[] {
  if (key === 'line') return [...LINE_INDEXES]
  if (key === 'works') return [...WORKS_INDEXES]
  return COLOR_GROUPS[key]
}

export function NeighborhoodManagePanel(props: {
  room: NeighborhoodRoom
  playerId: string
  send: ReturnType<typeof useRoom>['send']
  onOpenTrade?: () => void
}) {
  const { room, playerId, send, onOpenTrade } = props
  const game = room.game

  if (!game || game.phase !== 'playing') {
    return <p className="muted">Manage opens during play.</p>
  }

  const myTrayId = trayIdForPlayer(room.rules, playerId, room.teamOf)
  const myTray = game.trays[myTrayId]
  const turnId = currentTrayId(game)
  const myTurn = Boolean(turnId && turnId === myTrayId && canTapTray(game, playerId, turnId))
  const canManage = myTurn && (!game.prompt || game.prompt.type === 'debt')
  const canTrade =
    Boolean(onOpenTrade) &&
    myTurn &&
    !myTray?.spectating &&
    (!game.prompt || (game.prompt.type === 'trade' && !game.prompt.frozen))

  const mine = Object.entries(game.deeds)
    .filter(([, d]) => d.ownerTrayId === myTrayId)
    .map(([i]) => Number(i))

  const names: Record<string, string> = {}
  for (const [id, p] of Object.entries(room.players)) names[id] = p.name

  if (myTray?.spectating) {
    return <p className="nb-spectating-banner">Spectating — manage is closed.</p>
  }

  const grouped = GROUP_ORDER.map((key) => {
    const idxs = indexesForGroup(key).filter((i) => mine.includes(i))
    return { key, idxs }
  }).filter((g) => g.idxs.length > 0)

  return (
    <div className="nb-manage">
      <div className="nb-manage-top">
        <h2 className="section-heading">Your deeds</h2>
        {onOpenTrade ? (
          <button
            type="button"
            className="btn primary"
            disabled={!canTrade}
            onClick={onOpenTrade}
          >
            Trade
          </button>
        ) : null}
      </div>
      {!canTrade && myTurn && game.prompt && game.prompt.type !== 'trade' ? (
        <p className="muted">Trades open on your turn when nothing else is pending.</p>
      ) : null}
      {game.prompt?.type === 'trade' && game.prompt.frozen ? (
        <p className="muted">
          Trade offer frozen — waiting for a reply. Reserved items cannot be spent.
        </p>
      ) : null}

      {(myTray?.jailFreeWild ?? 0) + (myTray?.jailFreeNeighbor ?? 0) > 0 ? (
        <div className="nb-holdings-cards">
          <h3 className="nb-group-heading">Cards you hold</h3>
          <ul className="player-list">
            {myTray!.jailFreeWild > 0 ? (
              <li>Get out of Jail · Wild ×{myTray!.jailFreeWild}</li>
            ) : null}
            {myTray!.jailFreeNeighbor > 0 ? (
              <li>Get out of Jail · Neighbor Notes ×{myTray!.jailFreeNeighbor}</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {mine.length === 0 ? <p className="muted">No deeds yet.</p> : null}

      {grouped.map(({ key, idxs }) => (
        <section key={key} className="nb-deed-group-section">
          <h3 className="nb-group-heading">{groupTitle(key)}</h3>
          <div className="nb-deed-stack">
            {idxs.map((i) => {
              const s = spaceAt(i)
              const cost = canBuildOn(game, myTrayId, i, room.rules)
                ? buildCost(game, i, room.rules)
                : 0
              const refund = canSellBuilding(game, myTrayId, i)
                ? sellBuildingRefund(game, i, room.rules)
                : 0
              return (
                <div key={i} className="nb-deed-manage-item">
                  <NeighborhoodDeedCard
                    game={game}
                    spaceIndex={i}
                    names={names}
                    myTrayId={myTrayId}
                    showGroup={false}
                    compact
                  />
                  {canManage ? (
                    <div className="chip-row">
                      {canBuildOn(game, myTrayId, i, room.rules) ? (
                        <button
                          type="button"
                          className="chip"
                          onClick={() =>
                            send({ type: 'nb-build', fromId: playerId, spaceIndex: i })
                          }
                        >
                          {cost > (s.kind === 'property' ? s.houseCost : 0)
                            ? `Hotel ${formatCash(cost)}`
                            : `Build ${formatCash(cost)}`}
                        </button>
                      ) : null}
                      {canSellBuilding(game, myTrayId, i) ? (
                        <button
                          type="button"
                          className="chip"
                          onClick={() =>
                            send({ type: 'nb-sell-building', fromId: playerId, spaceIndex: i })
                          }
                        >
                          Sell {formatCash(refund)}
                        </button>
                      ) : null}
                      {canMortgage(game, myTrayId, i) ? (
                        <button
                          type="button"
                          className="chip"
                          onClick={() =>
                            send({ type: 'nb-mortgage', fromId: playerId, spaceIndex: i })
                          }
                        >
                          Mortgage
                          {s.kind === 'property' || s.kind === 'line' || s.kind === 'works'
                            ? ` ${formatCash(s.mortgage)}`
                            : ''}
                        </button>
                      ) : null}
                      {canUnmortgage(game, myTrayId, i, room.rules) ? (
                        <button
                          type="button"
                          className="chip"
                          onClick={() =>
                            send({ type: 'nb-unmortgage', fromId: playerId, spaceIndex: i })
                          }
                        >
                          Lift {formatCash(unmortgageCost(i, room.rules))}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
