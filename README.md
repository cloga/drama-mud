# Drama MUD

LLM-powered multiplayer text MUD game engine. Users can define game worlds and characters; other players pick a role and interact with LLM-driven NPCs.

## Tech Stack

- **Monorepo**: pnpm workspaces
- **Language**: TypeScript (full-stack strict mode)
- **Engine**: OpenAI-compatible SDK
- **Server**: Fastify + WebSocket
- **Client**: React 18 + Vite
- **Test**: Vitest
- **Lint**: ESLint + Prettier

## Project Structure

```
drama-mud/
├── engine/                      # @drama-mud/engine — LLM core engine
│   └── src/
│       ├── types/               # Core type definitions
│       ├── llm/                 # LLM integration + prompt templates
│       ├── character/           # Character management + NPC AI driver
│       ├── world/               # World state machine + event bus
│       └── dialog/              # Dialog management + narrative engine
├── server/                      # @drama-mud/server — Backend service
│   └── src/
│       ├── api/                 # REST endpoints
│       ├── ws/                  # WebSocket communication
│       └── rooms/               # Room management
├── client/                      # @drama-mud/client — Web frontend
│   └── src/
│       ├── components/          # React components
│       └── lib/                 # WebSocket + API utilities
├── docs/                        # Project documentation
├── games/                       # Cold-start game templates (6 total)
│   ├── power-trip-fixed/        # Power Trip · Fixed Roles
│   ├── power-trip-open/         # Power Trip · Open Roles
│   ├── comeback-fixed/          # Comeback · Fixed Roles
│   ├── comeback-open/           # Comeback · Open Roles
│   ├── ghost-scare-fixed/       # Ghost Scare · Fixed Roles
│   └── ghost-scare-open/        # Ghost Scare · Open Roles
├── .github/                     # GitHub templates & CI workflows
└── docs/                        # Project documentation
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Start dev server (full-stack)
pnpm dev

# Run tests
pnpm test

# Type-check
pnpm typecheck
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your LLM API key:

```bash
cp .env.example .env
```

## Game Types

| Type | Description |
|------|-------------|
| Power Trip | Pure power fantasy — player dominates from start to finish |
| Comeback | Underdog arc — start weak, overcome adversity, triumph |
| Ghost Scare | Horror atmosphere — player plays a ghost to scare NPCs |

## Role Modes

- **Fixed**: Preset characters; players choose from a list
- **Open**: Players create their own characters freely

## Documentation

- [System Architecture](docs/architecture.md)
- [API Reference](docs/api.md)
- [Game Config Format](docs/game-config.md)
- [LLM Prompt Design](docs/llm-prompts.md)
