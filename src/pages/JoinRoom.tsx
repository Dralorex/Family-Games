import { Link, useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import { UsernameGate } from '../components/UsernameGate'
import { normalizeCode } from '../lib/codes'

export function JoinRoom() {
  const { code: raw = '' } = useParams()
  const code = normalizeCode(raw)
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)

  if (!code) {
    return (
      <main className="page">
        <p>Missing code.</p>
        <Link to="/">Home</Link>
      </main>
    )
  }

  if (!ready) {
    return (
      <main className="page narrow">
        <Link to="/" className="back">
          Home
        </Link>
        <UsernameGate
          title="Join game"
          subtitle={`Code ${code}`}
          onSubmit={(name) => {
            sessionStorage.setItem(`fg_name_${code}`, name)
            setReady(true)
            navigate(`/room/${code}`)
          }}
        />
      </main>
    )
  }

  return null
}
