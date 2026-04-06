# Architecture — Drama MUD

## System Architecture

```
┌─────────────┐     HTTP/WS      ┌──────────────┐     import      ┌──────────────┐
│   Client    │ ◄──────────────► │    Server     │ ◄────────────► │    Engine     │
│ React+Vite  │                  │   Fastify+WS  │                │  LLM Core    │
└─────────────┘                  └──────────────┘                └──────────────┘
                                        │
                                   ┌────┴────┐
                                   │  games/  │
                                   │ templates│
                                   └─────────┘
```

## Module Overview

### engine/ — @drama-mud/engine
- **types/** — Core type definitions (Character, World, GameConfig, Message, GameEvent)
- **llm/** — LLM integration layer, OpenAI-compatible API calls, prompt templates
- **character/** — Character management, NPC AI driver
- **world/** — World state machine, scene transitions, event bus
- **dialog/** — Dialog context management, narrative engine (story arc control)

### server/ — @drama-mud/server
- **api/** — REST endpoints (game list, room management, character selection)
- **ws/** — WebSocket real-time communication (player actions, NPC replies, world events)
- **rooms/** — Room lifecycle management (created → waiting → in-game → ended)

### client/ — @drama-mud/client
- **components/** — React components (lobby, chat panel, character card)
- **lib/** — WebSocket client, API utilities

### games/ — Game Templates
Each template contains:
- `config.json` — Game metadata
- `world.md` — World setting description
- `characters.json` — Preset character list

## Data Flow

1. Player connects via WebSocket → joins a Room
2. Room loads game template from `games/`
3. Engine initializes World + Characters
4. Player sends action → Server → Engine → LLM generates NPC response
5. Engine emits GameEvent → Server broadcasts to all players in the room
