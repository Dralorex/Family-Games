const PARTY_KEY = 'fg_active_party'

export interface PartyState {
  partyId: string
  hostId: string
  code: string
}

export function setActiveParty(party: PartyState | null): void {
  if (!party) {
    sessionStorage.removeItem(PARTY_KEY)
    return
  }
  sessionStorage.setItem(PARTY_KEY, JSON.stringify(party))
}

export function getActiveParty(): PartyState | null {
  try {
    const raw = sessionStorage.getItem(PARTY_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PartyState
  } catch {
    return null
  }
}
