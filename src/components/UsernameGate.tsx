import { useState } from 'react'
import { getRecentNames, rememberName } from '../lib/storage'
import { unlockAudio } from '../audio/alarm'

export function UsernameGate(props: {
  title: string
  subtitle?: string
  onSubmit: (name: string) => void
}) {
  const recent = getRecentNames()
  const [name, setName] = useState(recent[0] ?? '')
  const [error, setError] = useState('')

  const submit = async (value: string) => {
    const cleaned = value.trim()
    if (cleaned.length < 1) {
      setError('Enter a name so others can see you.')
      return
    }
    if (cleaned.length > 18) {
      setError('Keep it under 18 characters.')
      return
    }
    rememberName(cleaned)
    try {
      await unlockAudio()
    } catch {
      // optional
    }
    props.onSubmit(cleaned)
  }

  return (
    <div className="panel gate">
      <h1>{props.title}</h1>
      {props.subtitle ? <p className="muted">{props.subtitle}</p> : null}

      {recent.length > 0 ? (
        <div className="chip-row" aria-label="Recent names">
          {recent.map((n) => (
            <button key={n} type="button" className="chip" onClick={() => void submit(n)}>
              {n}
            </button>
          ))}
        </div>
      ) : null}

      <label className="field">
        <span>Your name for this game</span>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit(name)
          }}
          placeholder="Enter a name"
          autoComplete="nickname"
          maxLength={18}
        />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <button type="button" className="btn primary" onClick={() => void submit(name)}>
        Continue
      </button>
    </div>
  )
}
