# Drama MUD — Design Document

## Overview

Drama MUD (戏精日记) is an LLM-driven multiplayer text MUD game engine. Players define or select characters and interact within AI-NPC-powered narrative worlds.

## Architecture

### Monorepo Structure

- `engine/` — LLM core: character system, world state, dialogue management, narrative engine
- `server/` — REST API + WebSocket real-time communication, room management (Fastify + ws)
- `client/` — Web terminal-style text adventure UI (React 18 + Vite)
- `games/` — Cold-start game templates (6 variants: 3 types × 2 role modes)

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict mode) |
| Monorepo | pnpm workspaces |
| LLM | OpenAI-compatible SDK |
| Server | Fastify + ws |
| Client | React 18 + Vite |
| Test | Vitest |
| Lint/Format | ESLint + Prettier |

### Game Types

| Type | Description |
|------|-------------|
| power-trip | Power fantasy — player experiences a strong role from start to finish |
| comeback | Underdog arc — starts weak, builds to a dramatic reversal |
| ghost-scare | Horror atmosphere — player takes a ghost role to scare others |

### Role Modes

- **fixed** — Pre-defined characters provided by the game template
- **open** — Players freely create their own characters

## Key Design Decisions

- All LLM calls are centralized in `engine/src/llm/` to ensure consistent prompt management and easy provider switching.
- Game templates require three files: `config.json`, `world.md`, `characters.json`.
- Named exports only (no default exports except React page components) for consistent import patterns.

## Cross-Platform Strategy

> **Decision: Taro** (2026-03-08). Taro selected as the cross-platform framework.

### Rationale

Taro was chosen because:
- Best alignment with the existing TypeScript/React codebase (no framework switch)
- Compiles to WeChat Mini Program (primary target) and H5 (web preview)
- React Native compilation available for future Android/iOS native apps
- Active community with good TypeScript support

### Target Platforms

- Web browser (H5 via Taro, plus existing React+Vite client for dev)
- WeChat Mini Program (primary target for MVP)
- Android / iOS (future, via Taro + React Native)

### Key Clarification: Mini Program vs Mini Game

Drama MUD should target **WeChat Mini Program** (小程序), NOT WeChat Mini Game (小游戏). Text MUD interaction patterns (chat, lists, forms) are a natural fit for Mini Program's DOM-like component system.

| | Mini Game (小游戏) | Mini Program (小程序) |
|---|---|---|
| Rendering | Canvas / WebGL | DOM-like component system |
| Suited for | Graphics games (e.g. Jump) | Chat, forms, list interactions |
| Text MUD | Over-engineered | Natural fit |

## MVP Scope (v0.1)

### Core Flow

```
Open app -> Pick game template -> Create room -> Choose character -> Chat with LLM NPCs
```

### Included

| Feature | Description |
|---------|-------------|
| Game lobby | Load 6 cold-start templates from `games/` directory via REST API |
| Create room | Pick template, enter nickname, create room |
| Character selection | Fixed-mode: pick from preset characters |
| Chat with NPC | Send text message, receive streaming LLM NPC response |
| Multi-player awareness | All players in the same room see each other's messages and NPC replies |

### Excluded (post-MVP)

| Feature | Reason |
|---------|--------|
| Open-mode characters | Needs custom form + prompt design |
| Scene movement / map | Fixed single-scene is sufficient for core loop validation |
| User accounts / persistence | Temporary nicknames only |
| Narrative arc control | Basic NPC responses suffice |
| WeChat MP production deployment | MVP runs locally in DevTools |

### Server-Side Architecture

The server now has three key layers:

1. **REST API** (`server/src/api/`) — `GET /api/games` loads templates from `games/` directory; CRUD for rooms
2. **WebSocket handler** (`server/src/ws/`) — Real-time messaging: `join_room`, `player_message`, streaming NPC chunks
3. **GameSession** (`server/src/session/`) — Glue layer binding a room to engine components (DialogManager, NpcDriver)

### WebSocket Protocol

