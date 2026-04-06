/** WebSocket event types: client → server */
export interface ClientEvents {
  join_room: { roomId: string; playerName: string; characterId: string }
  player_message: { content: string }
  leave_room: Record<string, never>
}

/** WebSocket event types: server → client */
export interface ServerEvents {
  connected: { message: string }
  room_joined: {
    roomId: string
    characterName: string
    characters: { id: string; name: string; description: string; isNpc: boolean }[]
  }
  npc_chunk: { npcId: string; npcName: string; chunk: string }
  npc_done: { npcId: string; npcName: string }
  player_msg: { senderName: string; content: string }
  system: { content: string }
  error: { message: string }
}
