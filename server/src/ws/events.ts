/** WebSocket event types: client → server */
export interface ClientEvents {
  join_room: { roomId: string; playerName: string; characterId: string }
  player_message: { content: string }
  leave_room: Record<string, never>
}

/** WebSocket event types: server → client */
export interface ServerEvents {
  connected: { message: string }
  heartbeat: { timestamp: number }
  room_joined: {
    roomId: string
    characterName: string
    characters: { id: string; name: string; description: string; isNpc: boolean }[]
    joinedMessage?: { id: string; content: string; timestamp: number }
  }
  npc_turn_start: {
    turnId: string
    timestamp: number
    playerMessageId: string
    backend: 'agent-runtime' | 'llm'
    runtimeMode?: 'sync'
    status: 'thinking'
  }
  npc_turn_end: {
    turnId: string
    timestamp: number
    playerMessageId: string
    responseCount: number
    backend: 'agent-runtime' | 'llm'
    runtimeMode?: 'sync'
    status: 'completed' | 'error'
    errorMessage?: string
  }
  npc_chunk: { turnId: string; id: string; npcId: string; npcName: string; chunk: string; timestamp: number }
  npc_done: { turnId: string; id: string; npcId: string; npcName: string; content: string; timestamp: number }
  npc_error: { id: string; message: string; timestamp: number; turnId?: string }
  player_msg: { id: string; senderId: string; senderName: string; content: string; timestamp: number }
  system: { id: string; content: string; timestamp: number }
  error: { id: string; message: string; timestamp: number }
}
