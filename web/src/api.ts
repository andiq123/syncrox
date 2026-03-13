export const DEFAULT_SESSION_CODE = 'DEFAULT'

export function buildWsUrl(code: string): string {
  const base = window.location.origin
  const protocol = base.startsWith('https') ? 'wss:' : 'ws:'
  const host = base.replace(/^https?:\/\//, '')
  return `${protocol}//${host}/ws?code=${encodeURIComponent(code)}`
}
