/**
 * In-app update notes. Home shows these as UP #<version>.
 *
 * Version is its own counter. The GitHub PR number is only `pr` (a reference).
 * Early 0.0.x notes happened to match PR numbers — leave those as history.
 * Do not set new versions from the PR number.
 *
 * PR path (always first):
 * 1. List open PRs against main.
 * 2. If one already covers this work, stay on that branch. Edit that entry’s
 *    bullets only. Do not open another PR and do not bump `version`.
 * 3. If none covers it, branch from main, open one PR, then add a new entry
 *    at the top of UPDATES.
 *
 * Version on that new entry:
 * - Default: `nextPatchVersion(latestVersion())` — last segment + 1
 *   (0.0.20 → 0.0.21, 0.1.3 → 0.1.4, 1.0.0 → 1.0.1).
 * - Only when asked for a new line (0.1.0 or 1.0.0): use that version exactly.
 *   The old line stops. The next default bump restarts on the new line
 *   (0.1.0 → 0.1.1, not another 0.0.x).
 * - Set `pr` to the real PR number. It may differ from the version.
 *
 * Copy is for players (Added / Updated / Removed): short, concrete, no file
 * or protocol jargon. Skip a new entry when nothing player-visible changed.
 */

export interface UpdateNotes {
  /** Display id, e.g. "0.0.21" or "0.1.0". Not the PR number. */
  version: string
  /** GitHub PR that shipped this note. Reference only. */
  pr: number
  title: string
  added: string[]
  updated: string[]
  removed: string[]
}

/** Newest first. Only append at the top when opening a brand-new PR. */
export const UPDATES: UpdateNotes[] = [
  {
    version: '0.0.19',
    pr: 19,
    title: 'Neighborhood deeds, board inspect, and trade popups',
    added: [
      'Deeds tab for holdings, jail-free cards, and property management',
      'Board-tap deed cards with rent ladder, owner, and color-set roster',
      'Buy popup with full deed stats and set ownership before you decide',
      'Trade compose popup; sent offers pop on the other phone on any tab',
    ],
    updated: [
      'Tokens finish dice/step movies before buy and other action prompts appear',
      'Your deeds list groups by color set with price, buildings, and mortgage',
      'Accepted trades list only what moved (no empty $0 lines)',
    ],
    removed: [],
  },
  {
    version: '0.0.17',
    pr: 17,
    title: 'Reliable scorecard joins past six players',
    added: [],
    updated: [
      'Join retries when your seat is missing from the roster (dropped MQTT joins)',
      'Room actions publish at MQTT qos 1 so joins are less likely to vanish',
    ],
    removed: [],
  },
  {
    version: '0.0.16',
    pr: 16,
    title: 'Neighborhood board clockwise layout',
    added: [],
    updated: [
      'Board places Home bottom-right with spaces running clockwise (classic ring order)',
      'Line names match their edges (South / West / North / East)',
    ],
    removed: [],
  },
  {
    version: '0.0.15',
    pr: 15,
    title: 'Fix MQTT progress scoring after Neighborhood',
    added: [],
    updated: [
      'Room sync progress scoring narrows by game kind so Neighborhood builds typecheck',
    ],
    removed: [],
  },
  {
    version: '0.0.14',
    pr: 14,
    title: 'Neighborhood full multiplayer game',
    added: [
      'Neighborhood under Games — create room with locked house rules',
      'Lobby seating: original pieces, Solo / Shared tray / Alliance styles',
      'Disconnect grace minutes tunable at create (default 5)',
      'Owner-away countdown banner using existing claim-host handoff',
      'Host crypto dice, 40-space board, buy/auction, rent, Home, jail, cards',
      'Shared trays (first legal tap) and alliance rent skips on the live board',
      'Digit wallets, public positions/owners, and a short event log',
      'Build/sell evenly, mortgage/unmortgage, trades, and a debt cover screen',
      'Leave with gift → spectate; disconnect grace countdown + owner Remove',
      'Late join: open during first round, then owner Accept/Decline (cash only)',
      'Per-client animation queue (dice, steps, bills, cards) with seat cameras',
      'Matching Web Audio cues; Settings mute; refresh skips movies',
      '2D square board with color spaces and original SVG piece tokens',
      'Town Square jackpot costume bill face + climbing digit total',
      'Starting deeds deal (0/1/2) at printed price with unaffordable redraw',
      'Closest-cover leave settlement before gift; bank/jackpot debt is cash-only',
      'Hotel sell-back respects bank houses; straight-to-hotel when houses are gone',
      'Create option: Last Alive (default) or First Bankruptcy (equity winners)',
      'Spectating label; jail-free in trades; frozen trade reserves; pay-each movies',
      'Piece steps one space at a time after the dice tumble',
    ],
    updated: [
      'Games hub lists Neighborhood beside Hot Potato',
    ],
    removed: [],
  },
  {
    version: '0.0.13',
    pr: 13,
    title: 'Live round sync for everyone',
    added: [
      'Reliable sync sequence so phones pick up every host publish (next round, scores, finish)',
    ],
    updated: [
      'Connected players now refresh when the game master starts the next round',
      'Stronger MQTT delivery for room state updates',
    ],
    removed: [],
  },
  {
    version: '0.0.12',
    pr: 12,
    title: 'In-app update notes',
    added: [
      'First-open update prompt after a deploy (What’s new overlay)',
      'Stacks every missed update newest → oldest in one scrollable sheet',
      'Close with the X or by scrolling to Continue',
    ],
    updated: [
      'Home shows pending updates before you jump into Games / Scorecards',
    ],
    removed: [],
  },
  {
    version: '0.0.11',
    pr: 11,
    title: 'Settings, leave handoff, and smarter resume',
    added: [
      'Settings tab (Main | Score | Settings) with room code and Leave game',
      'Host leave flow: tap an active player to promote, then Leave arms',
      'Continue Game for everyone after swipe-out (hosts reclaim with ?host=1)',
      'Auto host handoff after 5 minutes away (or immediately if the game already ended)',
    ],
    updated: [
      'Hero name under your score stays hidden until after round 1',
      'Top-right shows your name and place instead of a second 1st-place callout',
      'Same Players restarts the lobby and drops inactive seats',
    ],
    removed: [
      'Duplicate “is in 1st!” banner on the main scorecard view',
      'Leave / code clutter from the main play tab (moved into Settings)',
    ],
  },
]

export function versionLabel(version: string): string {
  return `UP #${version}`
}

/** Numeric compare for 0.0.N versions (and future x.y.z). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number(n) || 0)
  const pb = b.split('.').map((n) => Number(n) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export function latestVersion(): string | null {
  return UPDATES[0]?.version ?? null
}

/**
 * Next note on the current line. Does not read the PR number.
 * 0.0.20 → 0.0.21, 0.1.0 → 0.1.1, 1.0.0 → 1.0.1.
 * A requested 0.1.0 / 1.0.0 is set by hand; later bumps use this.
 */
export function nextPatchVersion(current: string | null | undefined): string {
  if (!current) return '0.0.1'
  const parts = current.split('.').map((n) => Number.parseInt(n, 10))
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n))) return '0.0.1'
  while (parts.length < 3) parts.push(0)
  parts[parts.length - 1] = (parts[parts.length - 1] ?? 0) + 1
  return parts.join('.')
}

/** Unseen updates, newest → oldest. */
export function unseenUpdates(lastSeen: string | null): UpdateNotes[] {
  if (!UPDATES.length) return []
  if (!lastSeen) return [...UPDATES]
  return UPDATES.filter((u) => compareVersions(u.version, lastSeen) > 0)
}
