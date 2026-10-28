import { Link } from 'react-router-dom'
import { useState } from 'react'
import { normalizeCode } from '../lib/codes'

export function GamesHub() {
  const [code, setCode] = useState('')

  return (
    <main className="page">
      <header className="page-header">
        <Link to="/" className="back">
          Home
        </Link>
        <h1>Games</h1>
        <p className="muted">Digital games you play on your phones together.</p>
      </header>

      <section className="card-list">
        <Link className="game-card" to="/games/hot-potato/create">
          <div>
            <h2>Hot Potato</h2>
            <p>Synced surprise timer, alarm on every phone, last one standing wins.</p>
          </div>
          <span className="chevron" aria-hidden>
            →
          </span>
        </Link>
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