```
Client -> Server:
  { type: "join_room", roomId, playerName, characterId }
  { type: "player_message", content }
  { type: "leave_room" }

Server -> Client:
  { type: "connected", message }
  { type: "room_joined", roomId, characterName, characters[] }
  { type: "npc_chunk", npcId, npcName, chunk }
  { type: "npc_done", npcId, npcName }
  { type: "player_msg", senderName, content }
  { type: "system", content }
  { type: "error", message }
```

### Client-Side Architecture (React+Vite)

The web client implements the full MVP flow with 3 views:

```
lobby → character-select → game (chat)
```

**Components:**

| Component | Responsibility |
|-----------|---------------|
| `App.tsx` | View router — manages `lobby / character-select / game` state transitions |
| `GameLobby.tsx` | Fetches templates via `GET /api/games`, creates rooms via `POST /api/rooms` |
| `CharacterSelect.tsx` | Fetches character list via `GET /api/games/:name`, filters playable vs NPC |
| `ChatPanel.tsx` | WebSocket connection, `join_room`, message display, streaming NPC chunks |
| `CharacterCard.tsx` | Reusable character display card (playable + NPC styling) |

**Lib layer:**

| Module | Responsibility |
|--------|---------------|
| `lib/api.ts` | Typed REST client (`getGames`, `getGame`, `createRoom`, `getRoom`) |
| `lib/ws-client.ts` | WebSocket wrapper with auto-reconnect and `onConnected` callback |

**Streaming NPC flow:**
1. `npc_chunk` messages accumulate text in a `useRef` map (keyed by `npcId`)
2. State is updated on each chunk to show the partially-streamed NPC message
3. `npc_done` finalizes the message and clears the streaming ref

## Taro Client Architecture (`client-mp/`)

The Taro client is a port of the React+Vite web client, compiled to WeChat Mini Program and H5 targets.

### Package Structure

```
client-mp/
├── config/index.ts          — Taro compiler config (webpack5, defineConstants)
├── project.config.json      — WeChat DevTools project config
├── tsconfig.json             — TypeScript config (JSX react-jsx, CommonJS)
├── src/
│   ├── app.config.ts         — Taro page routes
│   ├── app.tsx               — Root component
│   ├── app.css               — Global styles
│   ├── lib/
│   │   ├── api.ts            — REST client using Taro.request
│   │   └── ws-client.ts      — WebSocket client using Taro.connectSocket
│   └── pages/
│       ├── lobby/            — Game template list + room creation
│       ├── character-select/ — Character picker (playable + NPC)
│       └── chat/             — WebSocket chat with streaming NPC
```

### Key Platform Adaptations

| Concern | Web (`client/`) | Taro (`client-mp/`) |
|---|---|---|
| HTTP | `fetch` | `Taro.request` |
| WebSocket | `new WebSocket(url)` | `Taro.connectSocket` → `SocketTask` |
| Navigation | `useState` + conditional render | `Taro.navigateTo` (URL params) |
| Layout | `<div>`, `<input>` | `<View>`, `<Input>`, `<ScrollView>` |
| Env vars | `import.meta.env.VITE_*` | `defineConstants` in Taro config |
| Styles | inline styles | CSS class files (rpx units, `page` selector) |

### WebSocket Adaptation

WeChat Mini Program's WebSocket API differs from browsers:
- `Taro.connectSocket()` returns a `SocketTask` (via Promise)
- Events are per-task: `task.onMessage()`, `task.onOpen()`, `task.onClose()`
- Send via `task.send({ data: string })`
- H5 mode automatically uses browser `WebSocket` under the hood

### Development Workflow

```bash
# H5 mode (test in browser, easiest to validate)
pnpm --filter @drama-mud/client-mp dev:h5

# WeChat MP mode (requires WeChat DevTools)
pnpm --filter @drama-mud/client-mp dev:weapp
# Then open client-mp/dist/ in WeChat DevTools
```

H5 dev server runs on port 10086, proxying `/api` and `/ws` to the backend on port 3001.

## Open Questions

- How to handle multiple NPC responses per player message (currently: only first NPC responds)
