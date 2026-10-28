import { Link, useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import { UsernameGate } from '../components/UsernameGate'
import { normalizeCode } from '../lib/codes'
import { lookupOwnerClaim, normalizeOwnerKey } from '../rooms/ownerIndex'

export function JoinRoom() {
  const { code: raw = '' } = useParams()
  const code = normalizeCode(raw)
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!code) {
    return (
      <main className="page">
        <p>Missing code.</p>
        <Link to="/">Home</Link>
      </main>
    )
  }

  return (
    <main className="page narrow">
      <Link to="/" className="back">
        Home
      </Link>
      <UsernameGate
        title="Join game"
        subtitle={`Code ${code} — if you created this lobby, this browser will reclaim host and reconnect players.`}
        onSubmit={(name) => {
          setError('')
          setBusy(true)
          void (async () => {
            sessionStorage.setItem(`fg_name_${code}`, name)
            let asHost = false
            try {
              const claim = await lookupOwnerClaim(name)
              asHost = Boolean(
                claim &&
                  normalizeCode(claim.code) === code &&
                  normalizeOwnerKey(claim.creatorName) === normalizeOwnerKey(name),
              )
            } catch {
              // Still join; host reclaim may work via retained room state + claimName
            }
            navigate(asHost ? `/room/${code}?host=1` : `/room/${code}`)
          })()
        }}
      />
      {busy ? <p className="muted">Connecting…</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </main>
  )
}
