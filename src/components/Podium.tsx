import type { Standing } from '../core/score/types'

export function Podium({ standings, title }: { standings: Standing[]; title?: string }) {
  const top = standings.filter((s) => s.place <= 3)
  return (
    <div className="podium">
      <h2>{title ?? 'Top 3'}</h2>
      <ol>
        {top.map((s) => (
          <li key={s.playerId} data-place={s.place}>
            <span className="place">#{s.place}</span>
            <span className="name">{s.name}</span>
            <span className="total">{s.total}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
