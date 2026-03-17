import type { FileEvent } from './useTransferSession'
import { formatSenderName } from './protocol'

type Props = {
  event: FileEvent
  onDownloadIncoming: (id: string) => void
  onDownloadOutgoing: (id: string) => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0 || !Number.isFinite(bytesPerSecond)) return ''
  if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} B/s`
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`
}

function formatRemaining(bytes: number): string {
  if (bytes <= 0) return ''
  return `${formatSize(bytes)} left`
}

function progressAriaLabelFor(
  action: 'Sending' | 'Receiving',
  name: string,
  remaining: number,
): string {
  if (remaining <= 0) return `${action} ${name}`
  return `${action} ${name}, ${formatRemaining(remaining)}`
}

function FileIcon() {
  return (
    <div className="file-item-icon" aria-hidden>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    </div>
  )
}

export function FileMessageCard({ event, onDownloadIncoming, onDownloadOutgoing }: Props) {
  const showSpeed = !event.done && event.speed != null && event.speed > 0
  const remainingText = !event.done && event.remaining > 0 ? formatRemaining(event.remaining) : null
  const senderDisplay = event.senderName ? formatSenderName(event.senderName) : null

  const progressValue = event.progress * event.size
  const progressAriaLabel = progressAriaLabelFor(
    event.direction === 'in' ? 'Receiving' : 'Sending',
    event.name,
    event.remaining,
  )

  const handleDownload = () => {
    if (event.direction === 'in') onDownloadIncoming(event.transferId)
    else onDownloadOutgoing(event.transferId)
  }

  return (
    <li className={`message-item message-item--${event.direction} message-item--file`} data-direction={event.direction}>
      <div className="message-item-content">
        {senderDisplay && (
          <span className="message-sender" aria-label={`From ${senderDisplay}`}>
            {senderDisplay}:
          </span>
        )}
        <div className={`file-item file-item--${event.direction}`}>
          <FileIcon />
          <div className="file-item-info">
            <span className="file-item-name">{event.name}</span>
            <div className="file-item-meta" aria-live="polite">
              <span className="file-item-size">{formatSize(event.size)}</span>
              {remainingText != null && (
                <span className="file-item-remaining" aria-label={remainingText}>
                  {remainingText}
                </span>
              )}
              {showSpeed && (
                <span className="file-item-speed" aria-label={`Speed ${formatSpeed(event.speed!)}`}>
                  {formatSpeed(event.speed!)}
                </span>
              )}
            </div>
          </div>
          {!event.done ? (
            <progress
              className="file-progress"
              value={progressValue}
              max={event.size}
              aria-label={progressAriaLabel}
            />
          ) : (
            <button type="button" className="btn btn-download" onClick={handleDownload} aria-label={`Download ${event.name}`}>
              Download
            </button>
          )}
        </div>
        <div className="message-item-footer">
          <time className="message-time" dateTime={new Date(event.at).toISOString()}>
            {new Date(event.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </time>
        </div>
      </div>
    </li>
  )
}
