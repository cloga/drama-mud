// Core types
export type { Character, CharacterConfig, NpcCharacter, PlayerCharacter } from './types/index.js'
export type {
  GameConfig,
  GameEvent,
  GameState,
  Message,
  RoleMode,
  GameType,
  World,
  Scene,
} from './types/index.js'

// Modules
export { createLlmClient } from './llm/client.js'
export type { LlmClient, LlmClientConfig } from './llm/client.js'
export { CharacterManager } from './character/character.js'
export { NpcDriver } from './character/npc-driver.js'
export { WorldState } from './world/world-state.js'
export { EventBus } from './world/event-bus.js'
export { DialogManager } from './dialog/dialog-manager.js'
export { NarrativeEngine } from './dialog/narrative.js'
