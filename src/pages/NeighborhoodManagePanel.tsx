import { useState } from 'react'
import { BOARD, isDeedSpace, spaceAt } from '../core/neighborhood/board'
import {
  bareDeedIndexes,
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

export function NeighborhoodManagePanel(props: {
  room: NeighborhoodRoom
  playerId: string
  send: ReturnType<typeof useRoom>['send']
}) {
  const { room, playerId, send } = props
  const game = room.game
  const [tradeTarget, setTradeTarget] = useState('')
  const [offerCash, setOfferCash] = useState(0)
  const [askCash, setAskCash] = useState(0)
  const [offerDeeds, setOfferDeeds] = useState<number[]>([])
  const [askDeeds, setAskDeeds] = useState<number[]>([])
  const [offerJailFreeWild, setOfferJailFreeWild] = useState(0)
  const [offerJailFreeNeighbor, setOfferJailFreeNeighbor] = useState(0)
  const [askJailFreeWild, setAskJailFreeWild] = useState(0)
  const [askJailFreeNeighbor, setAskJailFreeNeighbor] = useState(0)

  if (!game || game.phase !== 'playing') {
    return <p className="muted">Manage opens during play.</p>
  }

  const myTrayId = trayIdForPlayer(room.rules, playerId, room.teamOf)
  const myTray = game.trays[myTrayId]
  const turnId = currentTrayId(game)
  const myTurn = Boolean(turnId && turnId === myTrayId && canTapTray(game, playerId, turnId))
  const canManage = myTurn && (!game.prompt || game.prompt.type === 'debt')
  const mine = Object.entries(game.deeds)
    .filter(([, d]) => d.ownerTrayId === myTrayId)
    .map(([i]) => Number(i))

  const others = Object.keys(game.trays).filter(
    (id) => id !== myTrayId && !game.trays[id]!.spectating,
  )
  const theirTray = tradeTarget ? game.trays[tradeTarget] : null

  const toggle = (list: number[], i: number, set: (n: number[]) => void) => {
    set(list.includes(i) ? list.filter((x) => x !== i) : [...list, i])
  }

  if (myTray?.spectating) {
    return <p className="nb-spectating-banner">Spectating — manage is closed.</p>
  }

  return (
    <div className="nb-manage">
      <h2 className="section-heading">Your deeds</h2>
      {!myTray || mine.length === 0 ? <p className="muted">No deeds yet.</p> : null}
      <ul className="player-list">
        {mine.map((i) => {
          const d = game.deeds[i]!
          const s = spaceAt(i)
          const cost = canBuildOn(game, myTrayId, i, room.rules)
            ? buildCost(game, i, room.rules)
            : 0
          const refund = canSellBuilding(game, myTrayId, i)
            ? sellBuildingRefund(game, i, room.rules)
            : 0
          return (
            <li key={i}>
              <div>
                {s.name}
                {d.mortgaged ? ' · mortgaged' : ''}
                {d.hotel ? ' · hotel' : d.houses > 0 ? ` · ${d.houses}h` : ''}
              </div>
              {canManage ? (
                <div className="chip-row">
                  {canBuildOn(game, myTrayId, i, room.rules) ? (
                    <button
                      type="button"
                      className="chip"
                      onClick={() => send({ type: 'nb-build', fromId: playerId, spaceIndex: i })}
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
                      onClick={() => send({ type: 'nb-mortgage', fromId: playerId, spaceIndex: i })}
                    >
                      Mortgage
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
            </li>
          )
        })}
      </ul>

      <h2 className="section-heading">Trade</h2>
      {!myTurn || game.prompt ? (
        <p className="muted">
          {game.prompt?.type === 'trade' && game.prompt.frozen
            ? 'Trade offer frozen — waiting for a reply. Reserved items cannot be spent.'
            : 'Trades open on your turn when nothing else is pending.'}
        </p>
      ) : (
        <>
          <label className="field">
            <span>With</span>
            <select value={tradeTarget} onChange={(e) => setTradeTarget(e.target.value)}>
              <option value="">Choose seat…</option>
              {others.map((id) => (
                <option key={id} value={id}>
                  {game.trays[id]!.memberIds.map((p) => room.players[p]?.name ?? '?').join(' & ')}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>You offer cash</span>
            <input
              type="number"
              min={0}
              value={offerCash}
              onChange={(e) => setOfferCash(Number(e.target.value) || 0)}
            />
          </label>
          <label className="field">
            <span>You ask cash</span>
            <input
              type="number"
              min={0}
              value={askCash}
              onChange={(e) => setAskCash(Number(e.target.value) || 0)}
            />
          </label>
          {(myTray?.jailFreeWild ?? 0) + (myTray?.jailFreeNeighbor ?? 0) > 0 ? (
            <div className="chip-row">
              {(myTray?.jailFreeWild ?? 0) > 0 ? (
                <button
                  type="button"
                  className={`chip ${offerJailFreeWild > 0 ? 'selected' : ''}`}
                  onClick={() => setOfferJailFreeWild(offerJailFreeWild > 0 ? 0 : 1)}
                >
                  Offer jail-free (Wild)
                </button>
              ) : null}
              {(myTray?.jailFreeNeighbor ?? 0) > 0 ? (
                <button
                  type="button"
                  className={`chip ${offerJailFreeNeighbor > 0 ? 'selected' : ''}`}
                  onClick={() => setOfferJailFreeNeighbor(offerJailFreeNeighbor > 0 ? 0 : 1)}
                >
                  Offer jail-free (Notes)
                </button>
              ) : null}
            </div>
          ) : null}
          {theirTray &&
          (theirTray.jailFreeWild > 0 || theirTray.jailFreeNeighbor > 0) ? (
            <div className="chip-row">
              {theirTray.jailFreeWild > 0 ? (
                <button
                  type="button"
                  className={`chip ${askJailFreeWild > 0 ? 'selected' : ''}`}
                  onClick={() => setAskJailFreeWild(askJailFreeWild > 0 ? 0 : 1)}
                >
                  Ask jail-free (Wild)
                </button>
              ) : null}
              {theirTray.jailFreeNeighbor > 0 ? (
                <button
                  type="button"
                  className={`chip ${askJailFreeNeighbor > 0 ? 'selected' : ''}`}
                  onClick={() => setAskJailFreeNeighbor(askJailFreeNeighbor > 0 ? 0 : 1)}
                >
                  Ask jail-free (Notes)
                </button>
              ) : null}
            </div>
          ) : null}
          <p className="muted">Your bare deeds to offer</p>
          <div className="chip-row">
            {bareDeedIndexes(game, myTrayId).map((i) => (
              <button
                key={i}
                type="button"
                className={`chip ${offerDeeds.includes(i) ? 'selected' : ''}`}
                onClick={() => toggle(offerDeeds, i, setOfferDeeds)}
              >
                {spaceAt(i).name}
              </button>
            ))}
          </div>
          {tradeTarget ? (
            <>
              <p className="muted">Their bare deeds you want</p>
              <div className="chip-row">
                {bareDeedIndexes(game, tradeTarget).map((i) => (
                  <button
                    key={i}
                    type="button"
                    className={`chip ${askDeeds.includes(i) ? 'selected' : ''}`}
                    onClick={() => toggle(askDeeds, i, setAskDeeds)}
                  >
                    {spaceAt(i).name}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <button
            type="button"
            className="btn primary"
            disabled={!tradeTarget}
            onClick={() => {
              send({ type: 'nb-trade-open', fromId: playerId, toTrayId: tradeTarget })
              send({
                type: 'nb-trade-draft',
                fromId: playerId,
                offerCash,
                offerDeeds,
                offerJailFreeWild,
                offerJailFreeNeighbor,
                askCash,
                askDeeds,
                askJailFreeWild,
                askJailFreeNeighbor,
              })
              send({ type: 'nb-trade-send', fromId: playerId })
            }}
          >
            Send trade
          </button>
        </>
      )}

      <p className="muted" style={{ marginTop: '1rem' }}>
        Board has {BOARD.filter(isDeedSpace).length} deeds · bank buildings follow supply rules.
      </p>
    </div>
  )
}
