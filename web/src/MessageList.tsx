import { useLayoutEffect, useRef } from 'react'

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

export function MessageList({ messages }: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el || messages.length === 0) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  return (
    <div ref={listRef} className="message-list" role="log" aria-label="Messages">
      {messages.length === 0 ? (
        <p className="message-list-empty">No messages yet.</p>
      ) : (
        <ul className="message-list-ul">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`message-item message-item--${m.direction}`}
              data-direction={m.direction}
            >
              {m.senderName && (
                <span className="message-sender" aria-label={`From ${m.senderName.replace(/_/g, ' ')}`}>
                  {m.senderName.replace(/_/g, ' ')}:
                </span>
              )}
              <span className="message-body">{m.body}</span>
              <time className="message-time" dateTime={new Date(m.at).toISOString()}>
                {new Date(m.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
