import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { SCORECARD_TEMPLATES } from '../core/score/templates'
import { normalizeCode } from '../lib/codes'
import { listSavedGames, loadSavedGame, type SavedGameMeta } from '../lib/savedGames'

function formatPaused(ts: number) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ts))
  } catch {
    return new Date(ts).toLocaleString()
  }
}

export function ScorecardsHub() {
  const [code, setCode] = useState('')
  const [saved, setSaved] = useState<SavedGameMeta[]>([])
  const [selectedSaved, setSelectedSaved] = useState('')
  const [resumeHint, setResumeHint] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    setSaved(listSavedGames().filter((g) => g.kind === 'scorecard'))
  }, [])

  const resume = async () => {
    if (!selectedSaved) return
    const game = await loadSavedGame(selectedSaved)
    if (!game) return
    sessionStorage.setItem(`fg_seed_${game.code}`, JSON.stringify(game.room))
    setResumeHint(
      'Resumed. Others can rejoin with the exact same name they used before. On this device, pick a name from the list.',
    )
    navigate(`/room/${game.code}?host=1`)
  }

  return (
    <main className="page">
      <header className="page-header">
        <Link to="/" className="back">
          Home
        </Link>
        <h1>Scorecards</h1>
        <p className="muted">Shared scoring for cards and boards at the table.</p>
      </header>

      {saved.length > 0 ? (
        <section className="panel join-panel">
          <h2>Saved games</h2>
          <label className="field">
            <span>Resume a paused scorecard</span>
            <select
              value={selectedSaved}
              onChange={(e) => setSelectedSaved(e.target.value)}
            >
              <option value="">Choose a saved game…</option>
              {saved.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title} · {g.templateName} · {formatPaused(g.pausedAt)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn primary" disabled={!selectedSaved} onClick={() => void resume()}>
            Resume last / selected game
          </button>
          {resumeHint ? <p className="muted">{resumeHint}</p> : null}
        </section>
      ) : null}

      <section className="card-list">
        {SCORECARD_TEMPLATES.map((t) => (
          <Link key={t.id} className="game-card" to={`/scorecards/${t.id}/create`}>
            <div>
              <h2>{t.name}</h2>
              <p>{t.blurb}</p>
            </div>
            <span className="chevron" aria-hidden>
              →
            </span>
          </Link>
        ))}
      </section>

      <section className="panel join-panel">
        <h2>Have a code?</h2>
        <div className="inline-join">
          <input
            value={code}
            onChange={(e) => setCode(normalizeCode(e.target.value))}
            placeholder="Enter code"
            maxLength={8}
            aria-label="Join code"
          />
          <Link
            className={`btn primary ${normalizeCode(code).length < 4 ? 'disabled' : ''}`}
            to={normalizeCode(code).length >= 4 ? `/join/${normalizeCode(code)}` : '#'}
            onClick={(e) => {
              if (normalizeCode(code).length < 4) e.preventDefault()
            }}
          >
            Join
          </Link>
        </div>
      </section>
    </main>
  )
}
