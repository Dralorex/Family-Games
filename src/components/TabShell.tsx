import type { ReactNode } from 'react'

export function TabShell(props: {
  main: ReactNode
  score: ReactNode
  tab: 'main' | 'score'
  onTab: (tab: 'main' | 'score') => void
}) {
  return (
    <div className="tab-shell">
      <div className="tab-panels">{props.tab === 'main' ? props.main : props.score}</div>
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
      </nav>
    </div>
  )
}
