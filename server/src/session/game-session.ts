import {
  type CharacterConfig,
  createMessageMetadata,
  DialogManager,
  type DurableFact,
  type GameConfig,
  type LlmClient,
  type Message,
  NpcDriver,
  type NpcCharacter,
  type Scene,
} from '@drama-mud/engine'
import { buildRecentNpcContext } from '../npc-context-window.js'
import type { NpcTurnAdapter, RuntimeSessionRef } from '../runtime/optimus-runtime.js'

const DEFAULT_SCENE: Scene = {
  id: 'main',
  name: 'Main Scene',
  description: 'The story unfolds here.',
  connectedScenes: [],
}

export interface SessionPlayer {
  id: string
  name: string
  characterId: string
  characterName: string
}

interface GameSessionOptions {
  npcBackend?: 'agent-runtime' | 'llm'
  runtimeAdapter?: NpcTurnAdapter
  initialMessages?: Message[]
}

interface NpcSessionState {
  sessionKey: string
  runtimeSession: RuntimeSessionRef
  memory: DurableFact[]
}

type MessageRef = Pick<Message, 'id' | 'senderId' | 'senderName' | 'timestamp' | 'type'>
type SettledResult<T> = { ok: true; value: T } | { ok: false; error: unknown }

export interface PlayerTurnOptions {
  playerMessageId?: string
  playerMessageTimestamp?: number
  npcBackend?: 'agent-runtime' | 'llm'
}

export interface PlayerTurnResult {
  playerMessage: Message
  responseCount: number
}

export class GameSession {
  private dialog: DialogManager
  private npcDriver: NpcDriver
  private players: Map<string, SessionPlayer> = new Map()
  private npcSessions: Map<string, NpcSessionState> = new Map()
  private scene: Scene = DEFAULT_SCENE
  private restoredMessages: Message[]

  constructor(
    public readonly roomId: string,
    public readonly config: GameConfig,
    public readonly characters: CharacterConfig[],
    public readonly worldMd: string,
    llmClient: LlmClient,
    private readonly options?: GameSessionOptions,
  ) {
    this.dialog = new DialogManager(50)
    this.restoredMessages = [...(options?.initialMessages ?? [])].slice(-50)
    this.npcDriver = new NpcDriver(llmClient)

    if (config.world?.scenes?.[0]) {
      this.scene = config.world.scenes[0]
    }
  }

