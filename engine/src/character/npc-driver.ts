import { normalizeDurableMemory } from '../types/index.js'
import type { DurableFact, NpcCharacter, Scene, GameType, Message, NpcTurnContext, NpcTurnResult } from '../types/index.js'
import type { LlmClient } from '../llm/client.js'
import { buildNpcRuntimeUserPrompt, buildNpcSystemPrompt } from '../llm/prompts.js'

interface RawNpcTurnResult {
  decision?: unknown
  reply?: unknown
  memory?: unknown
}

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

  async decideTurn(npc: NpcCharacter, context: NpcTurnContext): Promise<NpcTurnResult> {
    const systemPrompt = buildNpcSystemPrompt(npc, context.scene, context.gameType)
    const userPrompt = buildNpcRuntimeUserPrompt({
      npc,
      sessionKey: context.sessionKey,
      recentMessages: context.recentMessages,
      latestPlayerMessage: context.latestPlayerMessage,
      playerName: context.playerName,
    })

    const rawResponse = await this.llmClient.chat([
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ])

    return normalizeTurnResult(rawResponse, context.agentId ?? context.sessionKey, npc.memory)
  }
}

function normalizeTurnResult(rawResponse: string, agentId: string, fallbackMemory: readonly unknown[]): NpcTurnResult {
  const now = Date.now()
  const parsed = parseTurnResult(rawResponse)
  if (!parsed) {
    const reply = rawResponse.trim()
    return {
      decision: reply ? 'respond' : 'silent',
      reply,
      memory: normalizeMemory(fallbackMemory, now),
      agentId,
    }
  }

  const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : ''
  const decision = parsed.decision === 'respond' && reply ? 'respond' : 'silent'

  return {
    decision,
    reply,
    memory: normalizeMemory(Array.isArray(parsed.memory) ? parsed.memory : fallbackMemory, now),
    agentId,
  }
}

function parseTurnResult(rawResponse: string): RawNpcTurnResult | null {
  const candidates = [
    rawResponse.trim(),
    rawResponse.match(/```json\s*([\s\S]*?)```/i)?.[1]?.trim(),
    rawResponse.match(/\{[\s\S]*\}/)?.[0]?.trim(),
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object') {
        return parsed as RawNpcTurnResult
      }
    } catch {
      continue
    }
  }

  return null
}

export function normalizeMemory(memory: readonly unknown[], fallbackTimestamp = Date.now()): DurableFact[] {
  return normalizeDurableMemory(memory, {
    fallbackTimestamp,
    defaultSubject: 'general',
  })
}
