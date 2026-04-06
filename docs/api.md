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

Or create a room from custom authored content:

```json
{
  "hostName": "PlayerA",
  "customGame": {
    "title": "自定义故事",
    "description": "玩家自己编写的背景与角色",
    "worldMd": "# 世界观\n这里填写背景设定",
    "characters": [
      {
        "id": "hero",
        "name": "主角",
        "description": "故事主角",
        "personality": "勇敢坚定",
        "isNpc": false
      }
    ]
  }
}
```

Custom rooms must include at least one playable character (`isNpc: false`) and at least one NPC (`isNpc: true`).

### `GET /api/rooms/:roomId`
Retrieve room details.

### `GET /api/rooms/:roomId/game`
Retrieve the effective game detail for a room, including custom authored background and character definitions.

**Response shape:**
```json
{
  "source": "custom",
  "config": {
    "name": "custom-abc123",
    "displayName": "自定义故事",
    "type": "power-trip",
    "roleMode": "open",
    "description": "玩家自己编写的背景与角色"
  },
  "characters": [],
  "worldMd": "# 世界观\n这里填写背景设定"
}
```

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
