import { BOARD, spaceAt } from '../core/neighborhood/board'
import {
  canTapTray,
  currentTrayId,
  trayIdForPlayer,
} from '../core/neighborhood/engine'
import { formatCash } from '../core/neighborhood/money'
import { PIECE_LABELS } from '../core/neighborhood/types'
import type { NeighborhoodRoom } from '../rooms/types'
import type { useRoom } from '../hooks/useRoom'

function trayLabel(room: NeighborhoodRoom, trayId: string): string {
  const t = room.game?.trays[trayId]
  if (!t) return trayId
  return t.memberIds.map((id) => room.players[id]?.name ?? '?').join(' & ')
}

export function NeighborhoodPlayPanel(props: {
  room: NeighborhoodRoom
  playerId: string
  send: ReturnType<typeof useRoom>['send']
}) {
  const { room, playerId, send } = props
  const game = room.game
  if (!game) {
    return <p className="muted">Waiting for board…</p>
  }

  const myTrayId = trayIdForPlayer(room.rules, playerId, room.teamOf)
  const myTray = game.trays[myTrayId]
  const turnId = currentTrayId(game)
  const myTurn = Boolean(turnId && canTapTray(game, playerId, turnId))
  const prompt = game.prompt

  const opening = game.phase === 'opening'
  const needsOpening = opening && game.openingNeeds.includes(myTrayId)

  return (
    <div className="nb-play">
      {game.lastDice ? (
        <p className="nb-dice" aria-live="polite">
          Dice <strong>{game.lastDice[0]}</strong> · <strong>{game.lastDice[1]}</strong>
          {game.lastDice[0] === game.lastDice[1] ? ' · doubles' : ''}
        </p>
      ) : null}

      {opening ? (
        <div className="nb-prompt">
          <h2>Opening rolls</h2>
          <p className="muted">Highest total goes first. Ties reroll.</p>
          <ul className="player-list">
            {Object.keys(game.trays).map((tid) => (
              <li key={tid}>
                {trayLabel(room, tid)}
                {game.openingRolls[tid] != null ? ` · ${game.openingRolls[tid]}` : ' · waiting'}
              </li>
            ))}
          </ul>
          {needsOpening ? (
            <button
              type="button"
              className="btn primary large"
              onClick={() => send({ type: 'nb-opening-roll', fromId: playerId })}
            >
              Roll for first
            </button>
          ) : (
            <p className="muted">Waiting for other seats…</p>
          )}
        </div>
      ) : null}

      {game.phase === 'playing' ? (
        <>
          <p className="muted">
            Turn: {turnId ? trayLabel(room, turnId) : '—'}
            {turnId === myTrayId ? ' (you)' : ''}
          </p>

          <div className="nb-board" role="list">
            {BOARD.map((space) => {
              const here = Object.values(game.trays).filter(
                (t) => !t.spectating && t.position === space.index,
              )
              const deed = game.deeds[space.index]
              const owner = deed?.ownerTrayId
              return (
                <div
                  key={space.index}
                  className={`nb-space ${here.length ? 'occupied' : ''}`}
                  role="listitem"
                >
                  <span className="nb-space-idx">{space.index}</span>
                  <span className="nb-space-name">{space.name}</span>
                  {owner ? (
                    <span className="nb-space-owner">
                      {PIECE_LABELS[game.trays[owner]!.pieceId]}
                      {deed?.mortgaged ? ' · mort' : ''}
                      {deed?.hotel ? ' · hotel' : deed && deed.houses > 0 ? ` · h${deed.houses}` : ''}
                    </span>
                  ) : null}
                  {here.length > 0 ? (
                    <span className="nb-tokens">
                      {here.map((t) => PIECE_LABELS[t.pieceId]).join(' · ')}
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>

          <div className="nb-actions">
            {prompt?.type === 'buy' && myTurn ? (
              <>
                <p>
                  Buy {spaceAt(prompt.spaceIndex).name} for {formatCash(prompt.price)}?
                </p>
                <div className="chip-row">
                  <button type="button" className="btn primary" onClick={() => send({ type: 'nb-buy', fromId: playerId })}>
                    Buy
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => send({ type: 'nb-decline-buy', fromId: playerId })}
                  >
                    {room.rules.noAuctions ? 'Decline' : 'Decline / Auction'}
                  </button>
                </div>
              </>
            ) : null}

            {prompt?.type === 'tax' && myTurn ? (
              <>
                <p>Town Tax — choose:</p>
                <div className="chip-row">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => send({ type: 'nb-tax', fromId: playerId, choice: 'flat' })}
                  >
                    Pay {formatCash(prompt.flat)}
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => send({ type: 'nb-tax', fromId: playerId, choice: 'percent' })}
                  >
                    Pay 10% ({formatCash(prompt.percentAmount)})
                  </button>
                </div>
              </>
            ) : null}

            {prompt?.type === 'card' && myTurn ? (
              <>
                <p className="nb-card">{prompt.text}</p>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => send({ type: 'nb-ack-card', fromId: playerId })}
                >
                  Continue
                </button>
              </>
            ) : null}

            {prompt?.type === 'jail' && myTurn ? (
              <>
                <p>You are in Jail.</p>
                <div className="chip-row">
                  {prompt.canUseCard ? (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => send({ type: 'nb-jail', fromId: playerId, choice: 'card' })}
                    >
                      Use note
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => send({ type: 'nb-jail', fromId: playerId, choice: 'pay' })}
                  >
                    Pay {formatCash(50_000)}
                  </button>
                  {!prompt.mustPay ? (
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => send({ type: 'nb-jail', fromId: playerId, choice: 'roll' })}
                    >
                      Try doubles
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}

            {prompt?.type === 'auction' ? (
              <>
                <p>
                  Auction: {spaceAt(prompt.spaceIndex).name} · {formatCash(prompt.price)}
                  {prompt.highTrayId ? ` · high ${trayLabel(room, prompt.highTrayId)}` : ' · no bid'}
                </p>
                {canTapTray(game, playerId, prompt.turnTrayId) ? (
                  <div className="chip-row">
                    <button
                      type="button"
                      className="btn primary"
                      disabled={(game.trays[prompt.turnTrayId]?.cash ?? 0) < (prompt.highTrayId ? prompt.price + prompt.step : prompt.step)}
                      onClick={() => send({ type: 'nb-auction-raise', fromId: playerId })}
                    >
                      Raise {formatCash(prompt.step)}
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => send({ type: 'nb-auction-pass', fromId: playerId })}
                    >
                      Pass
                    </button>
                  </div>
                ) : (
                  <p className="muted">Waiting for {trayLabel(room, prompt.turnTrayId)}…</p>
                )}
              </>
            ) : null}

            {prompt?.type === 'debt' && myTurn ? (
              <>
                <p className="warn-banner">
                  Short {formatCash(prompt.amount)} for {prompt.reason}. Mortgage/sell arrives next
                  slice — for now you can only go out.
                </p>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => send({ type: 'nb-debt-bankrupt', fromId: playerId })}
                >
                  Go out
                </button>
              </>
            ) : null}

            {!prompt && myTurn && myTray?.inJail ? (
              <div className="chip-row">
                {(myTray.jailFreeWild + myTray.jailFreeNeighbor > 0) ? (
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => send({ type: 'nb-jail', fromId: playerId, choice: 'card' })}
                  >
                    Use note
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => send({ type: 'nb-jail', fromId: playerId, choice: 'pay' })}
                >
                  Pay {formatCash(50_000)}
                </button>
                {myTray.jailTurns < 2 ? (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => send({ type: 'nb-jail', fromId: playerId, choice: 'roll' })}
                  >
                    Try doubles
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => send({ type: 'nb-jail', fromId: playerId, choice: 'pay' })}
                  >
                    Must pay {formatCash(50_000)}
                  </button>
                )}
              </div>
            ) : null}

            {!prompt && myTurn && !myTray?.inJail ? (
              <button
                type="button"
                className="btn primary large"
                onClick={() => send({ type: 'nb-roll', fromId: playerId })}
              >
                Roll dice
              </button>
            ) : null}

            {!prompt && !myTurn && game.phase === 'playing' ? (
              <p className="muted">Waiting for {turnId ? trayLabel(room, turnId) : 'turn'}…</p>
            ) : null}
          </div>
        </>
      ) : null}

      {game.phase === 'finished' ? (
        <div>
          <h2>Game over</h2>
          <p>
            Winner
            {game.winnerTrayIds.length > 1 ? 's' : ''}:{' '}
            {game.winnerTrayIds.map((id) => trayLabel(room, id)).join(', ') || '—'}
          </p>
        </div>
      ) : null}

      <div className="nb-wallet" aria-label="Your wallet">
        <p className="muted">Your wallet</p>
        <p className="nb-wallet-amount">{myTray ? formatCash(myTray.cash) : '—'}</p>
        {myTray?.inJail ? <p className="muted">In Jail</p> : null}
        {(myTray?.jailFreeWild ?? 0) + (myTray?.jailFreeNeighbor ?? 0) > 0 ? (
          <p className="muted">
            Jail-free ×{(myTray?.jailFreeWild ?? 0) + (myTray?.jailFreeNeighbor ?? 0)}
          </p>
        ) : null}
      </div>

      <ul className="nb-log" aria-live="polite">
        {game.log.slice(0, 8).map((line, i) => (
          <li key={`${game.lastEventId}-${i}`}>{line}</li>
        ))}
      </ul>
    </div>
  )
}

export function NeighborhoodScorePanel(props: { room: NeighborhoodRoom }) {
  const game = props.room.game
  if (!game) return <p className="muted">No board yet.</p>
  const trays = Object.values(game.trays).sort((a, b) => b.cash - a.cash)
  return (
    <ul className="player-list">
      {trays.map((t) => (
        <li key={t.id}>
          {t.memberIds.map((id) => props.room.players[id]?.name ?? '?').join(' & ')}
          {' · '}
          {PIECE_LABELS[t.pieceId]}
          {' · '}
          {formatCash(t.cash)}
          {t.inJail ? ' · jail' : ''}
          {t.spectating ? ' · out' : ''}
          {' · '}
          {spaceAt(t.position).name}
        </li>
      ))}
      {props.room.rules.jackpot ? <li>Jackpot · {formatCash(game.jackpot)}</li> : null}
    </ul>
  )
}
