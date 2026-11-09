import { useEffect, useRef, useState } from 'react'
import { playNeighborhoodCue } from '../audio/neighborhood'
import { spaceAt } from '../core/neighborhood/board'
import {
  breakIntoBills,
  type NbCinematic,
} from '../core/neighborhood/cinematics'
import { trayIdForPlayer } from '../core/neighborhood/engine'
import type { NeighborhoodGame } from '../core/neighborhood/gameTypes'
import { formatCash } from '../core/neighborhood/money'
import type { NeighborhoodRoom } from '../rooms/types'

const DUR: Record<NbCinematic['kind'], number> = {
  dice: 900,
  step: 280,
  pay: 1100,
  'pay-each': 1400,
  collect: 1200,
  'collect-each': 1400,
  buy: 1000,
  card: 1400,
  jail: 1000,
  trade: 1300,
  toast: 900,
}

function trayMembers(game: NeighborhoodGame, trayId: string): string[] {
  return game.trays[trayId]?.memberIds ?? []
}

function perspectiveToast(
  cine: NbCinematic,
  myTrayId: string,
  nameOf: (trayId: string) => string,
): { text: string; mood: 'paid' | 'collected' | 'info' } | null {
  if (cine.kind === 'toast') return { text: cine.text, mood: cine.mood }
  if (cine.kind === 'pay') {
    const amt = formatCash(cine.amount)
    if (cine.fromTrayId === myTrayId) {
      const to =
        cine.toTrayId === 'jackpot'
          ? 'the jackpot'
          : cine.toTrayId === 'bank'
            ? 'the bank'
            : nameOf(cine.toTrayId)
      return { text: `You paid ${to} ${amt}.`, mood: 'paid' }
    }
    if (cine.toTrayId === myTrayId) {
      return { text: `${nameOf(cine.fromTrayId)} paid you ${amt}.`, mood: 'collected' }
    }
    const to =
      cine.toTrayId === 'bank' || cine.toTrayId === 'jackpot'
        ? cine.toTrayId
        : nameOf(cine.toTrayId)
    return {
      text: `${nameOf(cine.fromTrayId)} paid ${to} ${amt}.`,
      mood: 'info',
    }
  }
  if (cine.kind === 'pay-each') {
    const amt = formatCash(cine.amountEach)
    if (cine.fromTrayId === myTrayId) {
      return {
        text: `You paid ${amt} to each of ${cine.toTrayIds.length}.`,
        mood: 'paid',
      }
    }
    if (cine.toTrayIds.includes(myTrayId)) {
      return {
        text: `${nameOf(cine.fromTrayId)} paid you ${amt}.`,
        mood: 'collected',
      }
    }
    return {
      text: `${nameOf(cine.fromTrayId)} treated the table (${amt} each).`,
      mood: 'info',
    }
  }
  if (cine.kind === 'collect' && cine.trayId === myTrayId) {
    return {
      text: `You collected ${formatCash(cine.amount)}${cine.reason ? ` · ${cine.reason}` : ''}.`,
      mood: 'collected',
    }
  }
  if (cine.kind === 'collect-each') {
    const amt = formatCash(cine.amountEach)
    if (cine.trayId === myTrayId) {
      return {
        text: `You collected ${amt} from each of ${cine.fromTrayIds.length}.`,
        mood: 'collected',
      }
    }
    if (cine.fromTrayIds.includes(myTrayId)) {
      return {
        text: `You paid ${nameOf(cine.trayId)} ${amt}.`,
        mood: 'paid',
      }
    }
    return {
      text: `${nameOf(cine.trayId)} collected from the table.`,
      mood: 'info',
    }
  }
  return null
}

/**
 * One animation queue per client. Skips movies already seen (refresh / late join).
 * Pauses starting the next clip while a blocking prompt is open.
 */