  assignCharacter(playerId: string, playerName: string, characterId: string): CharacterConfig | null {
    const char = this.characters.find((character) => character.id === characterId && !character.isNpc)
    if (!char) return null

    for (const player of this.players.values()) {
      if (player.characterId === characterId && player.id !== playerId) return null
    }

    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      characterId: char.id,
      characterName: char.name,
    })

    return char
  }

  getAvailableCharacters(): CharacterConfig[] {
    const taken = new Set([...this.players.values()].map((player) => player.characterId))
    return this.characters.filter((character) => !character.isNpc && !taken.has(character.id))
  }

  getNpcCharacters(): CharacterConfig[] {
    return this.characters.filter((character) => character.isNpc)
  }

  getPlayer(playerId: string): SessionPlayer | undefined {
    return this.players.get(playerId)
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId)
  }

  async handlePlayerMessage(
    playerId: string,
    content: string,
    onChunk: (message: MessageRef, chunk: string) => void,
    onNpcDone: (message: Message) => void,
    options?: PlayerTurnOptions,
  ): Promise<PlayerTurnResult> {
    const player = this.players.get(playerId)
    if (!player) {
      throw new Error('玩家状态已失效，请重新加入房间')
    }

    const playerMessage = this.dialog.addMessage({
      id: options?.playerMessageId,
      timestamp: options?.playerMessageTimestamp,
      senderId: player.characterId,
      senderName: player.characterName,
      content,
      type: 'dialog',
    })

    const recentMessages = buildRecentNpcContext(this.getMessages())
    const npcs = this.getNpcCharacters()
    if (npcs.length === 0) {
      throw new Error('当前房间没有可响应的 NPC，无法生成回复')
    }

    const npcBackend = options?.npcBackend ?? this.options?.npcBackend ?? 'llm'
    const responseCount =
      npcBackend === 'agent-runtime' && this.options?.runtimeAdapter
        ? await this.handlePlayerMessageWithRuntime(player, content, recentMessages, npcs, onChunk, onNpcDone)
        : await this.handlePlayerMessageWithLlm(player, content, recentMessages, npcs, onChunk, onNpcDone)

    return {
      playerMessage,
      responseCount,
    }
  }

  getMessages(): Message[] {
    return [...this.restoredMessages, ...this.dialog.getAllMessages()]
  }

  recordSystemMessage(message: Message): Message {
    return this.dialog.addMessage(message)
  }

  private async handlePlayerMessageWithRuntime(
    player: SessionPlayer,
    content: string,
    recentMessages: Message[],
    npcs: CharacterConfig[],
    onChunk: (message: MessageRef, chunk: string) => void,
    onNpcDone: (message: Message) => void,
  ): Promise<number> {
    const evaluations = npcs.map((npc) => {
      const sessionState = this.getNpcSessionState(npc.id)
      return {
        npc,
        sessionState,
        runtimeSession: {
          agentId: sessionState.runtimeSession.agentId ?? sessionState.sessionKey,
          sessionId: sessionState.runtimeSession.sessionId,
        },
      }
    })

    const replies = await this.collectNpcReplies(
      evaluations,
      ({ npc, runtimeSession }) =>
        this.options!.runtimeAdapter!.runTurn(
          {
            roomId: this.roomId,
            game: this.config,
            scene: this.scene,
            worldMd: this.worldMd,
            npc,
            recentMessages,
            latestPlayerMessage: {
              playerName: player.name,
              characterName: player.characterName,
              content,
            },
          },
          runtimeSession,
        ),
      ({ sessionState }, result) => {
        sessionState.runtimeSession = {
          agentId: result.runtimeSession?.agentId ?? sessionState.runtimeSession.agentId ?? sessionState.sessionKey,
          sessionId: result.runtimeSession?.sessionId ?? sessionState.runtimeSession.sessionId,
        }

        if (result.decision !== 'respond') {
          return null
        }

        return getVisibleNpcReply(result.reply)
      },
    )

    for (const reply of replies) {
      this.emitNpcReply(reply.npc, reply.reply, onChunk, onNpcDone)
    }

    return replies.length
  }

  private async handlePlayerMessageWithLlm(
    player: SessionPlayer,
    content: string,
    recentMessages: Message[],
    npcs: CharacterConfig[],
    onChunk: (message: MessageRef, chunk: string) => void,
    onNpcDone: (message: Message) => void,
  ): Promise<number> {
    const evaluations = npcs.map((npc) => {
      const sessionState = this.getNpcSessionState(npc.id)
      const npcCharacter: NpcCharacter = {
        id: npc.id,
        name: npc.name,
        description: npc.description,
        personality: npc.personality,
        systemPrompt: '',
        currentSceneId: this.scene.id,
        memory: [...sessionState.memory],
      }

      return {
        npc,
        sessionState,
        npcCharacter,
        agentId: sessionState.runtimeSession.agentId ?? sessionState.sessionKey,
      }
    })

    const replies = await this.collectNpcReplies(
      evaluations,
      ({ npcCharacter, sessionState, agentId }) =>
        this.npcDriver.decideTurn(npcCharacter, {
          sessionKey: sessionState.sessionKey,
          agentId,
          scene: this.scene,
          gameType: this.config.type,
          recentMessages,
          latestPlayerMessage: content,
          playerName: player.characterName,
        }),
      ({ sessionState }, result) => {
        sessionState.runtimeSession.agentId = result.agentId
        sessionState.memory = result.memory

        if (result.decision !== 'respond') {
          return null
        }

        return getVisibleNpcReply(result.reply)
      },
    )

    for (const reply of replies) {
      this.emitNpcReply(reply.npc, reply.reply, onChunk, onNpcDone)
    }

    return replies.length
  }

  private async collectNpcReplies<TItem extends { npc: CharacterConfig }, TResult>(
    items: readonly TItem[],
    runTurn: (item: TItem) => Promise<TResult>,
    getReply: (item: TItem, result: TResult) => string | null,
  ): Promise<Array<{ npc: CharacterConfig; reply: string }>> {
    const settledResults = await Promise.all(items.map((item) => toSettled(runTurn(item))))
    const replies: Array<{ npc: CharacterConfig; reply: string }> = []
    let firstError: unknown

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]!
      const settled = settledResults[index]!

      if (!settled.ok) {
        firstError ??= settled.error
        continue
      }

      const reply = getReply(item, settled.value)
      if (reply) {
        replies.push({
          npc: item.npc,
          reply,
        })
      }
    }

    if (firstError) {
      throw firstError
    }

    return replies
  }

  private emitNpcReply(
    npc: CharacterConfig,
    reply: string,
    onChunk: (message: MessageRef, chunk: string) => void,
    onNpcDone: (message: Message) => void,
  ): void {
    const messageRef: MessageRef = {
      ...createMessageMetadata(`npc-${npc.id}`),
      senderId: npc.id,
      senderName: npc.name,
      type: 'dialog',
    }

    for (const chunk of chunkText(reply)) {
      onChunk(messageRef, chunk)
    }

    const finalMessage = this.dialog.addMessage({
      ...messageRef,
      content: reply,
    })
    onNpcDone(finalMessage)
  }

  private getNpcSessionState(characterId: string): NpcSessionState {
    const sessionKey = `${this.roomId}:${characterId}`
    let state = this.npcSessions.get(sessionKey)

    if (!state) {
      state = {
        sessionKey,
        runtimeSession: {
          agentId: sessionKey,
        },
        memory: [],
      }
      this.npcSessions.set(sessionKey, state)
    }

    return state
  }
}

