import type { ReactNode } from 'react'

export type RoomTab = 'main' | 'score' | 'settings'

export function TabShell(props: {
  main: ReactNode
  score: ReactNode
  settings?: ReactNode
  tab: RoomTab
  onTab: (tab: RoomTab) => void
}) {
  const panel =
    props.tab === 'main' ? props.main : props.tab === 'score' ? props.score : props.settings

  return (
    <div className="tab-shell">
      <div className="tab-panels">{panel}</div>
      <nav className="tab-bar" aria-label="Room tabs">
        <button
          type="button"
          className={props.tab === 'main' ? 'active' : ''}
          onClick={() => props.onTab('main')}
        >
          Main
        </button>
        <button
          type="button"
          className={props.tab === 'score' ? 'active' : ''}
          onClick={() => props.onTab('score')}
        >
          Score
        </button>
        {props.settings ? (
          <button
            type="button"
            className={props.tab === 'settings' ? 'active' : ''}
            onClick={() => props.onTab('settings')}
          >
            Settings
          </button>
        ) : null}
      </nav>
    </div>
  )
}
