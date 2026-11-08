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
import { getNeighborhoodMuted, setNeighborhoodMuted } from '../lib/neighborhoodMute'
import { unlockAudio } from '../audio/neighborhood'
import { HOST_AWAY_MS, neighborhoodLobbyReady } from '../rooms/reducer'
import type { NeighborhoodRoom } from '../rooms/types'
import { useRoom } from '../hooks/useRoom'
import { trayIdForPlayer } from '../core/neighborhood/engine'
import { NeighborhoodManagePanel } from './NeighborhoodManagePanel'
import { NeighborhoodPieceIcon } from './NeighborhoodPieceIcon'
import { NeighborhoodPlayPanel, NeighborhoodScorePanel } from './NeighborhoodPlayPanel'

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
  const [leaveGift, setLeaveGift] = useState<'bank' | string>('bank')
  const [showLeaveGift, setShowLeaveGift] = useState(false)
  const [muted, setMuted] = useState(() => getNeighborhoodMuted())
  const [now, setNow] = useState(() => Date.now())
  const navigate = useNavigate()

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Mark this phone away / back for disconnect grace
  useEffect(() => {
    if (!room.game || room.status === 'lobby') return
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        send({ type: 'nb-player-away', fromId: playerId, at: Date.now() })
      }
    }
    const onShow = () => {
      if (document.visibilityState === 'visible') {
        send({ type: 'nb-player-back', fromId: playerId })
      }
    }
    const onPageHide = () => send({ type: 'nb-player-away', fromId: playerId, at: Date.now() })
    document.addEventListener('visibilitychange', onHide)
    document.addEventListener('visibilitychange', onShow)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      document.removeEventListener('visibilitychange', onShow)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [room.game, room.status, playerId, send])

  const hostAwayRemaining =
    room.hostAwayAt != null
      ? Math.max(0, HOST_AWAY_MS - (now - room.hostAwayAt))
      : null

  const requestLeave = () => {
    if (room.game && room.status === 'playing') {
      setShowLeaveGift(true)
      return
    }
    const activeOthers = active.filter((p) => p.id !== playerId)
    if (isHost && activeOthers.length > 0) {
      setShowHostLeave(true)
      return
    }
    send({ type: 'leave', playerId })
    clearActiveSession()
    navigate('/')
  }

  const confirmLeaveGift = (spectate: boolean) => {
    send({
      type: 'nb-leave-game',
      fromId: playerId,
      giftTo: leaveGift,
      spectate,
    })
    if (isHost) {
      const activeOthers = active.filter((p) => p.id !== playerId && !p.left)
      if (activeOthers.length > 0) {
        setShowLeaveGift(false)
        setShowHostLeave(true)
        return
      }
    }
    send({ type: 'leave', playerId })
    clearActiveSession()
    navigate(spectate ? `/room/${room.code}` : '/')
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

      {room.game
        ? Object.entries(room.game.awayAt ?? {}).map(([pid, at]) => {
            if (at == null || pid === playerId) return null
            const leftMs = room.rules.disconnectGraceMs - (now - at)
            const name = room.players[pid]?.name ?? 'Player'
            const expired = leftMs <= 0
            return (
              <p key={pid} className="warn-banner" role="status">
                {name} disconnected
                {expired
                  ? ' — grace over'
                  : ` — ${Math.ceil(leftMs / 1000)}s before owner may remove`}
                {isHost && expired ? (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() =>
                        send({ type: 'nb-remove-player', fromId: playerId, targetPlayerId: pid })
                      }
                    >
                      Remove
                    </button>
                  </>
                ) : null}
              </p>
            )
          })
        : null}

      {isHost && room.game && (room.game.joinRequests ?? []).length > 0 ? (
        <div className="warn-banner">
          <p>Join requests</p>
          {(room.game.joinRequests ?? []).map((r) => {
            const used = new Set(Object.values(room.game!.trays).map((t) => t.pieceId))
            const free = NEIGHBORHOOD_PIECES.find((p) => !used.has(p))
            return (
              <div key={r.playerId} className="chip-row">
                <span>{r.name}</span>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!free}
                  onClick={() =>
                    free &&
                    send({
                      type: 'nb-accept-join',
                      fromId: playerId,
                      playerId: r.playerId,
                      pieceId: free,
                    })
                  }
                >
                  Accept {free ? PIECE_LABELS[free] : ''}
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() =>
                    send({ type: 'nb-decline-join', fromId: playerId, playerId: r.playerId })
                  }
                >
                  Decline
                </button>
              </div>
            )
          })}
        </div>
      ) : null}

      {showLeaveGift ? (
        <div className="bubble">
          <h2>Leave game</h2>
          <p className="muted">Gift remaining estate, then spectate or go Home.</p>
          <label className="field">
            <span>Gift to</span>
            <select value={leaveGift} onChange={(e) => setLeaveGift(e.target.value)}>
              <option value="bank">Bank</option>
              {room.game
                ? Object.keys(room.game.trays)
                    .filter((id) => id !== trayIdForPlayer(room.rules, playerId, room.teamOf))
                    .map((id) => (
                      <option key={id} value={id}>
                        {room.game!.trays[id]!.memberIds
                          .map((p) => room.players[p]?.name ?? '?')
                          .join(' & ')}
                      </option>
                    ))
                : null}
            </select>
          </label>
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={() => setShowLeaveGift(false)}>
              Cancel
            </button>
            <button type="button" className="btn secondary" onClick={() => confirmLeaveGift(true)}>
              Spectate
            </button>
            <button type="button" className="btn danger" onClick={() => confirmLeaveGift(false)}>
              Home
            </button>
          </div>
        </div>
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
                  className={`chip piece-chip ${myPiece === id ? 'selected' : ''}`}
                  disabled={taken || Boolean(me?.left)}
                  onClick={() => pickPiece(id)}
                >
                  <NeighborhoodPieceIcon pieceId={id} size={18} />
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

      {room.status === 'playing' || room.status === 'finished' ? (
        <NeighborhoodPlayPanel room={room} playerId={playerId} send={send} />
      ) : null}
    </div>
  )

  const score = (
    <div className="panel">
      <h2>Table</h2>
      <NeighborhoodScorePanel room={room} />
      {room.status === 'playing' ? (
        <>
          <h2 className="section-heading">Manage</h2>
          <NeighborhoodManagePanel room={room} playerId={playerId} send={send} />
        </>
      ) : null}
    </div>
  )

  const settings = (
    <div className="panel">
      <h2>Settings</h2>
      <p className="muted">Room code</p>
      <CodeDropdown code={room.code} />
      <label className="check-row">
        <input
          type="checkbox"
          checked={muted}
          onChange={(e) => {
            const next = e.target.checked
            setMuted(next)
            setNeighborhoodMuted(next)
            if (!next) void unlockAudio()
          }}
        />
        <span>Mute game sounds</span>
      </label>
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
