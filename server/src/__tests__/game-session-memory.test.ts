import type { CharacterConfig, GameConfig, LlmClient } from '@drama-mud/engine'
import { describe, expect, it, vi } from 'vitest'
import { GameSession } from '../session/game-session.js'

const config: GameConfig = {
  name: 'test-game',
  displayName: 'Test Game',
  type: 'power-trip',
  roleMode: 'fixed',
  description: 'Test config',
}

const characters: CharacterConfig[] = [
  {
    id: 'hero',
    name: 'Hero',
    description: 'The player hero',
    personality: 'Brave',
    isNpc: false,
  },
  {
    id: 'npc-1',
    name: 'Advisor',
    description: 'A cautious advisor',
    personality: 'Measured and observant',
    isNpc: true,
  },
  {
    id: 'npc-2',
    name: 'Guard',
    description: 'A loyal guard',
    personality: 'Direct and vigilant',
    isNpc: true,
  },
]

describe('GameSession durable memory prompts', () => {
  it('keeps durable memory isolated per NPC while rendering structured prompt content', async () => {
    const llmClient: LlmClient & { chat: ReturnType<typeof vi.fn> } = {
      chat: vi.fn(async (messages) => {
        const systemPrompt = String(messages[0]?.content ?? '')
        const userPrompt = String(messages[1]?.content ?? '')
        const isAdvisor = systemPrompt.includes('"Advisor"')
        const isFirstTurn = userPrompt.includes('Latest player message from Hero: 先听我说')

        if (isFirstTurn && isAdvisor) {
          return JSON.stringify({
            decision: 'respond',
            reply: '操！我记得你之前的承诺。',
            memory: [
              {
                kind: 'promise',
                subject: 'Hero',
                content: '承诺过会回来',
                salience: 90,
                updatedAt: 100,
              },
            ],
          })
        }

        if (isFirstTurn) {
          return JSON.stringify({
            decision: 'silent',
            reply: '',
            memory: [],
          })
        }

        if (isAdvisor) {
          return JSON.stringify({
            decision: 'silent',
            reply: '',
            memory: [
              {
                kind: 'promise',
                subject: 'Hero',
                content: '承诺过会回来',
                salience: 90,
                updatedAt: 100,
              },
            ],
          })
        }

        return JSON.stringify({
          decision: 'respond',
          reply: '老子还记着那份承诺。',
          memory: [
            {
              kind: 'state',
              subject: 'Hero',
              content: '正在安排守卫',
              salience: 72,
              updatedAt: 200,
            },
          ],
        })
      }),
      chatStream: vi.fn(async () => ''),
    }

    const session = new GameSession('room-9', config, characters, '# world', llmClient, {
      npcBackend: 'llm',
    })

    session.assignCharacter('player-1', 'Player', 'hero')

    const done: Array<{ npcId: string; text: string }> = []

    await session.handlePlayerMessage(
      'player-1',
      '先听我说',
      () => {},
      (message) => done.push({ npcId: message.senderId, text: message.content }),
    )

    await session.handlePlayerMessage(
      'player-1',
      '现在给我答复',
      () => {},
      (message) => done.push({ npcId: message.senderId, text: message.content }),
    )

    expect(done).toEqual([
      { npcId: 'npc-1', text: '糟了！我记得你之前的承诺。' },
      { npcId: 'npc-2', text: '我还记着那份承诺。' },
    ])

    const thirdPrompt = String(llmClient.chat.mock.calls[2][0][1]?.content ?? '')
    expect(thirdPrompt).toContain('Durable memory facts (JSON):')
    expect(thirdPrompt).toContain('"kind": "promise"')
    expect(thirdPrompt).toContain('"content": "承诺过会回来"')
    expect(thirdPrompt).toContain('Latest player message from Hero: 现在给我答复')

    const fourthPrompt = String(llmClient.chat.mock.calls[3][0][1]?.content ?? '')
    expect(fourthPrompt).not.toContain('承诺过会回来')
  })
})
