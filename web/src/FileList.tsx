import { useRef, useState, useEffect } from 'react'

type Incoming = {
  transferId: string
  name: string
  size: number
  done: boolean
  progress: number
  remaining: number
  speed?: number
  senderName?: string | null
}

type Outgoing = {
  transferId: string
  name: string
  size: number
  sent: number
  done: boolean
  remaining: number
  speed?: number
  senderName?: string | null
}

type Props = {
  incoming: Incoming[]
  outgoing: Outgoing[]
  chunkSize: number
  onDownloadIncoming: (transferId: string) => void
  onDownloadOutgoing: (transferId: string) => void
}

const FILE_ENTER_ANIMATION_MS = 280

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

type FileListItemProps = {
  name: string
  size: number
  done: boolean
  remaining: number
  speed?: number
  senderName?: string | null
  direction: 'in' | 'out'
  progressValue: number
  progressMax: number
  progressAriaLabel: string
  onDownload: () => void
  entering?: boolean
}

function formatSender(senderName: string): string {
  return senderName.replace(/_/g, ' ')
}

function FileListItem({
  name,
  size,
  done,
  remaining,
  speed,
  senderName,
  direction,
  progressValue,
  progressMax,
  progressAriaLabel,
  onDownload,
  entering,
}: FileListItemProps) {
  const showSpeed = !done && speed != null && speed > 0
  const showRemaining = !done && remaining > 0

  return (
    <li className={`file-item file-item--${direction}${entering ? ' file-item--enter' : ''}`}>
      <FileIcon />
      <div className="file-item-info">
        <span className="file-item-name">{name}</span>
        {senderName && (
          <span className="file-item-sender" aria-label={`From ${formatSender(senderName)}`}>
            from {formatSender(senderName)}
          </span>
        )}
        <div className="file-item-meta" aria-live="polite">
          <span className="file-item-size">{formatSize(size)}</span>
          {showRemaining && (
            <span className="file-item-remaining" aria-label={formatRemaining(remaining)}>
              {formatRemaining(remaining)}
            </span>
          )}
          {showSpeed && (
            <span className="file-item-speed" aria-label={`Speed ${formatSpeed(speed)}`}>
              {formatSpeed(speed)}
            </span>
          )}
        </div>
      </div>
      {!done ? (
        <progress
          className="file-progress"
          value={progressValue}
          max={progressMax}
          aria-label={progressAriaLabel}
        />
      ) : (
        <button type="button" className="btn btn-download" onClick={onDownload}>
          Download
        </button>
      )}
    </li>
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
  const prevIdsRef = useRef<Set<string>>(new Set())
  const [enteringIds, setEnteringIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const current = new Set([
      ...outgoing.map((o) => o.transferId),
      ...incoming.map((i) => i.transferId),
    ])
    const prev = prevIdsRef.current
    const added = new Set([...current].filter((id) => !prev.has(id)))
    if (added.size > 0) setEnteringIds(added)
    prevIdsRef.current = current
  }, [incoming, outgoing])

  useEffect(() => {
    if (enteringIds.size === 0) return
    const t = setTimeout(() => setEnteringIds(new Set()), FILE_ENTER_ANIMATION_MS)
    return () => clearTimeout(t)
  }, [enteringIds])

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
            <FileListItem
              key={f.transferId}
              name={f.name}
              size={f.size}
              done={f.done}
              remaining={f.remaining}
              speed={f.speed}
              senderName={f.senderName}
              direction="out"
              progressValue={f.sent * chunkSize}
              progressMax={f.size}
              progressAriaLabel={`Sending ${f.name}, ${formatRemaining(f.remaining)}`}
              onDownload={() => onDownloadOutgoing(f.transferId)}
              entering={enteringIds.has(f.transferId)}
            />
          ))}
          {incoming.map((f) => (
            <FileListItem
              key={f.transferId}
              name={f.name}
              size={f.size}
              done={f.done}
              remaining={f.remaining}
              speed={f.speed}
              senderName={f.senderName}
              direction="in"
              progressValue={f.progress * f.size}
              progressMax={f.size}
              progressAriaLabel={`Receiving ${f.name}, ${formatRemaining(f.remaining)}`}
              onDownload={() => onDownloadIncoming(f.transferId)}
              entering={enteringIds.has(f.transferId)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