export function NeighborhoodCinema(props: {
  room: NeighborhoodRoom
  playerId: string
  pauseQueue: boolean
  onActiveChange?: (cine: NbCinematic | null) => void
  /** True while dice/step movies are active or still queued. */
  onMovementPending?: (pending: boolean) => void
}) {
  const { room, playerId, pauseQueue, onActiveChange, onMovementPending } = props
  const game = room.game
  const seenRef = useRef(0)
  const bootstrapped = useRef(false)
  const [active, setActive] = useState<NbCinematic | null>(null)
  const [queue, setQueue] = useState<NbCinematic[]>([])

  const myTrayId = trayIdForPlayer(room.rules, playerId, room.teamOf)

  useEffect(() => {
    if (!game || bootstrapped.current) return
    const maxId = Math.max(
      game.lastEventId,
      ...(game.cinematics ?? []).map((c) => c.id),
      0,
    )
    seenRef.current = maxId
    bootstrapped.current = true
  }, [game])

  useEffect(() => {
    if (!game?.cinematics?.length || !bootstrapped.current) return
    const fresh = [...game.cinematics]
      .filter((c) => c.id > seenRef.current)
      .sort((a, b) => a.id - b.id)
    if (fresh.length === 0) return
    seenRef.current = Math.max(seenRef.current, fresh[fresh.length - 1]!.id)
    setQueue((q) => [...q, ...fresh])
  }, [game?.lastEventId, game?.cinematics])

  useEffect(() => {
    if (active || queue.length === 0) return
    const next = queue[0]!
    // Always play dice/step so tokens finish moving before buy/trade prompts.
    const movement = next.kind === 'dice' || next.kind === 'step'
    if (pauseQueue && !movement) return
    setActive(next)
    setQueue((q) => q.slice(1))
  }, [queue, active, pauseQueue])

  useEffect(() => {
    onActiveChange?.(active)
  }, [active, onActiveChange])

  const movementPending =
    active?.kind === 'dice' ||
    active?.kind === 'step' ||
    queue.some((c) => c.kind === 'dice' || c.kind === 'step')

  useEffect(() => {
    onMovementPending?.(movementPending)
  }, [movementPending, onMovementPending])

  useEffect(() => {
    if (!active) return
    void playNeighborhoodCue(active.kind)
    const ms = DUR[active.kind] ?? 900
    const t = window.setTimeout(() => setActive(null), ms)
    return () => clearTimeout(t)
  }, [active])

  if (!game || !active) return null

  const nameOf = (trayId: string) =>
    trayMembers(game, trayId)
      .map((id) => room.players[id]?.name ?? '?')
      .join(' & ')

  const toast = perspectiveToast(active, myTrayId, nameOf)
  const bills =
    active.kind === 'pay' || active.kind === 'collect'
      ? breakIntoBills(active.amount)
      : active.kind === 'pay-each' || active.kind === 'collect-each'
        ? breakIntoBills(active.amountEach)
        : []

  const payMine = active.kind === 'pay' && active.fromTrayId === myTrayId
  const payEachMine = active.kind === 'pay-each' && active.fromTrayId === myTrayId
  const collectMine = active.kind === 'collect' && active.trayId === myTrayId
  const collectEachMine = active.kind === 'collect-each' && active.trayId === myTrayId
  const bystanderPay =
    (active.kind === 'pay' &&
      active.fromTrayId !== myTrayId &&
      active.toTrayId !== myTrayId) ||
    (active.kind === 'pay-each' &&
      active.fromTrayId !== myTrayId &&
      !active.toTrayIds.includes(myTrayId))

  const streamCount =
    active.kind === 'pay-each'
      ? active.toTrayIds.length
      : active.kind === 'collect-each'
        ? active.fromTrayIds.length
        : 1

  return (
    <div className="nb-cinema" aria-live="polite">
      {active.kind === 'dice' ? (
        <div className="nb-cinema-dice">
          <span className="nb-die tumble">{active.faces[0]}</span>
          <span className="nb-die tumble delay">{active.faces[1]}</span>
        </div>
      ) : null}

      {active.kind === 'step' ? (
        <div className="nb-cinema-step">
          {spaceAt(active.to).name}
        </div>
      ) : null}

      {active.kind === 'card' ? (
        <div className="nb-cinema-card">
          <p className="eyebrow">{active.deck === 'wild' ? 'Wild Card' : 'Neighbor Notes'}</p>
          <p>{active.text}</p>
        </div>
      ) : null}

      {active.kind === 'buy' ? (
        <div className="nb-cinema-buy">Deed · {spaceAt(active.spaceIndex).name}</div>
      ) : null}

      {active.kind === 'jail' ? <div className="nb-cinema-jail">Sent to Jail</div> : null}

      {active.kind === 'trade' ? (
        <div className="nb-cinema-trade">
          <span className="fly-left">{nameOf(active.fromTrayId)}</span>
          <span className="fly-right">{nameOf(active.toTrayId)}</span>
        </div>
      ) : null}

      {bills.length > 0 ? (
        <div
          className={`nb-bills ${payMine || payEachMine ? 'leave' : ''} ${collectMine || collectEachMine ? 'arrive' : ''} ${bystanderPay ? 'bystander' : ''} ${payEachMine || collectEachMine ? 'split' : ''}`}
        >
          {Array.from({ length: Math.min(streamCount, 4) }, (_, stream) =>
            bills.map((d, i) => (
              <span
                key={`${active.id}-${stream}-${i}`}
                className="nb-bill"
                style={{
                  animationDelay: `${stream * 0.08 + i * 0.04}s`,
                  ['--nb-stream' as string]: String(stream - (streamCount - 1) / 2),
                }}
              >
                {formatCash(d)}
              </span>
            )),
          )}
        </div>
      ) : null}

      {toast ? (
        <div className={`nb-toast ${toast.mood}`}>
          <span className="nb-toast-sign">
            {toast.mood === 'paid' ? '−' : toast.mood === 'collected' ? '+' : '·'}
          </span>
          <span>{toast.text}</span>
        </div>
      ) : null}
    </div>
  )
}

export function shouldPauseCinema(game: NeighborhoodGame | null): boolean {
  if (!game?.prompt) return false
  return (
    game.prompt.type === 'buy' ||
    game.prompt.type === 'tax' ||
    game.prompt.type === 'jail' ||
    game.prompt.type === 'card' ||
    game.prompt.type === 'auction' ||
    game.prompt.type === 'debt' ||
    game.prompt.type === 'trade'
  )
}