async function toSettled<T>(promise: Promise<T>): Promise<SettledResult<T>> {
  try {
    return {
      ok: true,
      value: await promise,
    }
  } catch (error) {
    return {
      ok: false,
      error,
    }
  }
}

function chunkText(content: string): string[] {
  const normalized = content.trim()
  if (!normalized) {
    return []
  }

  const sentenceChunks = normalized
    .split(/(?<=[。！？!?…\n])/u)
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (sentenceChunks.length === 0) {
    return [normalized]
  }

  const chunks: string[] = []
  let buffer = ''

  for (const segment of sentenceChunks) {
    if ((buffer + segment).length <= 48) {
      buffer += segment
      continue
    }

    if (buffer) {
      chunks.push(buffer)
      buffer = ''
    }

    if (segment.length <= 48) {
      buffer = segment
      continue
    }

    for (let index = 0; index < segment.length; index += 48) {
      chunks.push(segment.slice(index, index + 48))
    }
  }

  if (buffer) {
    chunks.push(buffer)
  }

  return chunks
}

const NPC_REPLY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/他妈的?/gu, ''],
  [/他娘的/gu, ''],
  [/妈的/gu, '可恶'],
  [/老子/gu, '我'],
  [/滚蛋/gu, '走开'],
  [/混蛋/gu, '家伙'],
  [/傻[逼B币比]/gu, '家伙'],
  [/去死/gu, '住手'],
  [/(^|[\s，。！？、…,.!?])操(?=($|[\s，。！？、…,.!?]))/gu, '$1糟了'],
  [/操(?=[！!？?])/gu, '糟了'],
]

function sanitizeNpcReply(content: string): string {
  let sanitized = content.trim()
  if (!sanitized) {
    return ''
  }

  for (const [pattern, replacement] of NPC_REPLY_REPLACEMENTS) {
    sanitized = sanitized.replace(pattern, replacement)
  }

  sanitized = sanitized
    .replace(/\s{2,}/gu, ' ')
    .replace(/\s+([，。！？、…,.!?])/gu, '$1')
    .replace(/([，。！？、…,.!?])\s+/gu, '$1')
    .trim()

  const meaningfulText = sanitized.replace(/[\s，。！？、…,.!?~～-]/gu, '')
  return meaningfulText ? sanitized : ''
}

function getVisibleNpcReply(content: string | null | undefined): string | null {
  if (!content?.trim()) {
    return null
  }

  const reply = sanitizeNpcReply(content)
  return isChineseNpcReply(reply) ? reply : null
}

function isChineseNpcReply(content: string): boolean {
  const hanCharacterCount = (content.match(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/gu) ?? []).length
  if (hanCharacterCount === 0) {
    return false
  }

  const latinLetterCount = (content.match(/[A-Za-z]/g) ?? []).length
  if (latinLetterCount === 0) {
    return true
  }

  return hanCharacterCount >= 2 && hanCharacterCount >= latinLetterCount
}
