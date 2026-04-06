import {
  type GameConfig,
  type CharacterConfig,
  type NpcCharacter,
  type Scene,
  type Message,
  DialogManager,
  NpcDriver,
  type LlmClient,
} from '@drama-mud/engine'

/** Minimal scene used when world.md is not parsed into structured scenes */
const DEFAULT_SCENE: Scene = {
  id: 'main',
  name: 'Main Scene',
  description: 'The story unfolds here.',
  connectedScenes: [],
}

/** Player info stored in session */
export interface SessionPlayer {
  id: string
  name: string
  characterId: string
  characterName: string
}

/**
 * GameSession ties a room to engine components.
 * One session per room. Manages dialog, NPC drivers, and player-character bindings.
 */
export class GameSession {
  private dialog: DialogManager
  private npcDriver: NpcDriver
  private players: Map<string, SessionPlayer> = new Map()
  private scene: Scene = DEFAULT_SCENE

  constructor(
    public readonly roomId: string,
    public readonly config: GameConfig,
    public readonly characters: CharacterConfig[],
    public readonly worldMd: string,
    llmClient: LlmClient,
  ) {
    this.dialog = new DialogManager(50)
    this.npcDriver = new NpcDriver(llmClient)

    // Try to extract scene info from config or worldMd
    if (config.world?.scenes?.[0]) {
      this.scene = config.world.scenes[0]
    }
  }

  /** Assign a player to a character. Returns the character config or null if taken/invalid. */
  assignCharacter(playerId: string, playerName: string, characterId: string): CharacterConfig | null {
    const char = this.characters.find((c) => c.id === characterId && !c.isNpc)
    if (!char) return null

    // Check if already taken by another player
    for (const p of this.players.values()) {
      if (p.characterId === characterId && p.id !== playerId) return null
    }

    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      characterId: char.id,
      characterName: char.name,
    })

    return char
  }

  /** Get available (non-NPC) characters that haven't been claimed */
  getAvailableCharacters(): CharacterConfig[] {
    const taken = new Set([...this.players.values()].map((p) => p.characterId))
    return this.characters.filter((c) => !c.isNpc && !taken.has(c.id))
  }

  /** Get NPC characters */
  getNpcCharacters(): CharacterConfig[] {
    return this.characters.filter((c) => c.isNpc)
  }

  /** Get a player's assigned character info */
  getPlayer(playerId: string): SessionPlayer | undefined {
    return this.players.get(playerId)
  }

  /** Remove a player */
  removePlayer(playerId: string): void {
    this.players.delete(playerId)
  }

  /**
   * Handle a player message: add to dialog, then stream NPC responses.
   * Calls onChunk for each streamed text chunk, onNpcDone when an NPC finishes.
   */
  async handlePlayerMessage(
    playerId: string,
    content: string,
    onChunk: (npcId: string, npcName: string, chunk: string) => void,
    onNpcDone: (npcId: string, npcName: string, fullText: string) => void,
  ): Promise<void> {
    const player = this.players.get(playerId)
    if (!player) return

    // Add player message to dialog
    this.dialog.addMessage({
      senderId: player.characterId,
      senderName: player.characterName,
      content,
      type: 'dialog',
    })

    const recentMessages = this.dialog.getRecentMessages(20)
    const npcs = this.getNpcCharacters()

    // For MVP: only the first NPC responds (simplest possible behavior)
    // Future: pick contextually relevant NPCs
    const respondingNpc = npcs[0]
    if (!respondingNpc) return

    const npcChar: NpcCharacter = {
      id: respondingNpc.id,
      name: respondingNpc.name,
      description: respondingNpc.description,
      personality: respondingNpc.personality,
      systemPrompt: '',
      currentSceneId: this.scene.id,
      memory: [],
    }

    const fullText = await this.npcDriver.generateResponseStream(
      npcChar,
      this.scene,
      this.config.type,
      recentMessages,
      (chunk) => onChunk(respondingNpc.id, respondingNpc.name, chunk),
    )

    // Record NPC response in dialog
    this.dialog.addMessage({
      senderId: respondingNpc.id,
      senderName: respondingNpc.name,
      content: fullText,
      type: 'dialog',
    })

    onNpcDone(respondingNpc.id, respondingNpc.name, fullText)
  }

  /** Get all dialog messages */
  getMessages(): Message[] {
    return this.dialog.getAllMessages()
  }
}
