export const MessageType = {
  Join: 'join',
  Joined: 'joined',
  PeerJoined: 'peer_joined',
  Error: 'error',
  Text: 'text',
  Composing: 'composing',
  FileStart: 'file_start',
  FileChunk: 'file_chunk',
  FileEnd: 'file_end',
  ServerClosing: 'server_closing',
} as const

export type Envelope = {
  type: string
  payload?: unknown
}

export type FileStartPayload = {
  transfer_id: string
  name: string
  size: number
  mime_type?: string
  sender_id?: string
  sender_name?: string
}
export type FileChunkPayload = {
  transfer_id: string
  index: number
  data: string
}
export type FileEndPayload = { transfer_id: string }
export type ErrorPayload = { message: string }
export type PeerInfo = { peer_id: string; name: string }
export type JoinedPayload = { code: string; name?: string; peers?: PeerInfo[] }
export type PeerJoinedPayload = { peer_id: string; name: string }
export type TextPayload = { body: string; sender_id?: string; sender_name?: string }
export type ComposingPayload = { active: boolean; sender_id?: string; sender_name?: string }

export const ChunkSize = 512 * 1024

export function formatSenderName(name: string): string {
  return name.replace(/_/g, ' ')
}
