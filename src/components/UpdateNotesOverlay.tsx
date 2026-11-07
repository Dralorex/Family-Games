import { useMemo, useState } from 'react'
import {
  latestVersion,
  unseenUpdates,
  versionLabel,
  type UpdateNotes,
} from '../updates/changelog'
import { getLastSeenUpdate, setLastSeenUpdate } from '../updates/seen'

function Section(props: { heading: string; items: string[] }) {
  if (!props.items.length) return null
  return (
    <div className="update-section">
      <h3>{props.heading}</h3>
      <ul>
        {props.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function UpdateBlock(props: { update: UpdateNotes }) {
  const { update } = props
  return (
    <article className="update-block">
      <header className="update-block-header">
        <p className="update-version">{versionLabel(update.version)}</p>
        <h2>{update.title}</h2>
        <p className="update-pr">PR #{update.pr}</p>
      </header>
      <Section heading="Added" items={update.added} />
      <Section heading="Updated" items={update.updated} />
      <Section heading="Removed" items={update.removed} />
    </article>
  )
}

/** First open after deploy(s): scrollable overlay of unseen UP #0.0.N notes. */
export function UpdateNotesOverlay() {
  const pending = useMemo(() => unseenUpdates(getLastSeenUpdate()), [])
  const [open, setOpen] = useState(() => pending.length > 0)

  if (!open || pending.length === 0) return null

  const dismiss = () => {
    const latest = latestVersion()
    if (latest) setLastSeenUpdate(latest)
    setOpen(false)
  }

  return (
    <div className="update-overlay" role="dialog" aria-modal="true" aria-label="App updates">
      <div className="update-sheet">
        <button type="button" className="update-close" aria-label="Close updates" onClick={dismiss}>
          ×
        </button>
        <div className="update-sheet-scroll">
          <p className="update-eyebrow">What’s new</p>
          {pending.map((u) => (
            <UpdateBlock key={u.version} update={u} />
          ))}
          <button type="button" className="btn primary update-continue" onClick={dismiss}>
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
