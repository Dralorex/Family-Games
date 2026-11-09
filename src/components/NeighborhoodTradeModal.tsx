import { useEffect, useState } from 'react'
import { spaceAt } from '../core/neighborhood/board'
import { bareDeedIndexes } from '../core/neighborhood/economy'
import { canTapTray, trayIdForPlayer } from '../core/neighborhood/engine'
import { formatCash } from '../core/neighborhood/money'
import type { NeighborhoodRoom } from '../rooms/types'
import type { useRoom } from '../hooks/useRoom'

function trayLabel(room: NeighborhoodRoom, trayId: string): string {
  const t = room.game?.trays[trayId]
  if (!t) return trayId
  return t.memberIds.map((id) => room.players[id]?.name ?? '?').join(' & ')
}

/** Compose a new trade, or review / respond to a frozen offer. */
export function NeighborhoodTradeModal(props: {
  room: NeighborhoodRoom
  playerId: string
  send: ReturnType<typeof useRoom>['send']
  /** 'compose' opens a draft UI; 'prompt' shows the live trade prompt */
  mode: 'compose' | 'prompt'
  onClose: () => void
}) {
  const { room, playerId, send, mode, onClose } = props
  const game = room.game
  const myTrayId = trayIdForPlayer(room.rules, playerId, room.teamOf)
  const myTray = game?.trays[myTrayId]
  const prompt = game?.prompt?.type === 'trade' ? game.prompt : null

  const [tradeTarget, setTradeTarget] = useState('')
  const [offerCash, setOfferCash] = useState(0)
  const [askCash, setAskCash] = useState(0)
  const [offerDeeds, setOfferDeeds] = useState<number[]>([])
  const [askDeeds, setAskDeeds] = useState<number[]>([])
  const [offerJailFreeWild, setOfferJailFreeWild] = useState(0)
  const [offerJailFreeNeighbor, setOfferJailFreeNeighbor] = useState(0)
  const [askJailFreeWild, setAskJailFreeWild] = useState(0)
  const [askJailFreeNeighbor, setAskJailFreeNeighbor] = useState(0)

  useEffect(() => {
    if (!prompt) return
    if (mode === 'prompt' || (mode === 'compose' && !prompt.frozen && prompt.fromTrayId === myTrayId)) {
      setTradeTarget(prompt.toTrayId)
      setOfferCash(prompt.offerCash)
      setAskCash(prompt.askCash)
      setOfferDeeds([...prompt.offerDeeds])
      setAskDeeds([...prompt.askDeeds])
      setOfferJailFreeWild(prompt.offerJailFreeWild)
      setOfferJailFreeNeighbor(prompt.offerJailFreeNeighbor)
      setAskJailFreeWild(prompt.askJailFreeWild)
      setAskJailFreeNeighbor(prompt.askJailFreeNeighbor)
    }
  }, [mode, prompt, myTrayId])

  if (!game || !myTray) return null

  const others = Object.keys(game.trays).filter(
    (id) => id !== myTrayId && !game.trays[id]!.spectating,
  )
  const theirTray = tradeTarget ? game.trays[tradeTarget] : null

  const toggle = (list: number[], i: number, set: (n: number[]) => void) => {
    set(list.includes(i) ? list.filter((x) => x !== i) : [...list, i])
  }

  const awaitingMe =
    Boolean(prompt?.frozen) &&
    Boolean(prompt?.awaitingTrayId) &&
    canTapTray(game, playerId, prompt!.awaitingTrayId!)

  const iAmSender = prompt?.fromTrayId === myTrayId
  const drafting = mode === 'compose' || (prompt && !prompt.frozen && iAmSender)

  const summary = prompt ? (
    <div className="nb-trade-summary">
      <p>
        {trayLabel(room, prompt.fromTrayId)} → {trayLabel(room, prompt.toTrayId)}
        {prompt.frozen ? ' · waiting reply' : ' · drafting'}
      </p>
      <p className="muted">
        Offer {formatCash(prompt.offerCash)}
        {prompt.offerDeeds.length
          ? ` + ${prompt.offerDeeds.map((i) => spaceAt(i).name).join(', ')}`
          : ''}
        {prompt.offerJailFreeWild + prompt.offerJailFreeNeighbor > 0
          ? ` + jail-free×${prompt.offerJailFreeWild + prompt.offerJailFreeNeighbor}`
          : ''}
      </p>
      <p className="muted">
        Ask {formatCash(prompt.askCash)}
        {prompt.askDeeds.length
          ? ` + ${prompt.askDeeds.map((i) => spaceAt(i).name).join(', ')}`
          : ''}
        {prompt.askJailFreeWild + prompt.askJailFreeNeighbor > 0
          ? ` + jail-free×${prompt.askJailFreeWild + prompt.askJailFreeNeighbor}`
          : ''}
      </p>
    </div>
  ) : null

  return (
    <div
      className="modal-backdrop nb-trade-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Trade"
    >
      <div className="bubble modal-card nb-trade-card">
        <h2>{mode === 'compose' ? 'Propose trade' : 'Trade offer'}</h2>

        {mode === 'prompt' && summary}

        {drafting && mode === 'compose' ? (
          <>
            <label className="field">
              <span>With</span>
              <select value={tradeTarget} onChange={(e) => setTradeTarget(e.target.value)}>
                <option value="">Choose seat…</option>
                {others.map((id) => (
                  <option key={id} value={id}>
                    {trayLabel(room, id)}
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
            {(myTray.jailFreeWild ?? 0) + (myTray.jailFreeNeighbor ?? 0) > 0 ? (
              <div className="chip-row">
                {myTray.jailFreeWild > 0 ? (
                  <button
                    type="button"
                    className={`chip ${offerJailFreeWild > 0 ? 'selected' : ''}`}
                    onClick={() => setOfferJailFreeWild(offerJailFreeWild > 0 ? 0 : 1)}
                  >
                    Offer jail-free (Wild)
                  </button>
                ) : null}
                {myTray.jailFreeNeighbor > 0 ? (
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
            {theirTray && (theirTray.jailFreeWild > 0 || theirTray.jailFreeNeighbor > 0) ? (
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
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={!tradeTarget}
                onClick={() => {
                  const continuing =
                    prompt && !prompt.frozen && prompt.fromTrayId === myTrayId
                  if (!continuing) {
                    send({ type: 'nb-trade-open', fromId: playerId, toTrayId: tradeTarget })
                  }
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
                  onClose()
                }}
              >
                Send trade
              </button>
            </div>
          </>
        ) : null}

        {mode === 'prompt' && awaitingMe ? (
          <div className="modal-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => send({ type: 'nb-trade-accept', fromId: playerId })}
            >
              Accept
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => send({ type: 'nb-trade-counter', fromId: playerId })}
            >
              Counter
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => send({ type: 'nb-trade-decline', fromId: playerId })}
            >
              Decline
            </button>
          </div>
        ) : null}

        {mode === 'prompt' && !awaitingMe ? (
          <>
            <p className="muted">Waiting on the other seat…</p>
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={onClose}>
                Hide
              </button>
            </div>
          </>
        ) : null}

        {mode === 'compose' && !drafting ? null : null}
      </div>
    </div>
  )
}
