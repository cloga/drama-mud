/** Game type identifier */
export type GameType = 'power-trip' | 'comeback' | 'ghost-scare'

/** Role mode: fixed characters or open creation */
export type RoleMode = 'fixed' | 'open'

/** Game template configuration (loaded from games/{name}/config.json) */
export interface GameConfig {
  name: string
  displayName: string
  type: GameType
  roleMode: RoleMode
  description: string
  world?: World
  characters?: CharacterConfig[]
}

/** World definition */
export interface World {
  name: string
  description: string
  scenes: Scene[]
}

/** A scene / location within the world */
export interface Scene {
  id: string
  name: string
  description: string
  connectedScenes: string[]
}

/** Character configuration from game template */
export interface CharacterConfig {
  id: string
  name: string
  description: string
  personality: string
  isNpc: boolean
}

/** Runtime character instance */
export interface Character {
  id: string
  name: string
  description: string
  personality: string
  currentSceneId: string
  memory: string[]
}

/** A player-controlled character */
export interface PlayerCharacter extends Character {
  playerId: string
}

/** An NPC driven by LLM */
export interface NpcCharacter extends Character {
  systemPrompt: string
}

/** Chat message */
export interface Message {
  id: string
  senderId: string
  senderName: string
  content: string
  timestamp: number
  type: 'dialog' | 'action' | 'narration' | 'system'
}

/** Game event emitted by engine */
export interface GameEvent {
  type: string
  payload: Record<string, unknown>
  timestamp: number
}

/** Overall game state snapshot */
export interface GameState {
  config: GameConfig
  world: World
  characters: Character[]
  messages: Message[]
  currentSceneId: string
  turnCount: number
  isEnded: boolean
}
