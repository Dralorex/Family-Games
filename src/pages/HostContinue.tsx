import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { UsernameGate } from '../components/UsernameGate'
import { lookupOwnerClaim } from '../rooms/ownerIndex'

export function HostContinue() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <main className="page narrow">
      <Link to="/" className="back">
        Home
      </Link>
      <UsernameGate
        title="Continue as host"
        subtitle="Enter the name you used when you created the game. We’ll open that lobby on this browser and reconnect phones that are still in it."
        onSubmit={(name) => {
          setError('')
          setBusy(true)
          void (async () => {
            try {
              const claim = await lookupOwnerClaim(name)
              if (!claim) {
                setError(
                  'No open lobby found for that name. Create a game first, or join with the room code.',
                )
                setBusy(false)
                return
              }
              sessionStorage.setItem(`fg_name_${claim.code}`, name)
              navigate(`/room/${claim.code}?host=1`)
            } catch {
              setError('Could not reach game sync. Check your connection and try again.')
              setBusy(false)
            }
          })()
        }}
      />
      {busy ? <p className="muted">Looking up your lobby…</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </main>
  )
}
