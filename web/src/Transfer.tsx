import { ConnectionStatus } from './ConnectionStatus'
import { MessagingPanel } from './MessagingPanel'
import { useTransferSession } from './useTransferSession'

function ConnectionErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="transfer-error" role="alert" aria-live="assertive">
      <span className="transfer-error-text">{message}</span>
      <button
        type="button"
        className="btn btn-ghost btn-small transfer-error-retry"
        onClick={onRetry}
        aria-label="Retry connection"
      >
        Retry
      </button>
    </div>
  )
}

export function Transfer() {
  const {
    state,
    restart,
    connectionError,
    peerName,
    peerComposing,
    purgeSession,
    sendText,
    sendComposing,
    sendFiles,
    downloadIncoming,
    downloadOutgoing,
    timelineEvents,
  } = useTransferSession()

  return (
    <div className="transfer">
      <a href="#transfer-main" className="skip-link">
        Skip to main content
      </a>
      <header className="transfer-header" role="banner">
        <ConnectionStatus state={state} peerName={peerName} />
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={purgeSession}
          aria-label="Purge session and start fresh"
        >
          Start fresh
        </button>
      </header>

      {connectionError && (
        <ConnectionErrorBanner message={connectionError} onRetry={restart} />
      )}

      <MessagingPanel
        events={timelineEvents}
        peerComposing={peerComposing}
        disabled={state !== 'connected'}
        onSendText={sendText}
        onSendFiles={sendFiles}
        onComposingChange={sendComposing}
        onDownloadIncoming={downloadIncoming}
        onDownloadOutgoing={downloadOutgoing}
      />
    </div>
  )
}
