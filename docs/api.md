# API Reference — Drama MUD

## REST API

### `GET /api/games`
Retrieve the list of available game templates.

**Response:**
```json
{
  "games": [
    {
      "name": "power-trip-fixed",
      "displayName": "Power Trip · Fixed Roles",
      "type": "power-trip",
      "roleMode": "fixed",
      "description": "Pure power fantasy from start to finish, with preset characters"
    }
  ]
}
```

### `GET /api/rooms`
Retrieve the list of currently active rooms.

### `POST /api/rooms`
Create a new room.

**Request Body:**
```json
{
  "gameTemplate": "power-trip-fixed",
  "hostName": "PlayerA"
}
```

### `GET /api/rooms/:roomId`
Retrieve room details.

---

## WebSocket Events

### Connection
```
wss://<your-domain>/ws
```

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `join_room` | `{ roomId, playerName, characterId }` | Join a room as a selected playable character |
| `player_message` | `{ content }` | Send a chat message into the room |
| `leave_room` | `{}` | Leave the current room |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | `{ message }` | Socket connected and ready for `join_room` |
| `room_joined` | `{ roomId, characterName, characters }` | Join confirmed with current character roster |
| `player_msg` | `{ senderName, content }` | Player message broadcast to the room |
| `npc_chunk` | `{ npcId, npcName, chunk }` | Streaming NPC response chunk |
| `npc_done` | `{ npcId, npcName }` | NPC response finished |
| `system` | `{ content }` | System status such as joins, leaves, reconnect notices |
| `error` | `{ message }` | Error message |
