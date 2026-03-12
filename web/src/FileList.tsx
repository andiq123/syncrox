type Incoming = {
  transferId: string
  name: string
  size: number
  done: boolean
  progress: number
  remaining: number
  speed?: number
}

type Outgoing = {
  transferId: string
  name: string
  size: number
  sent: number
  done: boolean
  remaining: number
  speed?: number
}

type Props = {
  incoming: Incoming[]
  outgoing: Outgoing[]
  chunkSize: number
  onDownloadIncoming: (transferId: string) => void
  onDownloadOutgoing: (transferId: string) => void
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

export function FileList({
  incoming,
  outgoing,
  chunkSize,
  onDownloadIncoming,
  onDownloadOutgoing,
}: Props) {
  const hasFiles = incoming.length > 0 || outgoing.length > 0

  return (
    <div className="file-list">
      <div className="file-list-head">
        <h3 className="file-list-title">Recent Files</h3>
      </div>
      {!hasFiles ? (
        <p className="file-list-empty">Drop files or use the button below</p>
      ) : (
        <ul className="file-list-ul" aria-label="File transfers">
          {outgoing.map((f) => (
            <li key={f.transferId} className="file-item file-item--out">
              <FileIcon />
              <div className="file-item-info">
                <span className="file-item-name">{f.name}</span>
                <div className="file-item-meta" aria-live="polite">
                  <span className="file-item-size">{formatSize(f.size)}</span>
                  {!f.done && f.remaining > 0 && (
                    <span className="file-item-remaining" aria-label={formatRemaining(f.remaining)}>
                      {formatRemaining(f.remaining)}
                    </span>
                  )}
                  {!f.done && f.speed != null && f.speed > 0 && (
                    <span className="file-item-speed" aria-label={`Speed ${formatSpeed(f.speed)}`}>
                      {formatSpeed(f.speed)}
                    </span>
                  )}
                </div>
              </div>
              {!f.done ? (
                <progress
                  className="file-progress"
                  value={f.sent * chunkSize}
                  max={f.size}
                  aria-label={`Sending ${f.name}, ${formatRemaining(f.remaining)}`}
                />
              ) : (
                <button
                  type="button"
                  className="btn btn-download"
                  onClick={() => onDownloadOutgoing(f.transferId)}
                >
                  Download
                </button>
              )}
            </li>
          ))}
          {incoming.map((f) => (
            <li key={f.transferId} className="file-item file-item--in">
              <FileIcon />
              <div className="file-item-info">
                <span className="file-item-name">{f.name}</span>
                <div className="file-item-meta" aria-live="polite">
                  <span className="file-item-size">{formatSize(f.size)}</span>
                  {!f.done && f.remaining > 0 && (
                    <span className="file-item-remaining" aria-label={formatRemaining(f.remaining)}>
                      {formatRemaining(f.remaining)}
                    </span>
                  )}
                  {!f.done && f.speed != null && f.speed > 0 && (
                    <span className="file-item-speed" aria-label={`Speed ${formatSpeed(f.speed)}`}>
                      {formatSpeed(f.speed)}
                    </span>
                  )}
                </div>
              </div>
              {!f.done ? (
                <progress
                  className="file-progress"
                  value={f.progress * f.size}
                  max={f.size}
                  aria-label={`Receiving ${f.name}, ${formatRemaining(f.remaining)}`}
                />
              ) : (
                <button
                  type="button"
                  className="btn btn-download"
                  onClick={() => onDownloadIncoming(f.transferId)}
                >
                  Download
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
