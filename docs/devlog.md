# Drama MUD — Development Log

## 2026-03-08 — Project Initialization

- **Done**: Scaffolded monorepo with pnpm workspaces (`engine/`, `server/`, `client/`).
- **Done**: Created 6 cold-start game templates under `games/` (power-trip, comeback, ghost-scare × fixed/open).
- **Done**: Set up initial project config: `tsconfig.base.json`, `.eslintrc.json`, `.prettierrc`, `.gitignore`.
- **Done**: Created architecture docs under `docs/` (api.md, architecture.md, game-config.md, llm-prompts.md).
- **Done**: Moved project to `C:\Users\lochen\Documents\GitHub\drama-mud`.

## 2026-03-08 — Project Rules & Documentation Standards

- **Done**: Created `.optimus/rules.md` with Rule 1 (English-only for code/docs/comments/commits).
- **Done**: Added Rule 2 requiring maintenance of `docs/design.md` (design document) and `docs/devlog.md` (development log).
- **Done**: Created initial `docs/design.md` capturing current architecture decisions.
- **Pending**: First git commit of all scaffolded files.
- **Pending**: Begin implementing engine core (character system, world state, LLM integration).

## 2026-03-08 — Rule 1 Compliance Pass (English-only)

- **Done**: Rewrote `README.md` entirely in English (was fully Chinese).
- **Done**: Rewrote `CLAUDE.md` — translated all Chinese architecture descriptions, game type table, and command annotations to English.
- **Done**: Rewrote `docs/architecture.md` — translated all headings, module descriptions, and data flow to English.
- **Done**: Rewrote `docs/api.md` — translated all section headers, endpoint descriptions, and WebSocket event tables to English.
- **Done**: Rewrote `docs/game-config.md` — translated title, directory structure, field reference table to English.
- **Done**: Rewrote `docs/llm-prompts.md` — translated design principles, prompt structure, tone guide, and narrative phase tables to English.
- **Done**: Translated `engine/src/llm/prompts.ts` — all NPC system prompt strings and narration prompt strings now in English.
- **Done**: Translated `engine/src/dialog/narrative.ts` — all narrative phase guidance strings now in English.
- **Done**: Translated `engine/src/__tests__/character.test.ts` — replaced Chinese test fixture data with English equivalents.
- **Done**: Translated all client UI components (`App.tsx`, `ChatPanel.tsx`, `CharacterCard.tsx`, `GameLobby.tsx`) — all hard-coded Chinese UI strings replaced with English.
- **Done**: Translated all 6 `games/*/config.json` files — `displayName` and `description` fields now in English.
- **Decision**: `games/*/world.md` and `games/*/characters.json` narrative content left in Chinese — covered by the Rule 1 exception for user-facing in-game narrative content.
- **Next**: First git commit; begin engine core implementation.

## 2026-03-08 — Documentation Directory Cleanup

- **Done**: Moved `.claude/docs/coding-guidelines.md` → `docs/coding-guidelines.md` (project-level doc, not Claude CLI config).
- **Done**: Moved `.claude/docs/testing.md` → `docs/testing.md` (project-level doc, not Claude CLI config).
- **Done**: Deleted `.claude/docs/architecture.md` — duplicate of the more complete `docs/architecture.md`.
- **Done**: Removed `.claude/docs/` directory; `.claude/` now only contains `settings.json` (Claude Code CLI tool permissions).
- **Decision**: `.claude/` is reserved for Claude Code CLI configuration only. All project documentation lives under `docs/`.
- **Next**: First git commit; begin engine core implementation.

## 2026-03-08 — Cross-Platform Architecture Discussion

- **Discussed**: Target platform requirements — Web, WeChat Mini Program, Android, iOS.
- **Key clarification**: Drama MUD should target WeChat **Mini Program** (小程序), NOT Mini Game (小游戏). Text MUD's chat/list interaction patterns are a natural fit for Mini Program's DOM-like component system; Mini Game's Canvas/WebGL rendering would be over-engineered.
- **Frameworks analyzed**: Taro (React/TS), uni-app (Vue), React Native + adapter, PWA/Web-first + WebView. See `docs/design.md` comparison table under "Cross-Platform Strategy".
- **Tentative lean**: Taro offers the best alignment with the current React/TypeScript stack while covering WeChat MP + React Native targets.
- **Decision pending**: Framework selection not finalized. Discussion documented for reference regardless of outcome.
- **Next**: Finalize cross-platform framework choice; update `docs/design.md` with decision and rationale; begin engine core implementation.

## 2026-03-08 — Taro Decision + MVP Backend Implementation

- **Decision**: Taro selected as cross-platform framework. Best alignment with existing React/TS stack; compiles to WeChat MP + H5.
- **Done**: Defined minimal MVP scope — pick template, create room, choose character, chat with streaming LLM NPCs.
- **Done**: Implemented `server/src/api/game-loader.ts` — reads `games/` directory, parses `config.json` + `characters.json` + `world.md` for each template.
- **Done**: Implemented `GET /api/games` and `GET /api/games/:name` endpoints in `server/src/api/routes.ts`.
- **Done**: Created `server/src/session/game-session.ts` — `GameSession` class that ties a room to `DialogManager` + `NpcDriver`, manages player-character bindings, and streams NPC responses.
- **Done**: Rewrote `server/src/ws/handler.ts` — full `join_room`, `player_message`, `leave_room` handling with per-room socket broadcasting and streaming NPC chunks.
- **Done**: Updated `server/src/ws/events.ts` — new WebSocket protocol types (`npc_chunk`, `npc_done`, `player_msg`, `system`).
- **Done**: Wired `server/src/index.ts` — shared `RoomManager` and `LlmClient` injected into routes and WS handler.
- **Done**: Exported `LlmClient` type from `engine/src/index.ts`.
- **Done**: Fixed JSDoc `games/*/config.json` glob causing TS parse error in `engine/src/types/index.ts`.
- **Done**: Added `@types/ws` dev dependency to server package.
- **Verified**: Engine builds cleanly, all 10 engine tests pass, server type-checks cleanly.
- **Done**: Updated `docs/design.md` with Taro decision, MVP scope, server architecture, and WS protocol.
- **Next**: Create Taro client package (`client-mp/`), implement 3 pages (lobby, character selection, chat).

