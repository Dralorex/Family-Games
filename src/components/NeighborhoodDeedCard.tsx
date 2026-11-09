import { isDeedSpace, spaceAt } from '../core/neighborhood/board'
import {
  buildingLabel,
  currentRentAmount,
  formatDeedPriceLine,
  groupOwnershipLines,
  rentRowsForSpace,
  trayDisplayName,
} from '../core/neighborhood/deedInfo'
import type { NeighborhoodGame, TrayId } from '../core/neighborhood/gameTypes'
import { formatCash } from '../core/neighborhood/money'

export function NeighborhoodDeedCard(props: {
  game: NeighborhoodGame
  spaceIndex: number
  names: Record<string, string>
  myTrayId?: TrayId
  /** Show set/line/works roster */
  showGroup?: boolean
  compact?: boolean
}) {
  const { game, spaceIndex, names, myTrayId, showGroup = true, compact = false } = props
  const space = spaceAt(spaceIndex)
  const deed = game.deeds[spaceIndex]
  const rents = rentRowsForSpace(game, spaceIndex)
  const current = currentRentAmount(game, spaceIndex)
  const group = showGroup ? groupOwnershipLines(game, spaceIndex, names, myTrayId) : null

  const ownerLine = !isDeedSpace(space)
    ? null
    : !deed?.ownerTrayId
      ? 'Unowned'
      : `${trayDisplayName(game, deed.ownerTrayId, names)}${
          myTrayId && deed.ownerTrayId === myTrayId ? ' (you)' : ''
        }`

  return (
    <article className={`nb-deed-card ${compact ? 'compact' : ''} ${space.kind === 'property' ? `grp-${space.group}` : space.kind === 'line' ? 'grp-line' : space.kind === 'works' ? 'grp-works' : ''}`}>
      <header className="nb-deed-card-head">
        <h3 className="nb-deed-card-title">{space.name}</h3>
        {isDeedSpace(space) ? (
          <p className="nb-deed-card-price">{formatDeedPriceLine(space)}</p>
        ) : (
          <p className="muted nb-deed-card-price">{space.kind.replace('-', ' ')}</p>
        )}
      </header>

      {isDeedSpace(space) && deed ? (
        <p className="nb-deed-card-status">
          {ownerLine}
          {deed.mortgaged ? ' · mortgaged' : ''}
          {space.kind === 'property' ? ` · ${buildingLabel(deed)}` : ''}
          {current != null && !deed.mortgaged ? ` · rent ${formatCash(current)}` : ''}
        </p>
      ) : null}

      {rents.length > 0 ? (
        <ul className="nb-deed-rent-list">
          {rents.map((row) => (
            <li key={row.label} className={row.current ? 'current' : undefined}>
              <span>{row.label}</span>
              <span>{formatCash(row.amount)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {space.kind === 'property' ? (
        <p className="muted nb-deed-house-cost">House {formatCash(space.houseCost)}</p>
      ) : null}

      {group ? (
        <div className="nb-deed-group">
          <p className="nb-deed-group-title">{group.title}</p>
          <ul>
            {group.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  )
}
