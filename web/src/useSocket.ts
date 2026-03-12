import { useCallback, useEffect, useRef, useState } from 'react'
import { buildWsUrl } from './api'

export type ConnectionState = 'closed' | 'connecting' | 'connected' | 'reconnecting'

type Options = {
  code: string | null
  onMessage: (data: string | ArrayBuffer) => void
  reconnect?: boolean
}

export function useSocket({ code, onMessage, reconnect = true }: Options) {
  const [state, setState] = useState<ConnectionState>('closed')
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  const reconnectRef = useRef(reconnect)
  const codeRef = useRef(code)

  onMessageRef.current = onMessage
  reconnectRef.current = reconnect
  codeRef.current = code

  const connect = useCallback(() => {
    if (!codeRef.current) return
    const url = buildWsUrl(codeRef.current)
    setState('connecting')
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => setState('connected')
    ws.onclose = () => {
      wsRef.current = null
      setState((s) => (s === 'connected' ? 'reconnecting' : 'closed'))
      if (reconnectRef.current && codeRef.current) {
        setTimeout(connect, 2000)
      }
    }
    ws.onerror = () => {}
    ws.onmessage = (e) => {
      if (typeof e.data === 'string' || e.data instanceof ArrayBuffer) {
        onMessageRef.current(e.data)
      }
    }
  }, [])

  const disconnect = useCallback(() => {
    reconnectRef.current = false
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setState('closed')
  }, [])

  const restart = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setState('closed')
    reconnectRef.current = true
    connect()
  }, [connect])

  const send = useCallback((data: string | ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data)
    }
  }, [])

  useEffect(() => {
    if (code) {
      reconnectRef.current = true
      connect()
    }
    return () => {
      reconnectRef.current = false
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      setState('closed')
    }
  }, [code, connect])

  return { state, send, connect, disconnect, restart }
}
