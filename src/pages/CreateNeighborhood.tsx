import { Link, useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { UsernameGate } from '../components/UsernameGate'
import {
  DEFAULT_DISCONNECT_GRACE_MS,
  defaultNeighborhoodRules,
  type AlliancePreset,
  type BuildingSupply,
  type NeighborhoodRules,
  type TeamStyle,
} from '../core/neighborhood/types'
import { setActiveSession } from '../lib/activeSession'
import { createPlayerId, createSessionId, generateCode } from '../lib/codes'
import { getActiveParty, setActiveParty } from '../lib/party'
import { createNeighborhoodRoom } from '../rooms/factory'
import { claimFromRoom, publishOwnerClaim } from '../rooms/ownerIndex'
import { publishPartyInvite } from '../rooms/partyBus'

const ALLIANCE_PRESETS: { id: AlliancePreset; label: string }[] = [
  { id: '2v2v2v2', label: '2v2v2v2' },
  { id: '3v3', label: '3v3' },
  { id: '4v4', label: '4v4' },
]

const SUPPLY: { id: BuildingSupply; label: string }[] = [
  { id: 'standard', label: 'Standard (32/12)' },
  { id: 'scarce', label: 'Scarce (16/6)' },
  { id: 'plentiful', label: 'Plentiful (48/18)' },
  { id: 'unlimited', label: 'Unlimited' },
]

export function CreateNeighborhood() {
  const navigate = useNavigate()
  const [name, setName] = useState<string | null>(null)
  const [title, setTitle] = useState('Neighborhood')
  const [teamStyle, setTeamStyle] = useState<TeamStyle>('off')
  const [alliancePreset, setAlliancePreset] = useState<AlliancePreset>('2v2v2v2')
  const [noAuctions, setNoAuctions] = useState(false)
  const [jackpot, setJackpot] = useState(false)
  const [landHomeDouble, setLandHomeDouble] = useState(false)
  const [startingDeeds, setStartingDeeds] = useState<0 | 1 | 2>(0)
  const [jailBlock, setJailBlock] = useState(false)
  const [buildingSupply, setBuildingSupply] = useState<BuildingSupply>('standard')
  const [unmortgageTenPercent, setUnmortgageTenPercent] = useState(true)
  const [stopAtFirstBankruptcy, setStopAtFirstBankruptcy] = useState(false)
  const [graceMin, setGraceMin] = useState(5)

  const rules: NeighborhoodRules = useMemo(
    () =>
      defaultNeighborhoodRules({
        teamStyle,
        alliancePreset: teamStyle === 'alliance' ? alliancePreset : undefined,
        noAuctions,
        jackpot,
        landHomeDouble,
        startingDeeds,
        jailBlock,
        buildingSupply,
        unmortgageTenPercent,
        stopAtFirstBankruptcy,
        disconnectGraceMs: Math.max(1, Math.min(60, graceMin)) * 60 * 1000,
      }),
    [
      teamStyle,
      alliancePreset,
      noAuctions,
      jackpot,
      landHomeDouble,
      startingDeeds,
      jailBlock,
      buildingSupply,
      unmortgageTenPercent,
      stopAtFirstBankruptcy,
      graceMin,
    ],
  )

  if (!name) {
    return (
      <main className="page narrow">
        <Link to="/games" className="back">
          Games
        </Link>
        <UsernameGate
          title="Neighborhood"
          subtitle="Set your name, then lock the house rules for this room."
          onSubmit={setName}
        />
      </main>
    )
  }

  const start = () => {
    const code = generateCode()
    const host = {
      id: createPlayerId(),
      name,
      joinedAt: Date.now(),
      sessionId: createSessionId(code),
    }
    const party = getActiveParty()
    const room = createNeighborhoodRoom({
      code,
      host,
      rules,
      title: title.trim() || 'Neighborhood',
      partyId: party?.partyId,
    })
    sessionStorage.setItem(`fg_seed_${code}`, JSON.stringify(room))
    sessionStorage.setItem(`fg_name_${code}`, name)
    void publishOwnerClaim(name, claimFromRoom(room)).catch(() => {})
    if (party) {
      setActiveParty({ partyId: party.partyId, hostId: host.id, code })
      const path = `/room/${code}`
      try {
        const ch = new BroadcastChannel(`fg-party-${party.partyId}`)
        ch.postMessage({ type: 'pull', path, prompt: 'join' })
        ch.close()
      } catch {
        // ignore
      }
      void publishPartyInvite({
        v: 1,
        partyId: party.partyId,
        code,
        path,
        prompt: 'join',
        title: room.title,
        updatedAt: Date.now(),
      }).catch(() => {})
      setActiveSession({
        code,
        name,
        title: room.title,
        kind: 'neighborhood',
        partyId: party.partyId,
        prompt: 'join',
        path,
        updatedAt: Date.now(),
      })
    }
    navigate(`/room/${code}?host=1`)
  }

  const longGameWarn = jackpot && buildingSupply === 'unlimited'

  return (
    <main className="page narrow">
      <Link to="/games" className="back">
        Games
      </Link>
      <div className="panel">
        <h1>Neighborhood</h1>
        <p className="muted">
          Rules lock when the room starts. Team style cannot change later.
        </p>

        <label className="field">
          <span>Game title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={48} />
        </label>

        <h2 className="section-heading">Teams</h2>
        <div className="chip-row">
          {(
            [
              ['off', 'Off (Solo)'],
              ['shared', 'Shared tray'],
              ['alliance', 'Alliance'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`chip ${teamStyle === id ? 'selected' : ''}`}
              onClick={() => setTeamStyle(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {teamStyle === 'shared' ? (
          <p className="muted">Pairs share one piece and wallet. Up to 16 phones (8 trays).</p>
        ) : null}
        {teamStyle === 'alliance' ? (
          <>
            <p className="muted">
              Own piece and cash. Allies skip rent and seat-to-seat card pays. Trades allowed.
            </p>
            <div className="chip-row">
              {ALLIANCE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`chip ${alliancePreset === p.id ? 'selected' : ''}`}
                  onClick={() => setAlliancePreset(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </>
        ) : null}
        {teamStyle === 'off' ? (
          <p className="muted">Everyone solo — max 8 pieces.</p>
        ) : null}

        <h2 className="section-heading">House rules</h2>
        <label className="check-row">
          <input type="checkbox" checked={noAuctions} onChange={(e) => setNoAuctions(e.target.checked)} />
          <span>No Auctions</span>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={jackpot} onChange={(e) => setJackpot(e.target.checked)} />
          <span>Jackpot (Town Square)</span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={landHomeDouble}
            onChange={(e) => setLandHomeDouble(e.target.checked)}
          />
          <span>Land on Home pays double</span>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={jailBlock} onChange={(e) => setJailBlock(e.target.checked)} />
          <span>Jail Block (no rent while in jail)</span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={unmortgageTenPercent}
            onChange={(e) => setUnmortgageTenPercent(e.target.checked)}
          />
          <span>10% to unmortgage (booklet)</span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={stopAtFirstBankruptcy}
            onChange={(e) => setStopAtFirstBankruptcy(e.target.checked)}
          />
          <span>Stop at the first bankruptcy</span>
        </label>

        <label className="field">
          <span>Starting deeds per tray</span>
          <select
            value={startingDeeds}
            onChange={(e) => setStartingDeeds(Number(e.target.value) as 0 | 1 | 2)}
          >
            <option value={0}>None</option>
            <option value={1}>One</option>
            <option value={2}>Two</option>
          </select>
        </label>

        <label className="field">
          <span>Building supply</span>
          <select
            value={buildingSupply}
            onChange={(e) => setBuildingSupply(e.target.value as BuildingSupply)}
          >
            {SUPPLY.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        {longGameWarn ? (
          <p className="warn-banner">Jackpot + Unlimited buildings can make a long game.</p>
        ) : null}

        <h2 className="section-heading">Disconnect grace</h2>
        <label className="field">
          <span>Minutes before owner may remove (default {DEFAULT_DISCONNECT_GRACE_MS / 60000})</span>
          <input
            type="number"
            min={1}
            max={60}
            value={graceMin}
            onChange={(e) => setGraceMin(Number(e.target.value) || 5)}
          />
        </label>

        <button type="button" className="btn primary" onClick={start}>
          Create room
        </button>
      </div>
    </main>
  )
}
