import { BOARD, spaceAt, type SpaceDef } from '../core/neighborhood/board'
import { jackpotFaceLabel } from '../core/neighborhood/jackpotFace'
import { formatCash } from '../core/neighborhood/money'
import { PIECE_LABELS, type NeighborhoodPieceId } from '../core/neighborhood/types'
import type { NeighborhoodGame } from '../core/neighborhood/gameTypes'
import { NeighborhoodPieceIcon } from './NeighborhoodPieceIcon'

/** Map board index → CSS grid cell (11×11, GO bottom-left, clockwise). */
function cellForIndex(index: number): { col: number; row: number } {
  if (index >= 0 && index <= 10) return { col: index + 1, row: 11 }
  if (index >= 11 && index <= 20) return { col: 11, row: 11 - (index - 10) }
  if (index >= 21 && index <= 30) return { col: 11 - (index - 20), row: 1 }
  // 31–39
  return { col: 1, row: index - 29 }
}

function groupClass(space: SpaceDef): string {
  if (space.kind === 'property') return `grp-${space.group}`
  if (space.kind === 'line') return 'grp-line'
  if (space.kind === 'works') return 'grp-works'
  if (space.kind === 'home') return 'grp-home'
  if (space.kind === 'jail') return 'grp-jail'
  if (space.kind === 'town-square') return 'grp-square'
  if (space.kind === 'goto-jail') return 'grp-goto'
  if (space.kind === 'tax' || space.kind === 'fee') return 'grp-fee'
  if (space.kind === 'wild') return 'grp-wild'
  if (space.kind === 'neighbor') return 'grp-neighbor'
  return ''
}

function shortName(name: string): string {
  if (name.length <= 11) return name
  return name.replace(/\s+/g, ' ').slice(0, 10) + '…'
}

export function NeighborhoodBoard(props: {
  game: NeighborhoodGame
  jackpotEnabled: boolean
}) {
  const { game, jackpotEnabled } = props
  const pot = jackpotFaceLabel(game.jackpot)

  return (
    <div className="nb-square-board" role="grid" aria-label="Neighborhood board">
      {BOARD.map((space) => {
        const { col, row } = cellForIndex(space.index)
        const here = Object.values(game.trays).filter(
          (t) => !t.spectating && !t.bankrupt && t.position === space.index,
        )
        const deed = game.deeds[space.index]
        const ownerPiece = deed?.ownerTrayId
          ? game.trays[deed.ownerTrayId]?.pieceId
          : null
        const isCorner = [0, 10, 20, 30].includes(space.index)
        return (
          <div
            key={space.index}
            className={`nb-cell ${groupClass(space)} ${isCorner ? 'corner' : ''} ${here.length ? 'has-token' : ''}`}
            style={{ gridColumn: col, gridRow: row }}
            role="gridcell"
            title={space.name}
          >
            <span className="nb-cell-name">{shortName(space.name)}</span>
            {deed?.ownerTrayId && ownerPiece ? (
              <span className="nb-cell-owner" title={PIECE_LABELS[ownerPiece]}>
                <NeighborhoodPieceIcon pieceId={ownerPiece} size={12} />
                {deed.mortgaged ? 'M' : ''}
                {deed.hotel ? 'H' : deed.houses > 0 ? String(deed.houses) : ''}
              </span>
            ) : null}
            {here.length > 0 ? (
              <span className="nb-cell-tokens">
                {here.map((t) => (
                  <NeighborhoodPieceIcon
                    key={t.id}
                    pieceId={t.pieceId}
                    size={16}
                    title={PIECE_LABELS[t.pieceId]}
                  />
                ))}
              </span>
            ) : null}
          </div>
        )
      })}

      <div className="nb-board-center" style={{ gridColumn: '2 / 11', gridRow: '2 / 11' }}>
        <p className="nb-center-title">Neighborhood</p>
        {jackpotEnabled ? (
          <div className="nb-jackpot-face" aria-label={`Jackpot ${pot.digits}`}>
            {pot.face == null ? (
              <p className="muted">Jackpot empty</p>
            ) : (
              <>
                <div className="nb-jackpot-bill">
                  <span className="nb-jackpot-bill-face">{formatCash(pot.face)}</span>
                  <span className="nb-jackpot-bill-tag">Town Square</span>
                </div>
                <p className="nb-jackpot-digits">{pot.digits}</p>
              </>
            )}
          </div>
        ) : (
          <p className="muted nb-center-hint">Roll · buy · build</p>
        )}
        <div className="nb-center-legend">
          {(Object.keys(PIECE_LABELS) as NeighborhoodPieceId[]).map((id) => {
            const onBoard = Object.values(game.trays).some((t) => t.pieceId === id && !t.spectating)
            if (!onBoard) return null
            return (
              <span key={id} className="nb-legend-item">
                <NeighborhoodPieceIcon pieceId={id} size={14} />
                {PIECE_LABELS[id]}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Tiny board preview helper for space name lookup in other panels */
export function spaceTitle(index: number): string {
  return spaceAt(index).name
}
