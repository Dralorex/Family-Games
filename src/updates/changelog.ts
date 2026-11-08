/**
 * In-app update notes.
 *
 * Version format: UP #0.0.<PR_NUMBER>  (e.g. PR #12 → 0.0.12)
 *
 * Workflow for agents / contributors:
 * 1. Check open PRs against main first.
 * 2. If an unmerged feature PR is already open for this work, add/update its
 *    entry here on that same branch (same 0.0.<pr#>).
 * 3. If all related PRs are merged, open a new PR, use that PR number as
 *    0.0.<pr#>, and add a new entry at the top of UPDATES.
 */

export interface UpdateNotes {
  /** Display / compare id, e.g. "0.0.12" */
  version: string
  pr: number
  title: string
  added: string[]
  updated: string[]
  removed: string[]
}

/** Newest first. Only append at the top when opening a brand-new PR. */
export const UPDATES: UpdateNotes[] = [
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

/** Unseen updates, newest → oldest. */
export function unseenUpdates(lastSeen: string | null): UpdateNotes[] {
  if (!UPDATES.length) return []
  if (!lastSeen) return [...UPDATES]
  return UPDATES.filter((u) => compareVersions(u.version, lastSeen) > 0)
}
