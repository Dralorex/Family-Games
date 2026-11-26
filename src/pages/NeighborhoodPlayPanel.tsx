import { useCallback, useState } from 'react'
import { NeighborhoodSpaceModal } from '../components/NeighborhoodSpaceModal'
import { spaceAt } from '../core/neighborhood/board'
import type { NbCinematic } from '../core/neighborhood/cinematics'
import { bareDeedIndexes, deedCreditValue } from '../core/neighborhood/economy'
import {
  canTapTray,
  currentTrayId,
  trayIdForPlayer,
} from '../core/neighborhood/engine'
import { formatCash } from '../core/neighborhood/money'
import { PIECE_LABELS } from '../core/neighborhood/types'
import type { NeighborhoodRoom } from '../rooms/types'
import { NeighborhoodPieceIcon } from './NeighborhoodPieceIcon'
import type { useRoom } from '../hooks/useRoom'
import { unlockAudio } from '../audio/neighborhood'
import { NeighborhoodBoard } from './NeighborhoodBoard'
import { NeighborhoodCinema, shouldPauseCinema } from './NeighborhoodCinema'

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
  const [debtDeeds, setDebtDeeds] = useState<number[]>([])
  const [debtCash, setDebtCash] = useState(0)
  const [stepVisual, setStepVisual] = useState<{ trayId: string; to: number } | null>(null)
  const [movementPending, setMovementPending] = useState(false)
  const [inspectIndex, setInspectIndex] = useState<number | null>(null)

  const onCinemaActive = useCallback((cine: NbCinematic | null) => {
    if (cine?.kind === 'step') setStepVisual({ trayId: cine.trayId, to: cine.to })
    else setStepVisual(null)
  }, [])

  const onMovementPending = useCallback((pending: boolean) => {
    setMovementPending(pending)
  }, [])

  if (!game) {
    return <p className="muted">Waiting for board…</p>
  }

  const myTrayId = trayIdForPlayer(room.rules, playerId, room.teamOf)
  const myTray = game.trays[myTrayId]
  const turnId = currentTrayId(game)
  const myTurn = Boolean(turnId && canTapTray(game, playerId, turnId))
  const prompt = game.prompt
  const promptsReady = !movementPending

  const opening = game.phase === 'opening'
  const needsOpening = opening && game.openingNeeds.includes(myTrayId)

  const showBuyModal =
    promptsReady && prompt?.type === 'buy' && myTurn && !myTray?.spectating

  return (
    <div className="nb-play">
      <NeighborhoodCinema
        room={room}
        playerId={playerId}
        pauseQueue={shouldPauseCinema(game)}
        onActiveChange={onCinemaActive}
        onMovementPending={onMovementPending}
      />
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
              onClick={() => {
                void unlockAudio()
                send({ type: 'nb-opening-roll', fromId: playerId })
              }}
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
          {myTray?.spectating ? (
            <p className="nb-spectating-banner" role="status">
              Spectating — you can watch the board and money, but cannot roll, trade, build, or bid.
            </p>
          ) : null}
          <p className="muted">
            Turn: {turnId ? trayLabel(room, turnId) : '—'}
            {turnId === myTrayId ? ' (you)' : ''}
          </p>

          <NeighborhoodBoard
            game={game}
            jackpotEnabled={room.rules.jackpot}
            stepVisual={stepVisual}
            onSpaceClick={(i) => setInspectIndex(i)}
          />

          {inspectIndex != null && !showBuyModal ? (
            <NeighborhoodSpaceModal
              room={room}
              playerId={playerId}
              spaceIndex={inspectIndex}
              onClose={() => setInspectIndex(null)}
            />
          ) : null}

          {showBuyModal && prompt?.type === 'buy' ? (
            <NeighborhoodSpaceModal
              room={room}
              playerId={playerId}
              spaceIndex={prompt.spaceIndex}
              buyPrice={prompt.price}
              send={send}
              onClose={() => undefined}
            />
          ) : null}

          <div className="nb-actions">
            {myTray?.spectating ? (
              <p className="muted">Watching as a spectator.</p>
            ) : null}

            {promptsReady && prompt?.type === 'buy' && !myTurn ? (
              <p className="muted">
                Waiting — buy offer on {spaceAt(prompt.spaceIndex).name}…
              </p>
            ) : null}

            {promptsReady && prompt?.type === 'tax' && myTurn ? (
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

            {promptsReady && prompt?.type === 'card' && myTurn ? (
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

            {promptsReady && prompt?.type === 'jail' && myTurn ? (
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

            {promptsReady && prompt?.type === 'auction' ? (
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
                      disabled={
                        (game.trays[prompt.turnTrayId]?.cash ?? 0) <
                        (prompt.highTrayId ? prompt.price + prompt.step : prompt.step)
                      }
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

            {promptsReady && prompt?.type === 'debt' && myTurn ? (
              <>
                {prompt.toTrayId === 'bank' || prompt.toTrayId === 'jackpot' ? (
                  <>
                    <p className="warn-banner">
                      Owe {formatCash(prompt.amount)} to the{' '}
                      {prompt.toTrayId === 'jackpot' ? 'jackpot' : 'bank'} — {prompt.reason}. Cash
                      only (sell/mortgage in Deeds to raise cash). Deeds do not cover this debt.
                    </p>
                    <p className="muted">
                      Cash on hand: {formatCash(myTray?.cash ?? 0)} / {formatCash(prompt.amount)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="warn-banner">
                      Owe {formatCash(prompt.amount)} — {prompt.reason}. Sell/mortgage in Deeds,
                      then select cover here.
                    </p>
                    <div className="chip-row">
                      {bareDeedIndexes(game, myTrayId).map((i) => {
                        const selected = debtDeeds.includes(i)
                        return (
                          <button
                            key={i}
                            type="button"
                            className={`chip ${selected ? 'selected' : ''}`}
                            onClick={() => {
                              const next = selected
                                ? debtDeeds.filter((x) => x !== i)
                                : [...debtDeeds, i]
                              setDebtDeeds(next)
                              send({
                                type: 'nb-debt-select',
                                fromId: playerId,
                                selectedDeeds: next,
                                cashOffer: debtCash,
                              })
                            }}
                          >
                            {spaceAt(i).name} ({formatCash(deedCreditValue(game.deeds[i]!, i))})
                          </button>
                        )
                      })}
                    </div>
                    <label className="field">
                      <span>Cash to add</span>
                      <input
                        type="number"
                        min={0}
                        value={debtCash}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 0
                          setDebtCash(v)
                          send({
                            type: 'nb-debt-select',
                            fromId: playerId,
                            selectedDeeds: debtDeeds,
                            cashOffer: v,
                          })
                        }}
                      />
                    </label>
                    <p className="muted">
                      Cover selected:{' '}
                      {formatCash(
                        debtDeeds.reduce((s, i) => s + deedCreditValue(game.deeds[i]!, i), 0) +
                          debtCash,
                      )}{' '}
                      / {formatCash(prompt.amount)}
                    </p>
                  </>
                )}
                <div className="chip-row">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => send({ type: 'nb-debt-pay', fromId: playerId })}
                  >
                    Pay debt
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => send({ type: 'nb-debt-bankrupt', fromId: playerId })}
                  >
                    Go out
                  </button>
                </div>
              </>
            ) : null}

            {movementPending && prompt ? (
              <p className="muted">Moving…</p>
            ) : null}

            {promptsReady && !prompt && myTurn && myTray?.inJail ? (
              <div className="chip-row">
                {myTray.jailFreeWild + myTray.jailFreeNeighbor > 0 ? (
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

            {promptsReady && !prompt && myTurn && !myTray?.inJail ? (
              <button
                type="button"
                className="btn primary large"
                onClick={() => {
                  void unlockAudio()
                  send({ type: 'nb-roll', fromId: playerId })
                }}
              >
                Roll dice
              </button>
            ) : null}

            {promptsReady && !prompt && !myTurn && game.phase === 'playing' ? (
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
        {myTray?.spectating ? <p className="nb-spectating-label">Spectating</p> : null}
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
        <li key={t.id} className="nb-score-row">
          <NeighborhoodPieceIcon pieceId={t.pieceId} size={18} title={PIECE_LABELS[t.pieceId]} />
          <span>
            {t.memberIds.map((id) => props.room.players[id]?.name ?? '?').join(' & ')}
            {' · '}
            {formatCash(t.cash)}
            {t.inJail ? ' · jail' : ''}
            {t.spectating ? ' · Spectating' : ''}
            {' · '}
            {spaceAt(t.position).name}
          </span>
        </li>
      ))}
      {props.room.rules.jackpot ? <li>Jackpot · {formatCash(game.jackpot)}</li> : null}
    </ul>
  )
}
