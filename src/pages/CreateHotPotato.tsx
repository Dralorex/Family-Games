import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { UsernameGate } from '../components/UsernameGate'
import { generateCode, createPlayerId } from '../lib/codes'
import { getLastTimerRange, saveTimerRange } from '../lib/storage'
import { createHotPotatoRoom } from '../rooms/factory'

const PRESETS = [
  { label: '15–45s', min: 15, max: 45 },
  { label: '30–90s', min: 30, max: 90 },
  { label: '60–180s', min: 60, max: 180 },
]

export function CreateHotPotato() {
  const navigate = useNavigate()
  const last = getLastTimerRange()
  const [name, setName] = useState<string | null>(null)
  const [minSec, setMinSec] = useState(last.minSec)
  const [maxSec, setMaxSec] = useState(last.maxSec)

  if (!name) {
    return (
      <main className="page narrow">
        <Link to="/games" className="back">
          Games
        </Link>
        <UsernameGate
          title="Hot Potato"
          subtitle="Set your name, then pick a surprise timer range."
          onSubmit={setName}
        />
      </main>
    )
  }

  const start = () => {
    const lo = Math.max(5, Math.min(minSec, maxSec))
    const hi = Math.max(lo, Math.max(minSec, maxSec))
    saveTimerRange(lo, hi)
    const code = generateCode()
    const host = { id: createPlayerId(), name, joinedAt: Date.now() }
    const room = createHotPotatoRoom({ code, host, minSec: lo, maxSec: hi })
    sessionStorage.setItem(`fg_seed_${code}`, JSON.stringify(room))
    sessionStorage.setItem(`fg_name_${code}`, name)
    navigate(`/room/${code}?host=1`)
  }

  return (
    <main className="page narrow">
      <Link to="/games" className="back">
        Games
      </Link>
      <div className="panel">
        <h1>Timer range</h1>
        <p className="muted">
          The fuse ends at a random time inside this window. Nobody sees the real countdown.
        </p>
        <div className="chip-row">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`chip ${minSec === p.min && maxSec === p.max ? 'selected' : ''}`}
              onClick={() => {
                setMinSec(p.min)
                setMaxSec(p.max)
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="range-fields">
          <label className="field">
            <span>Min (seconds)</span>
            <input
              type="number"
              min={5}
              max={600}
              value={minSec}
              onChange={(e) => setMinSec(Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span>Max (seconds)</span>
            <input
              type="number"
              min={5}
              max={600}
              value={maxSec}
              onChange={(e) => setMaxSec(Number(e.target.value))}
            />
          </label>
        </div>
        <button type="button" className="btn primary" onClick={start}>
          Create room
        </button>
      </div>
    </main>
  )
}
