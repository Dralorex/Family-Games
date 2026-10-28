import { Link, useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import { UsernameGate } from '../components/UsernameGate'
import { getTemplate } from '../core/score/templates'
import type { ScorecardTemplateId } from '../core/score/types'
import { createPlayerId, generateCode } from '../lib/codes'
import { createScorecardRoom } from '../rooms/factory'

export function CreateScorecard() {
  const { templateId = '' } = useParams()
  const template = getTemplate(templateId)
  const navigate = useNavigate()
  const [name, setName] = useState<string | null>(null)
  const [pointLimit, setPointLimit] = useState(template?.defaultPointLimit ?? 150)

  if (!template) {
    return (
      <main className="page">
        <p>Unknown scorecard.</p>
        <Link to="/scorecards">Back</Link>
      </main>
    )
  }

  if (!name) {
    return (
      <main className="page narrow">
        <Link to="/scorecards" className="back">
          Scorecards
        </Link>
        <UsernameGate
          title={template.name}
          subtitle={template.blurb}
          onSubmit={setName}
        />
      </main>
    )
  }

  const start = () => {
    const code = generateCode()
    const host = { id: createPlayerId(), name, joinedAt: Date.now() }
    const room = createScorecardRoom({
      code,
      host,
      templateId: template.id as ScorecardTemplateId,
      pointLimit: template.endMode === 'limit' ? pointLimit : undefined,
    })
    sessionStorage.setItem(`fg_seed_${code}`, JSON.stringify(room))
    sessionStorage.setItem(`fg_name_${code}`, name)
    navigate(`/room/${code}?host=1`)
  }

  return (
    <main className="page narrow">
      <Link to="/scorecards" className="back">
        Scorecards
      </Link>
      <div className="panel">
        <h1>{template.name}</h1>
        <p className="muted">{template.blurb}</p>
        {template.endMode === 'limit' ? (
          <label className="field">
            <span>Point limit (default {template.defaultPointLimit})</span>
            <input
              type="number"
              min={1}
              max={9999}
              value={pointLimit}
              onChange={(e) => setPointLimit(Number(e.target.value))}
            />
          </label>
        ) : (
          <p className="muted">
            {template.totalRounds} rounds · {template.winDirection === 'low' ? 'lowest' : 'highest'}{' '}
            score wins
          </p>
        )}
        <button type="button" className="btn primary" onClick={start}>
          Create scorecard
        </button>
      </div>
    </main>
  )
}
