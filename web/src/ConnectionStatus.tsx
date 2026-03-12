import type { ConnectionState } from './useSocket'

type Props = {
  state: ConnectionState
}

function statusLabel(state: ConnectionState): string {
  switch (state) {
    case 'connected':
      return 'Connected'
    case 'connecting':
    case 'reconnecting':
      return 'Connecting…'
    default:
      return 'Disconnected'
  }
}

export function ConnectionStatus({ state }: Props) {
  return (
    <div className="connection-status" aria-live="polite">
      <span className="connection-status-session">Session</span>
      <span className={`connection-dot connection-dot--${state}`} aria-hidden />
      <span className="connection-status-label">{statusLabel(state)}</span>
    </div>
  )
}
