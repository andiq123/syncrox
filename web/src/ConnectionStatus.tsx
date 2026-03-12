import type { ConnectionState } from './useSocket'

type Props = {
  state: ConnectionState
  peerName?: string | null
}

function statusLabel(state: ConnectionState, peerName: string | null | undefined): string {
  switch (state) {
    case 'connected':
      return peerName ? `Connected as ${peerName.replace(/_/g, ' ')}` : 'Connected'
    case 'connecting':
    case 'reconnecting':
      return 'Connecting…'
    default:
      return 'Disconnected'
  }
}

export function ConnectionStatus({ state, peerName }: Props) {
  return (
    <div className="connection-status" aria-live="polite">
      <span className="connection-status-session">Session</span>
      <span className={`connection-dot connection-dot--${state}`} aria-hidden />
      <span className="connection-status-label">{statusLabel(state, peerName)}</span>
    </div>
  )
}
