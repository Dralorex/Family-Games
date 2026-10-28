import { Link } from 'react-router-dom'
import { useState } from 'react'
import { SCORECARD_TEMPLATES } from '../core/score/templates'
import { normalizeCode } from '../lib/codes'

export function ScorecardsHub() {
  const [code, setCode] = useState('')

  return (
    <main className="page">
      <header className="page-header">
        <Link to="/" className="back">
          Home
        </Link>
        <h1>Scorecards</h1>
        <p className="muted">Shared scoring for cards and boards at the table.</p>
      </header>

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