## 2026-03-08 — React+Vite Client Wired End-to-End

- **Rationale**: Before scaffolding the Taro client, wire up the existing React+Vite client to validate the backend WS protocol and full game flow in a simpler environment.
- **Done**: Rewrote `client/src/lib/api.ts` — typed REST client with `GameInfo`, `CharacterInfo`, `RoomInfo` interfaces matching server API responses.
- **Done**: Updated `client/src/lib/ws-client.ts` — added `onConnected` callback (triggered on server `connected` event), `intentionalClose` flag to prevent auto-reconnect on deliberate disconnect, exported `WsClient` interface.
- **Done**: Rewrote `client/src/components/GameLobby.tsx` — fetches templates from `GET /api/games`, shows fixed-mode templates with character counts, name input + "Create Room" button calling `POST /api/rooms`.
- **Done**: Created `client/src/components/CharacterSelect.tsx` — fetches character list from `GET /api/games/:name`, displays playable characters (click to select) and NPC characters (display only), uses existing `CharacterCard` component.
- **Done**: Rewrote `client/src/components/ChatPanel.tsx` — full WebSocket integration: connects, sends `join_room` on server `connected`, handles `room_joined`, `player_msg`, `npc_chunk` (streaming accumulation via `useRef`), `npc_done`, `system`, `error`; auto-scrolls; send input with `player_message`; leave button with `leave_room`.
- **Done**: Rewrote `client/src/App.tsx` — 3-view flow (`lobby → character-select → game`) with `GameState` tracking `roomId`, `templateName`, `playerName`, `characterId`.
- **Done**: Added `client/src/vite-env.d.ts` for Vite `import.meta.env` types.
- **Verified**: All three packages (engine, server, client) typecheck cleanly. All 10 engine tests pass.
- **Next**: Create Taro client package (`client-mp/`) using the wired-up React client as reference.

## 2026-03-08 — Taro Client (`client-mp/`) Scaffolded and Wired

- **Done**: Fixed `.env.example` — removed stale `WS_PORT=3002` (WS shares HTTP port), commented out `VITE_API_URL` and `VITE_WS_URL` (Vite proxy handles these in dev).
- **Done**: Added `client-mp` to `pnpm-workspace.yaml`.
- **Done**: Created `client-mp/package.json` — Taro 4.1.11, React 18, webpack5-runner, plugin-framework-react, plugin-platform-weapp, plugin-platform-h5.
- **Done**: Created `client-mp/config/index.ts` — Taro compiler config with `defineConstants` for `TARO_APP_API_URL` and `TARO_APP_WS_URL`, H5 dev server on port 10086 with proxy to backend on 3001.
- **Done**: Created `client-mp/project.config.json` — WeChat DevTools project config with placeholder `appid`.
- **Done**: Created `client-mp/src/app.config.ts` — 3 pages: `lobby`, `character-select`, `chat`.
- **Done**: Created `client-mp/src/app.tsx` — minimal root component.
- **Done**: Created `client-mp/src/lib/api.ts` — port of `client/src/lib/api.ts` using `Taro.request` instead of `fetch`. Same `GameInfo`, `CharacterInfo`, `RoomInfo` interfaces.
- **Done**: Created `client-mp/src/lib/ws-client.ts` — port of `client/src/lib/ws-client.ts` using `Taro.connectSocket` → `SocketTask`. Same `WsClient` and `WsMessageHandler` interfaces. Auto-reconnect on disconnect.
- **Done**: Created `client-mp/src/pages/lobby/index.tsx` — fetches templates, name input, game selection, `Taro.navigateTo` on room creation.
- **Done**: Created `client-mp/src/pages/character-select/index.tsx` — reads route params with `useRouter()`, fetches characters, displays playable + NPC cards.
- **Done**: Created `client-mp/src/pages/chat/index.tsx` — full WS integration with streaming NPC chunk accumulation (same `useRef` map pattern as web client), `ScrollView` with auto-scroll, `Input` with `confirmType='send'`.
- **Done**: Created CSS files for all 3 pages — dark theme matching web client, using rpx units for WeChat MP compatibility.
- **Done**: Created `client-mp/tsconfig.json` — JSX react-jsx, CommonJS module, path alias `@/*`.
- **Verified**: All 4 workspace packages (engine, server, client, client-mp) typecheck cleanly.
- **Key adaptation**: WeChat MP has no `window.WebSocket`; Taro's `connectSocket` returns a `SocketTask` with per-task event listeners. The `ws-client.ts` wrapper exposes the same `WsClient` interface regardless of platform.
- **Next**: Test H5 mode in browser (`pnpm --filter @drama-mud/client-mp dev:h5`), then WeChat DevTools for weapp target.
