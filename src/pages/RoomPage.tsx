import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { playAlarm, unlockAudio, isAudioUnlocked } from '../audio/alarm'
import { CopyCode } from '../components/CopyCode'
import { Podium } from '../components/Podium'
import { SyncBadge } from '../components/SyncBadge'
import { TabShell } from '../components/TabShell'
import { UsernameGate } from '../components/UsernameGate'
import {
  allScoresEntered,
  computeStandings,
  missingScorePlayerIds,
  playerTotal,
  shouldShowPlace,
  shouldShowRunningTotals,
  topThree,
} from '../core/score/engine'
import { useRoom } from '../hooks/useRoom'
import { createPlayerId } from '../lib/codes'
import type { HotPotatoRoom, RoomState, ScorecardRoom } from '../rooms/types'

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
  const isCreator = params.get('host') === '1'
  const playerId = useMemo(() => createPlayerId(), [])
  const seed = useMemo(() => (isCreator ? loadSeed(code) : undefined), [code, isCreator])
  const [name, setName] = useState<string | null>(() => sessionStorage.getItem(`fg_name_${code}`))
  const [tab, setTab] = useState<'main' | 'score'>('main')

  const { room, status, send } = useRoom({
    code,
    playerId,
    isCreator,
    initialState: seed,
    enabled: Boolean(name),
  })

  useEffect(() => {
    if (!name) return
    // Re-announce join when connected so host adds us
    if (status === 'connected' && name) {
      send({
        type: 'join',
        player: { id: playerId, name, joinedAt: Date.now() },
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, name, playerId])

  if (!name) {
    return (
      <main className="page narrow">
        <Link to="/" className="back">
          Home
        </Link>
        <UsernameGate
          title="Join room"
          subtitle={`Code ${code}`}
          onSubmit={(n) => {
            sessionStorage.setItem(`fg_name_${code}`, n)
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
            <SyncBadge status={status} />
          </div>
          <p className="muted">Waiting for the host room <strong>{code}</strong>.</p>
          <CopyCode code={code} />
          {!isAudioUnlocked() ? (
            <button type="button" className="btn secondary" onClick={() => void unlockAudio()}>
              Enable sound
            </button>
          ) : null}
        </div>
      </main>
    )
  }

  if (room.kind === 'hot-potato') {
    return (
      <HotPotatoView
        room={room}
        playerId={playerId}
        status={status}
        tab={tab}
        onTab={setTab}
        send={send}
      />
    )
  }

  return (
    <ScorecardView
      room={room}
      playerId={playerId}
      status={status}
      tab={tab}
      onTab={setTab}
      send={send}
    />
  )
}

function HotPotatoView(props: {
  room: HotPotatoRoom
  playerId: string
  status: ReturnType<typeof useRoom>['status']
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

  const main = (
    <div className="panel room-main">
      <div className="row-between">
        <div>
          <p className="eyebrow">Hot Potato</p>
          <CopyCode code={room.code} />
        </div>
        <SyncBadge status={props.status} />
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

function ScorecardView(props: {
  room: ScorecardRoom
  playerId: string
  status: ReturnType<typeof useRoom>['status']
  tab: 'main' | 'score'
  onTab: (t: 'main' | 'score') => void
  send: ReturnType<typeof useRoom>['send']
}) {
  const { room, playerId, send } = props
  const isHost = room.hostId === playerId
  const players = Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt)
  const standings = computeStandings(players, room.scores, room.winDirection)
  const myStanding = standings.find((s) => s.playerId === playerId)
  const myTotal = playerTotal(room.scores, playerId)
  const missing = missingScorePlayerIds(players, room.scores, room.currentRound)
  const ready = allScoresEntered(players, room.scores, room.currentRound)
  const showTotals = shouldShowRunningTotals(room.completedRounds)
  const showPlace =
    room.status === 'finished' ||
    shouldShowPlace(room.currentRound, room.completedRounds)
  const [draft, setDraft] = useState('')

  const myRoundScore = room.scores[playerId]?.[room.currentRound]
  useEffect(() => {
    if (myRoundScore !== undefined) setDraft(String(myRoundScore))
    else setDraft('')
  }, [myRoundScore, room.currentRound])

  const submitScore = () => {
    const value = Number(draft)
    if (!Number.isFinite(value)) return
    send({ type: 'set-score', fromId: playerId, round: room.currentRound, value })
  }

  const main = (
    <div className="panel room-main">
      <div className="row-between">
        <div>
          <p className="eyebrow">{room.templateName}</p>
          <CopyCode code={room.code} />
        </div>
        <SyncBadge status={props.status} />
      </div>

      {room.status === 'lobby' ? (
        <>
          <ul className="player-list">
            {players.map((p) => (
              <li key={p.id}>
                {p.name}
                {p.id === room.hostId ? ' · game master' : ''}
              </li>
            ))}
          </ul>
          {room.endMode === 'limit' && isHost ? (
            <label className="field">
              <span>Point limit</span>
              <input
                type="number"
                min={1}
                value={room.pointLimit ?? 150}
                onChange={(e) =>
                  send({
                    type: 'set-point-limit',
                    fromId: playerId,
                    pointLimit: Number(e.target.value),
                  })
                }
              />
            </label>
          ) : room.endMode === 'limit' ? (
            <p className="muted">Point limit: {room.pointLimit}</p>
          ) : (
            <p className="muted">
              {room.totalRounds} rounds · {room.winDirection === 'low' ? 'lowest' : 'highest'} wins
            </p>
          )}
          {isHost ? (
            <button
              type="button"
              className="btn primary"
              disabled={players.length < 1}
              onClick={() => send({ type: 'start-scorecard', fromId: playerId })}
            >
              Start scorecard
            </button>
          ) : (
            <p className="muted">Waiting for game master…</p>
          )}
        </>
      ) : null}

      {(room.status === 'playing' || room.status === 'finished') && (
        <div className="hero-score">
          <div className="hero-score-main">
            <span className="hero-number">{showTotals || room.status === 'finished' ? myTotal : '—'}</span>
            {showPlace && myStanding ? (
              <span className="hero-place">#{myStanding.place}</span>
            ) : null}
          </div>
          <p className="muted">
            {room.status === 'finished'
              ? 'Final total'
              : showTotals
                ? 'Your total'
                : 'Totals after round 2'}
          </p>
        </div>
      )}

      {room.status === 'playing' ? (
        <>
          <p className="round-label">
            Round {room.currentRound}
            {room.totalRounds ? ` / ${room.totalRounds}` : ''}
            {room.pointLimit ? ` · limit ${room.pointLimit}` : ''}
          </p>
          <label className="field">
            <span>Your score this round</span>
            <input
              type="number"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitScore()
              }}
            />
          </label>
          <button type="button" className="btn primary" onClick={submitScore}>
            {myRoundScore !== undefined ? 'Update score' : 'Submit score'}
          </button>

          {isHost ? (
            <div className="gm-next">
              {!ready ? (
                <p className="warn">
                  Waiting on: {missing.map((id) => room.players[id]?.name ?? 'player').join(', ')}
                </p>
              ) : (
                <p className="ok">Everyone has entered a score.</p>
              )}
              <button
                type="button"
                className={`btn large ${ready ? 'ready-green' : 'ready-red'}`}
                onClick={() => {
                  if (!ready) return
                  send({ type: 'next-round', fromId: playerId })
                }}
              >
                {room.endMode === 'rounds' &&
                room.totalRounds &&
                room.currentRound >= room.totalRounds
                  ? 'Finish game'
                  : room.endMode === 'limit' &&
                      ready &&
                      players.some((p) => playerTotal(room.scores, p.id) >= (room.pointLimit ?? Infinity))
                    ? 'Finish game'
                    : 'Start next round'}
              </button>
            </div>
          ) : (
            <p className="muted">
              {ready ? 'Waiting for game master to advance…' : 'Enter your score when ready.'}
            </p>
          )}
        </>
      ) : null}

      {room.status === 'finished' ? (
        <Podium standings={topThree(standings)} title="Top 3" />
      ) : null}
    </div>
  )

  const score = (
    <div className="panel">
      <h2>Scorecard</h2>
      {!showTotals && room.status === 'playing' ? (
        <p className="muted">Running totals show after round 2.</p>
      ) : null}
      <div className="score-table-wrap">
        <table className="score-table">
          <thead>
            <tr>
              <th>Player</th>
              {Array.from({ length: Math.max(room.currentRound, room.completedRounds) }, (_, i) => (
                <th key={i}>R{i + 1}</th>
              ))}
              <th>Total</th>
              {showPlace ? <th>Place</th> : null}
            </tr>
          </thead>
          <tbody>
            {(showPlace ? standings : players.map((p) => ({
              playerId: p.id,
              name: p.name,
              total: playerTotal(room.scores, p.id),
              place: 0,
            }))).map((row) => (
              <tr key={row.playerId} className={row.playerId === playerId ? 'me' : ''}>
                <td>{row.name}</td>
                {Array.from({ length: Math.max(room.currentRound, room.completedRounds) }, (_, i) => (
                  <td key={i}>{room.scores[row.playerId]?.[i + 1] ?? '—'}</td>
                ))}
                <td className="total-cell">
                  {showTotals || room.status === 'finished' ? row.total : '—'}
                </td>
                {showPlace ? <td>#{row.place}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="game-total-foot">
        Game total · {room.winDirection === 'low' ? 'lowest wins' : 'highest wins'}
        {room.pointLimit ? ` · limit ${room.pointLimit}` : ''}
      </p>
    </div>
  )

  return (
    <main className="page room-page">
      <TabShell main={main} score={score} tab={props.tab} onTab={props.onTab} />
    </main>
  )
}
