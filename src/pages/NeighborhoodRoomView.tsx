import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { CodeDropdown } from '../components/CodeDropdown'
import { HostLeaveModal } from '../components/HostLeaveModal'
import { HostReturnPrompt } from '../components/HostReturnPrompt'
import { TabShell, type RoomTab } from '../components/TabShell'
import {
  allianceGroupIds,
  allianceGroupSize,
  maxPhonesForRules,
  NEIGHBORHOOD_PIECES,
  PIECE_LABELS,
  SHARED_TRAY_IDS,
  type NeighborhoodPieceId,
} from '../core/neighborhood/types'
import { clearActiveSession } from '../lib/activeSession'
import { HOST_AWAY_MS, neighborhoodLobbyReady } from '../rooms/reducer'
import type { NeighborhoodRoom } from '../rooms/types'
import { useRoom } from '../hooks/useRoom'

function formatGrace(ms: number) {
  const m = Math.round(ms / 60000)
  return `${m} min`
}

function teamLabel(room: NeighborhoodRoom, teamId: string) {
  if (room.rules.teamStyle === 'shared') return `Tray ${teamId}`
  return `Alliance ${teamId}`
}

export function NeighborhoodRoomView(props: {
  room: NeighborhoodRoom
  playerId: string
  tab: RoomTab
  onTab: (t: RoomTab) => void
  send: ReturnType<typeof useRoom>['send']
}) {
  const { room, playerId, send } = props
  const isHost = room.hostId === playerId
  const players = Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt)
  const active = players.filter((p) => !p.left)
  const me = room.players[playerId]
  const myPiece = room.pieces[playerId]
  const myTeam = room.teamOf[playerId]
  const maxPhones = maxPhonesForRules(room.rules)
  const ready = neighborhoodLobbyReady(room)
  const [showHostLeave, setShowHostLeave] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const navigate = useNavigate()

  useEffect(() => {
    if (!room.hostAwayAt) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [room.hostAwayAt])

  const hostAwayRemaining =
    room.hostAwayAt != null
      ? Math.max(0, HOST_AWAY_MS - (now - room.hostAwayAt))
      : null

  const requestLeave = () => {
    const activeOthers = active.filter((p) => p.id !== playerId)
    if (isHost && activeOthers.length > 0) {
      setShowHostLeave(true)
      return
    }
    send({ type: 'leave', playerId })
    clearActiveSession()
    navigate('/')
  }

  const pickPiece = (pieceId: NeighborhoodPieceId) => {
    send({ type: 'set-neighborhood-piece', fromId: playerId, pieceId })
  }

  const pickTeam = (teamId: string) => {
    send({ type: 'set-neighborhood-team', fromId: playerId, teamId })
  }

  const takenPieces = new Set(
    active
      .filter((p) => p.id !== playerId)
      .map((p) => room.pieces[p.id])
      .filter(Boolean) as NeighborhoodPieceId[],
  )
  // Shared: piece free if only taken on my tray
  if (room.rules.teamStyle === 'shared' && myTeam) {
    for (const p of active) {
      if (p.id === playerId) continue
      if (room.teamOf[p.id] === myTeam && room.pieces[p.id]) {
        takenPieces.delete(room.pieces[p.id]!)
      }
    }
  }

  const teamOptions =
    room.rules.teamStyle === 'shared'
      ? [...SHARED_TRAY_IDS]
      : room.rules.teamStyle === 'alliance'
        ? allianceGroupIds(room.rules.alliancePreset ?? '2v2v2v2')
        : []

  const main = (
    <div className="panel room-main">
      {showHostLeave ? (
        <HostLeaveModal
          players={players}
          hostId={playerId}
          onCancel={() => setShowHostLeave(false)}
          onConfirm={(newHostId) => {
            setShowHostLeave(false)
            send({ type: 'leave', playerId, ...(newHostId ? { newHostId } : {}) })
            clearActiveSession()
            navigate('/')
          }}
        />
      ) : null}

      {room.pendingHostReturn && isHost ? (
        <HostReturnPrompt
          request={room.pendingHostReturn}
          onAccept={() => send({ type: 'respond-host-return', fromId: playerId, accept: true })}
          onDecline={() => send({ type: 'respond-host-return', fromId: playerId, accept: false })}
        />
      ) : null}

      {hostAwayRemaining != null && room.hostId !== playerId ? (
        <p className="warn-banner" role="status">
          Owner away — ownership can transfer in {Math.ceil(hostAwayRemaining / 1000)}s
        </p>
      ) : null}
      {hostAwayRemaining != null && room.hostId === playerId ? (
        <p className="muted" role="status">
          You are marked away for others ({Math.ceil(hostAwayRemaining / 1000)}s until handoff).
        </p>
      ) : null}

      <div className="room-topbar">
        <div className="room-title-block">
          <p className="eyebrow">Neighborhood</p>
          <h1 className="room-title">{room.title}</h1>
        </div>
        <div className="top-right-place">
          <span>{me?.name ?? '—'}</span>
        </div>
      </div>

      {room.status === 'lobby' ? (
        <>
          <p className="muted">
            {active.length}/{maxPhones} · Teams:{' '}
            {room.rules.teamStyle === 'off'
              ? 'Solo'
              : room.rules.teamStyle === 'shared'
                ? 'Shared tray'
                : `Alliance ${room.rules.alliancePreset}`}{' '}
            · Grace {formatGrace(room.rules.disconnectGraceMs)}
          </p>

          <h2 className="section-heading">Your piece</h2>
          <div className="chip-row piece-row">
            {NEIGHBORHOOD_PIECES.map((id) => {
              const taken = takenPieces.has(id) && myPiece !== id
              return (
                <button
                  key={id}
                  type="button"
                  className={`chip ${myPiece === id ? 'selected' : ''}`}
                  disabled={taken || Boolean(me?.left)}
                  onClick={() => pickPiece(id)}
                >
                  {PIECE_LABELS[id]}
                </button>
              )
            })}
          </div>

          {room.rules.teamStyle !== 'off' ? (
            <>
              <h2 className="section-heading">
                {room.rules.teamStyle === 'shared' ? 'Your tray' : 'Your alliance'}
              </h2>
              <div className="chip-row">
                {teamOptions.map((id) => {
                  const count = active.filter((p) => room.teamOf[p.id] === id).length
                  const cap =
                    room.rules.teamStyle === 'shared'
                      ? 2
                      : allianceGroupSize(room.rules.alliancePreset ?? '2v2v2v2')
                  const full = count >= cap && myTeam !== id
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`chip ${myTeam === id ? 'selected' : ''}`}
                      disabled={full || Boolean(me?.left)}
                      onClick={() => pickTeam(id)}
                    >
                      {teamLabel(room, id)}
                      {count > 0 ? ` · ${count}` : ''}
                    </button>
                  )
                })}
              </div>
            </>
          ) : null}

          <h2 className="section-heading">Players</h2>
          <ul className="player-list">
            {players.map((p) => (
              <li key={p.id} className={p.left ? 'left-player' : undefined}>
                {p.name}
                {p.id === room.hostId ? ' · owner' : ''}
                {p.left ? ' · left' : ''}
                {room.pieces[p.id] ? ` · ${PIECE_LABELS[room.pieces[p.id]!]}` : ' · no piece'}
                {room.teamOf[p.id] ? ` · ${teamLabel(room, room.teamOf[p.id]!)}` : ''}
              </li>
            ))}
          </ul>

          {isHost ? (
            <button
              type="button"
              className="btn primary"
              disabled={!ready}
              onClick={() => send({ type: 'start-neighborhood', fromId: playerId })}
            >
              Start game
            </button>
          ) : (
            <p className="muted">Waiting for owner to start…</p>
          )}
          {!ready && isHost ? (
            <p className="muted">
              Need at least two ready seats
              {room.rules.teamStyle === 'alliance' ? ' matching the alliance preset' : ''}
              {room.rules.teamStyle === 'shared' ? ' on at least two trays' : ''}, each with a piece
              {room.rules.teamStyle !== 'off' ? ' and team' : ''}.
            </p>
          ) : null}
        </>
      ) : null}

      {room.status === 'playing' ? (
        <div className="neighborhood-placeholder">
          <h2>Rules locked — board next</h2>
          <p className="muted">
            Slice A shell is live: seating, pieces, teams, and sync. Dice, board, and money arrive in
            the next slice.
          </p>
          <ul className="player-list">
            {active.map((p) => (
              <li key={p.id}>
                {p.name}
                {p.id === room.hostId ? ' · owner' : ''}
                {room.pieces[p.id] ? ` · ${PIECE_LABELS[room.pieces[p.id]!]}` : ''}
                {room.teamOf[p.id] ? ` · ${teamLabel(room, room.teamOf[p.id]!)}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {room.status === 'finished' ? (
        <div className="panel">
          <h2>Game over</h2>
          <p className="muted">End-game flow arrives with later slices.</p>
        </div>
      ) : null}
    </div>
  )

  const score = (
    <div className="panel">
      <h2>Table</h2>
      <p className="muted">Wallets and deeds will show here once the board ships.</p>
      <ul className="player-list">
        {active.map((p) => (
          <li key={p.id}>
            {p.name}
            {room.pieces[p.id] ? ` · ${PIECE_LABELS[room.pieces[p.id]!]}` : ''}
          </li>
        ))}
      </ul>
    </div>
  )

  const settings = (
    <div className="panel">
      <h2>Settings</h2>
      <p className="muted">Room code</p>
      <CodeDropdown code={room.code} />
      <p className="muted">
        Disconnect grace: {formatGrace(room.rules.disconnectGraceMs)} (owner removes manually after)
      </p>
      <p className="muted">
        Team style locked:{' '}
        {room.rules.teamStyle === 'off'
          ? 'Solo'
          : room.rules.teamStyle === 'shared'
            ? 'Shared tray'
            : `Alliance ${room.rules.alliancePreset}`}
      </p>
      {room.hostAwayAt && !isHost ? (
        <p className="muted">
          If the owner stays away, you may claim ownership after {formatGrace(HOST_AWAY_MS)} (next in
          line).
        </p>
      ) : null}
      <button type="button" className="btn danger" onClick={requestLeave}>
        Leave game
      </button>
      {isHost && room.status !== 'closed' ? (
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            send({ type: 'close-room', fromId: playerId })
            clearActiveSession()
            navigate('/')
          }}
        >
          Close lobby
        </button>
      ) : null}
    </div>
  )

  return (
    <main className="page room-page">
      <TabShell
        main={main}
        score={score}
        settings={settings}
        tab={props.tab}
        onTab={props.onTab}
      />
    </main>
  )
}
