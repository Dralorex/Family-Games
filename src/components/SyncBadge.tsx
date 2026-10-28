import type { SyncStatus } from '../rooms/mqttSync'

export function SyncBadge({ status }: { status: SyncStatus }) {
  const label =
    status === 'connected'
      ? 'Live'
      : status === 'connecting'
        ? 'Connecting…'
        : status === 'error'
          ? 'Connection issue'
          : 'Reconnecting…'
  return (
    <span className={`sync-badge ${status}`} title={label}>
      {label}
    </span>
  )
}
