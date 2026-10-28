import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { playAlarm, unlockAudio, isAudioUnlocked } from '../audio/alarm'
import { CodeDropdown } from '../components/CodeDropdown'
import { TabShell } from '../components/TabShell'
import { UsernameGate } from '../components/UsernameGate'
import { useRoom } from '../hooks/useRoom'
import { createPlayerId, createSessionId } from '../lib/codes'
import type { HotPotatoRoom, RoomState } from '../rooms/types'
import { ScorecardRoomView } from './ScorecardRoomView'

function loadSeed(code: string): RoomState | undefined {
  try {
    const raw = sessionStorage.getItem(`fg_seed_${code}`)
    if (!raw) return undefined
    return JSON.parse(raw) as RoomState
  } catch {
    return undefined
  }
}

export function RoomPage() {
  const { code = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const hostParam = params.get('host') === '1'
  const playerId = useMemo(() => createPlayerId(), [])
  const sessionId = useMemo(() => createSessionId(code), [code])
  const [name, setName] = useState<string | null>(() => sessionStorage.getItem(`fg_name_${code}`))
  const [tab, setTab] = useState<'main' | 'score'>('main')
  const [nameError, setNameError] = useState('')
  const [kicked, setKicked] = useState(false)

  // Host create flow, Continue-as-host, or same creator name reclaiming a live lobby
  const isCreator = hostParam
  const seed = useMemo(() => (isCreator ? loadSeed(code) : undefined), [code, isCreator])

  const { room, status, send } = useRoom({
    code,
    playerId,
    isCreator,
    claimName: name,
    initialState: seed,
    enabled: true,
  })

  const rosterNames = room ? Object.values(room.players).map((p) => p.name) : []

  // Join / take over seat as soon as a name is chosen
  useEffect(() => {
    if (!name || kicked) return

    const reclaimHost =
      hostParam ||
      (room
        ? room.creatorName.trim().toLowerCase() === name.trim().toLowerCase()
        : false)

    if (!room) {
      send({
        type: 'join',
        player: { id: playerId, name, joinedAt: Date.now(), sessionId },
        reclaimHost: hostParam,
      })
      return
    }

    const self = room.players[playerId]
    if (self) {
      // Same device — refresh session / clear left
      if (self.left || self.sessionId !== sessionId || (reclaimHost && room.hostId !== playerId)) {
        send({
          type: 'join',
          player: {
            id: playerId,
            name,
            joinedAt: self.joinedAt,
            sessionId,
          },
          reclaimHost,
        })
      }
      return
    }

    const existing = Object.values(room.players).find(
      (p) => p.name.trim().toLowerCase() === name.trim().toLowerCase(),
    )
    if (existing) {
      // Same name from this browser → take over (kicks the other browser)
      send({ type: 'rejoin', name, playerId, sessionId, reclaimHost })
      return
    }

    send({
      type: 'join',
      player: { id: playerId, name, joinedAt: Date.now(), sessionId },
      reclaimHost,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, playerId, sessionId, room?.code, room?.players, status, kicked, hostParam])

  // Detect kicked by another browser using the same name
  useEffect(() => {
    if (!name || !room || kicked) return
    const mine = room.players[playerId]
    if (mine) {
      if (mine.sessionId && mine.sessionId !== sessionId) {
        setKicked(true)
      }
      return
    }
    const sameName = Object.values(room.players).find(
      (p) => p.name.trim().toLowerCase() === name.trim().toLowerCase(),
    )
    // Seat moved to another playerId/session — this tab lost the claim
    if (sameName && sameName.sessionId && sameName.sessionId !== sessionId) {
      setKicked(true)
    }
  }, [room, playerId, sessionId, name, kicked])

  if (kicked) {
    return (
      <main className="page narrow">
        <div className="panel">
          <h1>Signed in elsewhere</h1>
          <p className="kick-banner">
            Someone joined this game as <strong>{name}</strong> from another browser. This session
            was disconnected.
          </p>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              sessionStorage.removeItem(`fg_name_${code}`)
              navigate('/')
            }}
          >
            Back home
          </button>
        </div>
      </main>
    )
  }

  if (!name) {
    return (
      <main className="page narrow">
        <Link to="/" className="back">
          Home
        </Link>
        <UsernameGate
          title="Join room"
          subtitle={
            nameError
              ? nameError
              : rosterNames.length
                ? `Code ${code} — pick a name used in this game, or enter a new one. Same name takes over the other browser.`
                : `Code ${code}`
          }
          suggestedNames={rosterNames}
          onSubmit={(n) => {
            sessionStorage.setItem(`fg_name_${code}`, n)
            setNameError('')
            setName(n)
          }}
        />
      </main>
    )
  }

  if (!room) {
    return (
      <main className="page narrow">
        <div className="panel">
          <div className="row-between">
            <h1>Joining…</h1>
            <CodeDropdown code={code} />
          </div>
          <p className="muted">
            Connecting to <strong>{code}</strong>
            {status === 'connecting' ? '…' : ` (${status})`}. Your join is already sent.
          </p>
          {!isAudioUnlocked() ? (
            <button type="button" className="btn secondary" onClick={() => void unlockAudio()}>
              Enable sound
            </button>
          ) : null}
        </div>
      </main>
    )
  }

  if (room.status === 'closed') {
    return (
      <main className="page narrow">
        <div className="panel">
          <h1>Game closed</h1>
          <p className="muted">This room has ended. Resume it from Saved games if it was saved.</p>
          <Link className="btn primary" to="/">
            Home
          </Link>
        </div>
      </main>
    )
  }

  if (room.kind === 'hot-potato') {
    return (
      <HotPotatoView
        room={room}
        playerId={playerId}
        tab={tab}
        onTab={setTab}
        send={send}
      />
    )
  }

  return (
    <ScorecardRoomView
      room={room}
      playerId={playerId}
      sessionId={sessionId}
      tab={tab}
      onTab={setTab}
      send={send}
    />
  )
}

function HotPotatoView(props: {
  room: HotPotatoRoom
  playerId: string
  tab: 'main' | 'score'
  onTab: (t: 'main' | 'score') => void
  send: ReturnType<typeof useRoom>['send']
}) {
  const { room, playerId, send } = props
  const isHost = room.hostId === playerId
  const alive = room.aliveIds.includes(playerId)
  const players = Object.values(room.players)
  const [alarmedFor, setAlarmedFor] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const fuseDone =
    room.timer.status === 'ended' ||
    (room.timer.endsAt !== null && now >= room.timer.endsAt)

  useEffect(() => {
    if (room.timer.status !== 'running' || !room.timer.endsAt) return
    const id = window.setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [room.timer.status, room.timer.endsAt])

  useEffect(() => {
    if (!fuseDone || !room.timer.endsAt) return
    if (alarmedFor === room.timer.endsAt) return
    setAlarmedFor(room.timer.endsAt)
    void playAlarm()
  }, [fuseDone, room.timer.endsAt, alarmedFor])

  const placementRows = [...room.placements].sort((a, b) => a.place - b.place)
  const myPlace = room.placements.find((p) => p.playerId === playerId)?.place
  const winner = placementRows.find((p) => p.place === 1)

  const main = (
    <div className="panel room-main">
      <div className="room-topbar">
        <CodeDropdown code={room.code} />
        <div className="room-title-block">
          <p className="eyebrow">Hot Potato</p>
          <h1 className="room-title">{room.title}</h1>
        </div>
        <div className="top-right-place">
          {winner ? <span>{room.players[winner.playerId]?.name} · 1st</span> : <span>—</span>}
        </div>
      </div>

      {room.status === 'lobby' ? (
        <>
          <p className="muted">
            Range {Math.round(room.timer.minMs / 1000)}–{Math.round(room.timer.maxMs / 1000)}s ·{' '}
            {players.length}/50 players
          </p>
          <ul className="player-list">
            {players
              .sort((a, b) => a.joinedAt - b.joinedAt)
              .map((p) => (
                <li key={p.id}>
                  {p.name}
                  {p.id === room.hostId ? ' · host' : ''}
                </li>
              ))}
          </ul>
          {isHost ? (
            <button
              type="button"
              className="btn primary"
              disabled={players.length < 2}
              onClick={() => send({ type: 'start-hot-potato', fromId: playerId })}
            >
              Start game
            </button>
          ) : (
            <p className="muted">Waiting for host to start…</p>
          )}
        </>
      ) : null}

      {room.status === 'playing' ? (
        <>
          <div className={`fuse ${fuseDone ? 'ended' : 'running'}`}>
            {!fuseDone ? (
              <>
                <div className="fuse-pulse" aria-hidden />
                <p className="fuse-label">Passing…</p>
                <p className="muted">
                  Surprise fuse · {Math.round(room.timer.minMs / 1000)}–
                  {Math.round(room.timer.maxMs / 1000)}s window
                </p>
              </>
            ) : (
              <>
                <p className="fuse-label boom">Time!</p>
                <p className="muted">Holder — hit Explode</p>
              </>
            )}
          </div>
          <p className="alive-count">{room.aliveIds.length} still in</p>
          {alive ? (
            <button
              type="button"
              className="btn danger large"
              disabled={!fuseDone}
              onClick={() => send({ type: 'explode', fromId: playerId })}
            >
              Explode
            </button>
          ) : (
            <p className="muted">You're out — place #{myPlace}</p>
          )}
          {isHost && fuseDone ? (
            <button
              type="button"
              className="btn secondary"
              onClick={() => send({ type: 'restart-fuse', fromId: playerId })}
            >
              Restart fuse
            </button>
          ) : null}
        </>
      ) : null}

      {room.status === 'finished' ? (
        <div className="podium-wrap">
          <h2>Game over</h2>
          <ol className="placement-list">
            {placementRows.map((row) => (
              <li key={row.playerId}>
                <span>#{row.place}</span>
                <span>{room.players[row.playerId]?.name ?? 'Player'}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  )

  const score = (
    <div className="panel">
      <h2>Standings</h2>
      {room.status === 'lobby' ? (
        <p className="muted">Placements appear as players are eliminated.</p>
      ) : (
        <ol className="placement-list">
          {placementRows.map((row) => (
            <li key={row.playerId}>
              <span>#{row.place}</span>
              <span>{room.players[row.playerId]?.name ?? 'Player'}</span>
            </li>
          ))}
          {room.aliveIds.map((id) => (
            <li key={id} className="still-in">
              <span>—</span>
              <span>{room.players[id]?.name ?? 'Player'} (in)</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )

  return (
    <main className="page room-page">
      <TabShell main={main} score={score} tab={props.tab} onTab={props.onTab} />
    </main>
  )
}
