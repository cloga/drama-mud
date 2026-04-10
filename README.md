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

## Azure VM Deployment

This repo now includes:

- `.github/workflows/deploy-azure-vm.yml`
- `scripts/setup-vm.sh`
- `scripts/deploy-vm.sh`
- `ops/systemd/drama-mud.service`
- `ops/nginx/drama-mud.conf`

The deployment target assumes:

- **Node server** runs on `127.0.0.1:3001`
- **nginx** serves `client/dist` and proxies `/api` + `/ws`
- room persistence is externalized with `ROOM_STORE_PATH`

Required GitHub configuration:

| Type | Name | Purpose |
|------|------|---------|
| Secret | `AZURE_VM_HOST` | VM public IP or hostname |
| Secret | `AZURE_VM_SSH_KEY` | Private SSH key used by GitHub Actions |
| Secret | `DRAMA_MUD_ENV` | Full production env file content written to `/srv/drama-mud/shared/drama-mud.env`（可选加入 `DRAMA_MUD_ACCESS_CODE=...` 作为共享访问码） |
| Variable | `AZURE_VM_USER` | SSH user, default `azureuser` |
| Variable | `AZURE_VM_APP_ROOT` | App root, default `/srv/drama-mud` |
| Variable | `AZURE_VM_SERVER_NAME` | nginx `server_name`, default `_` |
| Variable | `AZURE_VM_APP_BASE_PATH` | URL base path, default `/drama-mud/` |
| Variable | `AZURE_VM_TRINITY_ALPHA_UPSTREAM` | Existing trinity-alpha upstream, default `127.0.0.1:8001` |

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
