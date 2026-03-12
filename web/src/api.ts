const API_BASE = ''

export type SessionResponse = { code: string }

export async function getSession(): Promise<SessionResponse> {
  const res = await fetch(`${API_BASE}/api/session`)
  if (!res.ok) throw new Error('Failed to get session')
  return res.json()
}

export function buildWsUrl(code: string): string {
  const base = window.location.origin
  const protocol = base.startsWith('https') ? 'wss:' : 'ws:'
  const host = base.replace(/^https?:\/\//, '')
  return `${protocol}//${host}/ws?code=${encodeURIComponent(code)}`
}
