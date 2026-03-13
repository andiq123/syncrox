import { useState, useCallback, useLayoutEffect, useRef, useEffect, type ReactNode } from 'react'

type MessageItem = {
  id: string
  body: string
  at: number
  direction: 'out' | 'in'
  senderName?: string | null
}

type Props = {
  messages: MessageItem[]
}

type Segment = { type: 'text' | 'code'; content: string }

function parseMessageSegments(body: string): Segment[] {
  const parts = body.split('```')
  if (parts.length === 1) return [{ type: 'text', content: body }]
  const segments: Segment[] = []
  for (let i = 0; i < parts.length; i++) {
    const content = parts[i]
    if (content === '') continue
    const trimmed = i % 2 === 1 ? content.replace(/^\n+|\n+$/g, '') : content
    if (trimmed === '') continue
    segments.push({ type: i % 2 === 0 ? 'text' : 'code', content: trimmed })
  }
  return segments
}

function isCodeOnlyMessage(body: string): boolean {
  const segments = parseMessageSegments(body)
  return segments.length === 1 && segments[0].type === 'code'
}

function renderTextWithInlineCode(text: string, keyPrefix: string): ReactNode[] {
  const re = /(`+)([^`]+)\1/g
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let keyIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      nodes.push(
        <span key={`${keyPrefix}-${keyIndex++}`} className="message-text">
          {text.slice(lastIndex, m.index)}
        </span>,
      )
    }
    nodes.push(
      <code key={`${keyPrefix}-${keyIndex++}`} className="message-code-inline">
        {m[2]}
      </code>,
    )
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) {
    nodes.push(
      <span key={`${keyPrefix}-${keyIndex}`} className="message-text">
        {text.slice(lastIndex)}
      </span>,
    )
  }
  return nodes.length > 0 ? nodes : [<span key={keyPrefix} className="message-text">{text}</span>]
}

function CodeBlock({ content }: { content: string }) {
  return (
    <span className="message-code-block-wrap" role="figure" aria-label="Code block">
      <div className="message-code-block-header">
        <span className="message-code-block-dots" aria-hidden>
          <span /><span /><span />
        </span>
        <span className="message-code-block-label">Code</span>
      </div>
      <code className="message-code-block">{content}</code>
    </span>
  )
}

function MessageBody({ body }: { body: string }) {
  const segments = parseMessageSegments(body)
  return (
    <span className="message-body">
      {segments.map((seg, i) =>
        seg.type === 'code' ? (
          <CodeBlock key={i} content={seg.content} />
        ) : (
          <span key={i} className="message-text-wrap">
            {renderTextWithInlineCode(seg.content, `t-${i}`)}
          </span>
        ),
      )}
    </span>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => setCopied(true))
  }, [text])
  return (
    <button
      type="button"
      className={`message-copy-btn${copied ? ' copied' : ''}`}
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : 'Copy message'}
      title={copied ? 'Copied' : 'Copy message'}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

const ENTER_ANIMATION_MS = 280

export function MessageList({ messages }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(0)
  const [enteringId, setEnteringId] = useState<string | null>(null)

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el || messages.length === 0) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  useEffect(() => {
    const count = messages.length
    if (count > prevCountRef.current && count > 0) {
      prevCountRef.current = count
      const last = messages[count - 1]
      setEnteringId(last.id)
      const t = setTimeout(() => setEnteringId(null), ENTER_ANIMATION_MS)
      return () => clearTimeout(t)
    }
    prevCountRef.current = count
  }, [messages])

  return (
    <div ref={listRef} className="message-list" role="log" aria-label="Messages">
      {messages.length === 0 ? (
        <p className="message-list-empty">No messages yet.</p>
      ) : (
        <ul className="message-list-ul">
          {messages.map((m) => {
            const codeOnly = isCodeOnlyMessage(m.body)
            const copyText = codeOnly
              ? (parseMessageSegments(m.body)[0] as Segment).content
              : m.body
            return (
              <li
                key={m.id}
                className={`message-item message-item--${m.direction}${codeOnly ? ' message-item--code-only' : m.body.includes('```') ? ' message-item--has-code' : ''}${enteringId === m.id ? ' message-item--enter' : ''}`}
                data-direction={m.direction}
              >
                <div className="message-item-content">
                  {m.senderName && (
                    <span className="message-sender" aria-label={`From ${m.senderName.replace(/_/g, ' ')}`}>
                      {m.senderName.replace(/_/g, ' ')}:
                    </span>
                  )}
                  {codeOnly ? (
                    <CodeBlock content={copyText} />
                  ) : (
                    <MessageBody body={m.body} />
                  )}
                  <div className="message-item-footer">
                    <time className="message-time" dateTime={new Date(m.at).toISOString()}>
                      {new Date(m.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </time>
                    <CopyButton text={copyText} />
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
