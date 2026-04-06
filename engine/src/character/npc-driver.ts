import type { NpcCharacter, Scene, GameType, Message } from '../types/index.js'
import type { LlmClient } from '../llm/client.js'
import { buildNpcSystemPrompt } from '../llm/prompts.js'

/** Drives NPC behavior using LLM */
export class NpcDriver {
  constructor(private llmClient: LlmClient) {}

  /** Generate an NPC response to a player action */
  async generateResponse(
    npc: NpcCharacter,
    scene: Scene,
    gameType: GameType,
    recentMessages: Message[],
  ): Promise<string> {
    const systemPrompt = buildNpcSystemPrompt(npc, scene, gameType)

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...recentMessages.map((m) => ({
        role: (m.senderId === npc.id ? 'assistant' : 'user') as 'assistant' | 'user',
        content: `[${m.senderName}] ${m.content}`,
      })),
    ]

    return this.llmClient.chat(messages)
  }

  /** Generate NPC response with streaming */
  async generateResponseStream(
    npc: NpcCharacter,
    scene: Scene,
    gameType: GameType,
    recentMessages: Message[],
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    const systemPrompt = buildNpcSystemPrompt(npc, scene, gameType)

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...recentMessages.map((m) => ({
        role: (m.senderId === npc.id ? 'assistant' : 'user') as 'assistant' | 'user',
        content: `[${m.senderName}] ${m.content}`,
      })),
    ]

    return this.llmClient.chatStream(messages, onChunk)
  }
}
