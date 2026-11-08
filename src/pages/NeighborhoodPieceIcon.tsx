import type { NeighborhoodPieceId } from '../core/neighborhood/types'

const COLORS: Record<NeighborhoodPieceId, string> = {
  fox: '#c45c26',
  owl: '#5c6b7a',
  turtle: '#2f7a4a',
  kite: '#c43b5c',
  sailboat: '#2a6f9e',
  lantern: '#b8860b',
  acorn: '#8b5a2b',
  moon: '#6b5b95',
}

/** Original simple SVG tokens — not licensed art. */
export function NeighborhoodPieceIcon(props: {
  pieceId: NeighborhoodPieceId
  size?: number
  title?: string
}) {
  const { pieceId, size = 18, title } = props
  const fill = COLORS[pieceId]
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 32 32',
    'aria-hidden': title ? undefined : true,
    role: title ? 'img' : undefined,
  } as const

  switch (pieceId) {
    case 'fox':
      return (
        <svg {...common}>
          {title ? <title>{title}</title> : null}
          <path fill={fill} d="M4 26 L8 12 L16 18 L24 12 L28 26 L16 22 Z" />
          <circle fill="#1a1a1a" cx="12" cy="18" r="1.2" />
          <circle fill="#1a1a1a" cx="20" cy="18" r="1.2" />
        </svg>
      )
    case 'owl':
      return (
        <svg {...common}>
          {title ? <title>{title}</title> : null}
          <ellipse fill={fill} cx="16" cy="18" rx="9" ry="10" />
          <circle fill="#f5f0e6" cx="12" cy="15" r="3.5" />
          <circle fill="#f5f0e6" cx="20" cy="15" r="3.5" />
          <circle fill="#1a1a1a" cx="12" cy="15" r="1.4" />
          <circle fill="#1a1a1a" cx="20" cy="15" r="1.4" />
          <path fill="#1a1a1a" d="M14 20 L16 23 L18 20 Z" />
        </svg>
      )
    case 'turtle':
      return (
        <svg {...common}>
          {title ? <title>{title}</title> : null}
          <ellipse fill={fill} cx="16" cy="17" rx="10" ry="7" />
          <circle fill={fill} cx="26" cy="16" r="3.5" />
          <circle fill="#1a1a1a" cx="27" cy="15" r="0.8" />
          <path fill="#1f5a35" d="M10 14 L14 12 L18 14 L22 12 L22 18 L10 18 Z" opacity="0.45" />
        </svg>
      )
    case 'kite':
      return (
        <svg {...common}>
          {title ? <title>{title}</title> : null}
          <path fill={fill} d="M16 4 L26 16 L16 28 L6 16 Z" />
          <path stroke="#1a1a1a" strokeWidth="1.2" fill="none" d="M16 28 Q18 30 14 32" />
        </svg>
      )
    case 'sailboat':
      return (
        <svg {...common}>
          {title ? <title>{title}</title> : null}
          <path fill={fill} d="M16 6 L16 22 L26 22 Z" />
          <path fill="#2a4050" d="M6 24 L26 24 L22 28 L10 28 Z" />
        </svg>
      )
    case 'lantern':
      return (
        <svg {...common}>
          {title ? <title>{title}</title> : null}
          <rect fill={fill} x="10" y="10" width="12" height="14" rx="2" />
          <rect fill="#f5e6a8" x="12" y="13" width="8" height="8" rx="1" />
          <path fill="#1a1a1a" d="M14 6 H18 V10 H14 Z" />
          <path stroke="#1a1a1a" strokeWidth="1.5" fill="none" d="M16 4 Q20 4 20 7" />
        </svg>
      )
    case 'acorn':
      return (
        <svg {...common}>
          {title ? <title>{title}</title> : null}
          <path fill={fill} d="M10 14 Q16 8 22 14 L22 18 Q16 28 10 18 Z" />
          <ellipse fill="#5c3a1e" cx="16" cy="12" rx="7" ry="4" />
          <path stroke="#5c3a1e" strokeWidth="2" fill="none" d="M16 8 V5" />
        </svg>
      )
    case 'moon':
      return (
        <svg {...common}>
          {title ? <title>{title}</title> : null}
          <path
            fill={fill}
            d="M18 4 A12 12 0 1 0 18 28 A9 9 0 1 1 18 4"
          />
        </svg>
      )
  }
}
