export const MessageType = {
  Join: 'join',
  Joined: 'joined',
  Error: 'error',
  Text: 'text',
  FileStart: 'file_start',
  FileChunk: 'file_chunk',
  FileEnd: 'file_end',
  ServerClosing: 'server_closing',
} as const

export type Envelope = {
  type: string
  payload?: unknown
}

export type TextPayload = { body: string }
export type FileStartPayload = {
  transfer_id: string
  name: string
  size: number
  mime_type?: string
}
export type FileChunkPayload = {
  transfer_id: string
  index: number
  data: string
}
export type FileEndPayload = { transfer_id: string }
export type ErrorPayload = { message: string }
export type JoinedPayload = { code: string }

export const ChunkSize = 512 * 1024
