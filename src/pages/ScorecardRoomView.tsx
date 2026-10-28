import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useNavigate } from 'react-router-dom'
import { CodeDropdown } from '../components/CodeDropdown'
import { EndGameMenu } from '../components/EndGameMenu'
import { Podium } from '../components/Podium'
import { ScorecardTable, exportScorecardPng } from '../components/ScorecardTable'
import { TabShell } from '../components/TabShell'
import {
  allScoresEntered,
  computeStandings,
  missingScorePlayerIds,
  playerTotal,
  shouldShowHeroTotal,
  shouldShowPlace,
  topThree,
} from '../core/score/engine'
import { setActiveParty } from '../lib/party'
import { saveGame } from '../lib/savedGames'
import type { useRoom } from '../hooks/useRoom'
import type { EndVote, ScorecardRoom } from '../rooms/types'

const FINISHED_TTL_MS = 10 * 60 * 1000

export function ScorecardRoomView(props: {
  room: ScorecardRoom
  playerId: string
  tab: 'main' | 'score'
  onTab: (t: 'main' | 'score') => void
  send: ReturnType<typeof useRoom>['send']
}) {
  const { room, playerId, send } = props
  const navigate = useNavigate()
  const isHost = room.hostId === playerId
  const me = room.players[playerId]
  const players = Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt)
  const active = players.filter((p) => !p.left)
  const standings = computeStandings(players, room.scores, room.winDirection)
  const myStanding = standings.find((s) => s.playerId === playerId)
  const first = standings[0]
  const myTotal = playerTotal(room.scores, playerId)
  const hasAnyScore = Object.values(room.scores).some((r) => Object.keys(r).length > 0)
  const showHero = shouldShowHeroTotal(room.completedRounds, hasAnyScore)
  const showPlace = shouldShowPlace(room.completedRounds, hasAnyScore) || room.status === 'finished'
  const missing = missingScorePlayerIds(players, room.scores, room.currentRound)
  const ready = allScoresEntered(players, room.scores, room.currentRound)

  const controlled = useMemo(
    () =>
      players.filter(
        (p) => !p.left && (p.id === playerId || p.controlledBy === playerId),
      ),
    [players, playerId],
  )
  const [entryIndex, setEntryIndex] = useState(0)
  const entryTarget = controlled[Math.min(entryIndex, Math.max(0, controlled.length - 1))]
  const [draft, setDraft] = useState('')
  const [showOthers, setShowOthers] = useState(true)
  const [addName, setAddName] = useState('')
  const [addError, setAddError] = useState('')
  const exportRef = useRef<HTMLDivElement>(null)
  const [savingPhoto, setSavingPhoto] = useState(false)

  useEffect(() => {
    if (!entryTarget) return
    const existing = room.scores[entryTarget.id]?.[room.currentRound]
    setDraft(existing !== undefined ? String(existing) : '')
  }, [entryTarget?.id, room.currentRound, room.scores])

  // Soft-close finished rooms after 10 minutes or when everyone left
  useEffect(() => {
    if (room.status !== 'finished' || !isHost) return
    const allLeft = active.length === 0
    const expired = room.finishedAt && Date.now() - room.finishedAt > FINISHED_TTL_MS
    if (allLeft || expired) {
      void saveGame(room).finally(() => send({ type: 'close-room', fromId: playerId }))
    }
    const t = window.setInterval(() => {
      if (room.finishedAt && Date.now() - room.finishedAt > FINISHED_TTL_MS) {
        void saveGame(room).finally(() => send({ type: 'close-room', fromId: playerId }))
      }
    }, 15000)
    return () => clearInterval(t)
  }, [room, isHost, active.length, playerId, send])

  useEffect(() => {
    if (room.regrouping) {
      setActiveParty({ partyId: room.partyId, hostId: room.hostId, code: room.code })
      navigate('/')
    }
  }, [room.regrouping, room.partyId, room.hostId, room.code, navigate])

  useEffect(() => {
    if (room.pullTo) {
      navigate(room.pullTo.path)
    }
  }, [room.pullTo, navigate])

  const submitScore = () => {
    if (!entryTarget) return
    const trimmed = draft.trim()
    if (trimmed === '') return
    const value = Number(trimmed)
    if (!Number.isFinite(value)) return
    send({
      type: 'set-score',
      fromId: playerId,
      targetPlayerId: entryTarget.id,
      round: room.currentRound,
      value,
    })
    if (entryIndex < controlled.length - 1) {
      setEntryIndex((i) => i + 1)
    }
  }

  const addPlayer = () => {
    const name = addName.trim()
    if (!name) return
    if (players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      setAddError('That name is already taken in this game.')
      return
    }
    send({
      type: 'add-player',
      fromId: playerId,
      player: {
        id: crypto.randomUUID(),
        name,
        joinedAt: Date.now(),
        controlledBy: playerId,
      },
    })
    setAddName('')
    setAddError('')
  }

  const leave = () => {
    void saveGame(room)
    send({ type: 'leave', playerId })
    navigate('/')
  }

  const savePhoto = async () => {
    // Build a full offscreen clone so mobile viewport doesn't crop
    setSavingPhoto(true)
    try {
      const host = document.createElement('div')
      host.style.position = 'fixed'
      host.style.left = '-10000px'
      host.style.top = '0'
      host.style.width = `${Math.max(640, 120 + players.length * 88)}px`
      host.style.background = '#f6f1e6'
      host.style.padding = '16px'
      document.body.appendChild(host)
      const root = createRoot(host)
      await new Promise<void>((resolve) => {
        root.render(
          createElement(ScorecardTable, {
            room,
            focusPlayerId: playerId,
            showOthers: true,
          }),
        )
        requestAnimationFrame(() => resolve())
      })
      await new Promise((r) => setTimeout(r, 80))
      const node = host.querySelector('.scorecard-table-card') as HTMLElement
      if (node) {
        await exportScorecardPng(node, `${room.title || room.code}-scorecard.png`)
      }
      root.unmount()
      document.body.removeChild(host)
    } finally {
      setSavingPhoto(false)
    }
  }

  const header = (
    <div className="room-topbar">
      <CodeDropdown code={room.code} />
      <div className="room-title-block">
        <p className="eyebrow">{room.templateName}</p>
        <h1 className="room-title">{room.title}</h1>
      </div>
      <div className="top-right-place">
        {showPlace && first ? (
          <span>
            {first.name} · 1st
          </span>
        ) : (
          <span className="muted-inline">—</span>
        )}
      </div>
    </div>
  )

  const main = (
    <div className="scorecard-main-stack">
      {header}

      {room.status === 'lobby' ? (
        <div className="bubble">
          <ul className="player-list">
            {players.map((p) => (
              <li key={p.id}>
                {p.name}
                {p.id === room.hostId ? ' · game master' : ''}
                {p.controlledBy === playerId && p.id !== playerId ? ' · on your device' : ''}
                {p.left ? ' · left' : ''}
              </li>
            ))}
          </ul>
          <div className="add-player-row">
            <input
              value={addName}
              onChange={(e) => {
                setAddName(e.target.value)
                setAddError('')
              }}
              placeholder="Add another player"
            />
            <button type="button" className="btn secondary" onClick={addPlayer}>
              Add
            </button>
          </div>
          {addError ? <p className="error">{addError}</p> : null}
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
              disabled={active.length < 1}
              onClick={() => send({ type: 'start-scorecard', fromId: playerId })}
            >
              Start scorecard
            </button>
          ) : (
            <p className="muted">Waiting for game master…</p>
          )}
          <button type="button" className="btn secondary" onClick={leave}>
            Leave game
          </button>
        </div>
      ) : null}

      {(room.status === 'playing' || room.status === 'finished') && showPlace && first ? (
        <div className="bubble first-bubble">
          <strong>{first.name}</strong> is in 1st!
        </div>
      ) : null}

      {(room.status === 'playing' || room.status === 'finished') && (
        <div className="bubble hero-bubble">
          <div className="hero-score">
            <div className="hero-score-main">
              <span className="hero-number">{showHero ? myTotal : '—'}</span>
              {showPlace && myStanding ? <span className="hero-place">#{myStanding.place}</span> : null}
            </div>
            <p className="muted">{me?.name ?? 'You'}</p>
          </div>
        </div>
      )}

      {room.status === 'playing' ? (
        <div className="bubble round-bubble">
          <p className="round-label">
            Round {room.currentRound}
            {room.totalRounds ? ` / ${room.totalRounds}` : ''}
            {room.pointLimit ? ` · limit ${room.pointLimit}` : ''}
          </p>
          {controlled.length > 1 ? (
            <p className="muted">
              Entering for {entryTarget?.name} ({entryIndex + 1}/{controlled.length})
            </p>
          ) : null}
          <label className="field">
            <span>{entryTarget ? `${entryTarget.name}'s score` : 'Your score'}</span>
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
            {entryTarget && room.scores[entryTarget.id]?.[room.currentRound] !== undefined
              ? 'Update score'
              : 'Submit score'}
          </button>
          {controlled.length > 1 ? (
            <div className="chip-row">
              {controlled.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className={`chip ${i === entryIndex ? 'selected' : ''}`}
                  onClick={() => setEntryIndex(i)}
                >
                  {p.name}
                  {room.scores[p.id]?.[room.currentRound] !== undefined ? ' ✓' : ''}
                </button>
              ))}
            </div>
          ) : null}

          <div className="add-player-row">
            <input
              value={addName}
              onChange={(e) => {
                setAddName(e.target.value)
                setAddError('')
              }}
              placeholder="Add another player"
            />
            <button type="button" className="btn secondary" onClick={addPlayer}>
              Add
            </button>
          </div>
          {addError ? <p className="error">{addError}</p> : null}

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
                      players.some(
                        (p) => playerTotal(room.scores, p.id) >= (room.pointLimit ?? Infinity),
                      )
                    ? 'Finish game'
                    : 'Start next round'}
              </button>
            </div>
          ) : (
            <p className="muted">
              {ready ? 'Waiting for game master to advance…' : 'Enter scores when ready.'}
            </p>
          )}
          <button type="button" className="btn secondary" onClick={leave}>
            Leave game
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              void saveGame(room)
            }}
          >
            Save game
          </button>
        </div>
      ) : null}

      {room.status === 'finished' ? (
        <>
          <div className="bubble">
            <Podium standings={topThree(standings)} title="Top 3" />
            <button
              type="button"
              className="btn primary"
              disabled={savingPhoto}
              onClick={() => void savePhoto()}
            >
              {savingPhoto ? 'Saving photo…' : 'Save scorecard photo'}
            </button>
          </div>
          <EndGameMenu
            isHost={isHost}
            playerId={playerId}
            players={players}
            votes={room.endVotes ?? {}}
            onVote={(vote: EndVote) => {
              send({ type: 'cast-end-vote', fromId: playerId, vote })
              if (vote === 'leave') leave()
            }}
            onHostNewGame={() => {
              setActiveParty({ partyId: room.partyId, hostId: room.hostId, code: room.code })
              send({ type: 'host-new-game', fromId: playerId })
            }}
          />
        </>
      ) : null}
    </div>
  )

  const score = (
    <div className="scorecard-main-stack">
      {header}
      <div className="bubble">
        <div className="row-between">
          <h2>Scorecard</h2>
          <button type="button" className="btn secondary" onClick={() => setShowOthers((v) => !v)}>
            {showOthers ? 'Hide others' : 'Show all players'}
          </button>
        </div>
        <ScorecardTable
          room={room}
          focusPlayerId={playerId}
          showOthers={showOthers}
          exportRef={exportRef}
        />
        {(room.status === 'finished' || room.status === 'playing') && (
          <button
            type="button"
            className="btn secondary"
            disabled={savingPhoto}
            onClick={() => void savePhoto()}
          >
            {savingPhoto ? 'Saving photo…' : 'Save scorecard photo'}
          </button>
        )}
      </div>
    </div>
  )

  return (
    <main className="page room-page">
      <TabShell main={main} score={score} tab={props.tab} onTab={props.onTab} />
    </main>
  )
}
