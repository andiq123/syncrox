import { useState, useCallback, useLayoutEffect, useRef, useEffect, type ReactNode } from 'react'
import { formatSenderName } from './protocol'

export type MessageItem = {
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

function looksLikePastedCode(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  const lines = trimmed.split('\n')
  if (lines.length >= 2) return true
  if (lines.length === 1 && trimmed.length > 50) {
    const codeLike = /[=(){}$;]|\/\/|\/\*|^#|^\/|^\$|=>|<-|def |function |const |let |var |import |export /
    return codeLike.test(trimmed)
  }
  return false
}

function isCodeOnlyMessage(body: string): boolean {
  const segments = parseMessageSegments(body)
  if (segments.length !== 1) return false
  if (segments[0].type === 'code') return true
  return looksLikePastedCode(segments[0].content)
}

function getMessageItemClassName(
  direction: string,
  body: string,
  codeOnly: boolean,
  enteringId: string | null,
  id: string,
): string {
  const parts = [`message-item`, `message-item--${direction}`]
  if (codeOnly) parts.push('message-item--code-only')
  else if (body.includes('```')) parts.push('message-item--has-code')
  if (enteringId === id) parts.push('message-item--enter')
  return parts.join(' ')
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

function CodeBlock({
  content,
  variant = 'inline',
  onCopy,
}: {
  content: string
  variant?: 'inline' | 'standalone'
  onCopy?: (text: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const lines = content.split('\n')
  const showLineNumbers = lines.length > 1 || (lines.length === 1 && lines[0].length > 40)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      onCopy?.(content)
    })
  }, [content, onCopy])

  return (
    <figure
      className={`code-block code-block--${variant}`}
      role="figure"
      aria-label="Code block"
      data-line-numbers={showLineNumbers}
    >
      <header className="code-block__header">
        <span className="code-block__chrome" aria-hidden>
          <span className="code-block__dot code-block__dot--red" />
          <span className="code-block__dot code-block__dot--yellow" />
          <span className="code-block__dot code-block__dot--green" />
        </span>
        <span className="code-block__title">Code</span>
        <button
          type="button"
          className={`code-block__copy${copied ? ' code-block__copy--copied' : ''}`}
          onClick={handleCopy}
          aria-label={copied ? 'Copied' : 'Copy code'}
          title={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? (
            <>
              <span className="code-block__copy-icon" aria-hidden>✓</span>
              <span>Copied!</span>
            </>
          ) : (
            <>
              <span className="code-block__copy-icon" aria-hidden>⎘</span>
              <span>Copy code</span>
            </>
          )}
        </button>
      </header>
      <div className="code-block__body">
        {showLineNumbers && (
          <div className="code-block__gutter" aria-hidden>
            {lines.map((_, i) => (
              <span key={i} className="code-block__line-num">
                {i + 1}
              </span>
            ))}
          </div>
        )}
        <pre className="code-block__pre">
          <code className="code-block__code">
            {lines.map((line, i) => (
              <span key={i} className="code-block__line">
                {line || '\u00A0'}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </figure>
  )
}

function MessageBody({ body }: { body: string }) {
  const segments = parseMessageSegments(body)
  return (
    <span className="message-body">
      {segments.map((seg, i) =>
        seg.type === 'code' ? (
          <CodeBlock key={i} content={seg.content} variant="inline" />
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
            const segments = parseMessageSegments(m.body)
            const copyText = codeOnly ? (segments[0] as Segment).content : m.body
            const senderDisplay = m.senderName ? formatSenderName(m.senderName) : null
            return (
              <li
                key={m.id}
                className={getMessageItemClassName(m.direction, m.body, codeOnly, enteringId, m.id)}
                data-direction={m.direction}
              >
                <div className="message-item-content">
                  {senderDisplay && (
                    <span className="message-sender" aria-label={`From ${senderDisplay}`}>
                      {senderDisplay}:
                    </span>
                  )}
                  {codeOnly ? (
                    <CodeBlock content={copyText} variant="standalone" />
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
