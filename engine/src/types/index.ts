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

export const DURABLE_FACT_KINDS = [
  'relationship',
  'goal',
  'secret',
  'promise',
  'state',
  'preference',
  'observation',
] as const

export type DurableFactKind = (typeof DURABLE_FACT_KINDS)[number]

export const DEFAULT_DURABLE_FACT_KIND: DurableFactKind = 'observation'
export const DEFAULT_DURABLE_FACT_SALIENCE = 50
export const MAX_DURABLE_FACTS = 12

export interface DurableFact {
  kind: DurableFactKind
  subject: string
  content: string
  salience: number
  updatedAt: number
}

/** Runtime character instance */
export interface Character {
  id: string
  name: string
  description: string
  personality: string
  currentSceneId: string
  memory: DurableFact[]
}

/** A player-controlled character */
export interface PlayerCharacter extends Character {
  playerId: string
}

/** An NPC driven by LLM */
export interface NpcCharacter extends Character {
  systemPrompt: string
}

export type NpcTurnDecision = 'silent' | 'respond'

export interface NpcRuntimeState {
  sessionKey: string
  agentId?: string
  memory: DurableFact[]
}

export interface NpcTurnContext {
  sessionKey: string
  agentId?: string
  scene: Scene
  gameType: GameType
  recentMessages: Message[]
  latestPlayerMessage: string
  playerName: string
}

export interface NpcTurnResult {
  decision: NpcTurnDecision
  reply: string
  memory: DurableFact[]
  agentId: string
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

export interface MessageMetadata {
  id: string
  timestamp: number
}

export interface MessageInput extends Omit<Message, 'id' | 'timestamp'> {
  id?: string
  timestamp?: number
}

export function createMessageId(prefix = 'msg'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createMessageMetadata(
  prefix = 'msg',
  overrides: Partial<MessageMetadata> = {},
): MessageMetadata {
  return {
    id: overrides.id ?? createMessageId(prefix),
    timestamp: overrides.timestamp ?? Date.now(),
  }
}

export function normalizeDurableFact(
  item: unknown,
  options: {
    fallbackTimestamp?: number
    defaultSubject?: string
  } = {},
): DurableFact | null {
  const fallbackTimestamp = options.fallbackTimestamp ?? Date.now()
  const defaultSubject = options.defaultSubject ?? 'general'

  if (typeof item === 'string') {
    const content = item.trim()
    if (!content) {
      return null
    }

    return {
      kind: DEFAULT_DURABLE_FACT_KIND,
      subject: defaultSubject,
      content,
      salience: DEFAULT_DURABLE_FACT_SALIENCE,
      updatedAt: fallbackTimestamp,
    }
  }

  if (!item || typeof item !== 'object') {
    return null
  }

  const record = item as Record<string, unknown>
  const content = getNonEmptyString(record.content) ?? getNonEmptyString(record.fact) ?? getNonEmptyString(record.text)
  if (!content) {
    return null
  }

  return {
    kind: normalizeDurableFactKind(record.kind ?? record.type),
    subject: getNonEmptyString(record.subject) ?? defaultSubject,
    content,
    salience: normalizeDurableFactSalience(record.salience),
    updatedAt: normalizeDurableFactTimestamp(record.updatedAt ?? record.timestamp, fallbackTimestamp),
  }
}

export function normalizeDurableMemory(
  memory: readonly unknown[],
  options: {
    fallbackTimestamp?: number
    defaultSubject?: string
  } = {},
): DurableFact[] {
  const unique = new Map<string, DurableFact>()

  for (const item of memory) {
    const fact = normalizeDurableFact(item, options)
    if (!fact) {
      continue
    }

    const key = getDurableFactKey(fact)
    const existing = unique.get(key)
    if (!existing) {
      unique.set(key, fact)
      continue
    }

    unique.set(key, {
      ...existing,
      salience: Math.max(existing.salience, fact.salience),
      updatedAt: Math.max(existing.updatedAt, fact.updatedAt),
    })
  }

  return [...unique.values()]
    .sort(
      (left, right) =>
        right.salience - left.salience ||
        right.updatedAt - left.updatedAt ||
        left.kind.localeCompare(right.kind) ||
        left.subject.localeCompare(right.subject) ||
        left.content.localeCompare(right.content),
    )
    .slice(0, MAX_DURABLE_FACTS)
}

function getNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeDurableFactKind(value: unknown): DurableFactKind {
  if (typeof value !== 'string') {
    return DEFAULT_DURABLE_FACT_KIND
  }

  return DURABLE_FACT_KINDS.includes(value as DurableFactKind)
    ? (value as DurableFactKind)
    : DEFAULT_DURABLE_FACT_KIND
}

function normalizeDurableFactSalience(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_DURABLE_FACT_SALIENCE
  }

  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeDurableFactTimestamp(value: unknown, fallbackTimestamp: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallbackTimestamp
  }

  return Math.round(value)
}

function getDurableFactKey(fact: DurableFact): string {
  return [fact.kind, fact.subject, fact.content].map((part) => part.trim().toLowerCase()).join('::')
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
