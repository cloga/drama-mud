import { NpcDriver, type CharacterConfig, type GameConfig, type LlmClient } from '@drama-mud/engine'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_NPC_CONTEXT_MAX_CHARACTERS, DEFAULT_NPC_CONTEXT_MAX_MESSAGES } from '../npc-context-window.js'
import type { NpcTurnAdapter } from '../runtime/optimus-runtime.js'
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

function createLlmClient(responses: string[]): LlmClient & { chat: ReturnType<typeof vi.fn> } {
  return {
    chat: vi.fn(async () => {
      const response = responses.shift()
      if (response === undefined) {
        throw new Error('Missing mocked LLM response')
      }
      return response
    }),
    chatStream: vi.fn(async () => ''),
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

function createHistoryMessage(index: number, content: string) {
  return {
    id: `history-${index}`,
    senderId: index % 2 === 0 ? 'hero' : 'npc-1',
    senderName: index % 2 === 0 ? 'Hero' : 'Advisor',
    content,
    timestamp: index,
    type: 'dialog' as const,
  }
}

describe('GameSession NPC orchestration', () => {
  it('reuses per-NPC runtime agent sessions while allowing multiple runtime replies in order', async () => {
    const llmClient = createLlmClient([])
    const runNpcTurn = vi
      .fn()
      .mockImplementation(async (input: Parameters<NpcTurnAdapter['runTurn']>[0]) => {
        if (input.latestPlayerMessage.content === '第一回合' && input.npc.id === 'npc-1') {
          return {
            decision: 'respond' as const,
            reply: '第一回合由我来回答。',
            runtimeSession: {
              agentId: 'runtime-room-7-npc-1',
            },
          }
        }

        if (input.latestPlayerMessage.content === '第一回合' && input.npc.id === 'npc-2') {
          return {
            decision: 'respond' as const,
            reply: '这一句会被投机执行忽略。',
            runtimeSession: {
              agentId: 'runtime-room-7-npc-2-preview',
            },
          }
        }

        if (input.latestPlayerMessage.content === '第二回合' && input.npc.id === 'npc-1') {
          return {
            decision: 'silent' as const,
            runtimeSession: {
              agentId: 'runtime-room-7-npc-1',
            },
          }
        }

        return {
          decision: 'respond' as const,
          reply: '第二回合轮到我补充。',
          runtimeSession: {
            agentId: 'runtime-room-7-npc-2',
          },
        }
      })

    const session = new GameSession('room-7', config, characters, '# world', llmClient, {
      npcBackend: 'agent-runtime',
      runtimeAdapter: {
        runTurn: runNpcTurn,
      } as NpcTurnAdapter,
    })

    session.assignCharacter('player-1', 'Player', 'hero')

    const done: Array<{ npcId: string; text: string; id: string; timestamp: number }> = []

    await session.handlePlayerMessage(
      'player-1',
      '第一回合',
      () => {},
      (message) => done.push({ npcId: message.senderId, text: message.content, id: message.id, timestamp: message.timestamp }),
    )

    await session.handlePlayerMessage(
      'player-1',
      '第二回合',
      () => {},
      (message) => done.push({ npcId: message.senderId, text: message.content, id: message.id, timestamp: message.timestamp }),
    )

    expect(done).toEqual([
      expect.objectContaining({ npcId: 'npc-1', text: '第一回合由我来回答。' }),
      expect.objectContaining({ npcId: 'npc-2', text: '这一句会被投机执行忽略。' }),
      expect.objectContaining({ npcId: 'npc-2', text: '第二回合轮到我补充。' }),
    ])
    expect(done[0]?.id).not.toBe(done[1]?.id)
    expect(done[0]?.timestamp).toBeTypeOf('number')
    expect(done[1]?.timestamp).toBeTypeOf('number')
    expect(done[2]?.id).not.toBe(done[1]?.id)
    expect(done[2]?.timestamp).toBeTypeOf('number')

    expect(runNpcTurn).toHaveBeenCalledTimes(4)
    expect(runNpcTurn.mock.calls[0][1]?.agentId).toBe('room-7:npc-1')
    expect(runNpcTurn.mock.calls[1][1]?.agentId).toBe('room-7:npc-2')
    expect(runNpcTurn.mock.calls[2][1]?.agentId).toBe('runtime-room-7-npc-1')
    expect(runNpcTurn.mock.calls[3][1]?.agentId).toBe('runtime-room-7-npc-2-preview')
    expect(llmClient.chat).not.toHaveBeenCalled()
  })

  it('sanitizes parallel LLM replies and keeps per-NPC memory isolated', async () => {
    const llmClient: LlmClient & { chat: ReturnType<typeof vi.fn> } = {
      chat: vi.fn(async (messages) => {
        const systemPrompt = String(messages[0]?.content ?? '')
        const userPrompt = String(messages[1]?.content ?? '')
        const isAdvisor = systemPrompt.includes('"Advisor"')
        const isFirstTurn = userPrompt.includes('Latest player message from Hero: 先听我说\n')

        if (isFirstTurn && isAdvisor) {
          return JSON.stringify({
            decision: 'respond',
            reply: '操！我记得你之前的承诺。',
            memory: [
              {
                kind: 'observation',
                subject: 'Hero',
                content: 'Hero 承诺过会回来',
                salience: 88,
                updatedAt: 100,
              },
            ],
          })
        }

        if (isFirstTurn) {
          return JSON.stringify({
            decision: 'respond',
            reply: '老子会守住这里。',
            memory: [
              {
                kind: 'state',
                subject: 'Guard',
                content: 'Guard 正在把守大门',
                salience: 61,
                updatedAt: 110,
              },
            ],
          })
        }

        if (isAdvisor) {
          return JSON.stringify({
            decision: 'silent',
            reply: '',
            memory: [
              {
                kind: 'observation',
                subject: 'Hero',
                content: 'Hero 承诺过会回来',
                salience: 88,
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

    const done: Array<{ npcId: string; text: string; id: string; timestamp: number }> = []

    await session.handlePlayerMessage(
      'player-1',
      '先听我说',
      () => {},
      (message) => done.push({ npcId: message.senderId, text: message.content, id: message.id, timestamp: message.timestamp }),
    )

    await session.handlePlayerMessage(
      'player-1',
      '现在给我答复',
      () => {},
      (message) => done.push({ npcId: message.senderId, text: message.content, id: message.id, timestamp: message.timestamp }),
    )

    expect(done).toEqual([
      expect.objectContaining({ npcId: 'npc-1', text: '糟了！我记得你之前的承诺。' }),
      expect.objectContaining({ npcId: 'npc-2', text: '我会守住这里。' }),
      expect.objectContaining({ npcId: 'npc-2', text: '我还记着那份承诺。' }),
    ])
    expect(new Set(done.map((message) => message.id)).size).toBe(done.length)
    expect(llmClient.chat).toHaveBeenCalledTimes(4)

    const thirdPrompt = String(llmClient.chat.mock.calls[2][0][1]?.content ?? '')
    expect(thirdPrompt).toContain('Durable memory facts (JSON):')
    expect(thirdPrompt).toContain('"content": "Hero 承诺过会回来"')
    expect(thirdPrompt).toContain('"kind": "observation"')

    const fourthPrompt = String(llmClient.chat.mock.calls[3][0][1]?.content ?? '')
    expect(fourthPrompt).not.toContain('Hero 承诺过会回来')
    expect(fourthPrompt).toContain('Guard 正在把守大门')
  })

  it('evaluates LLM NPCs in parallel while keeping reply order stable', async () => {
    const firstTurn = createDeferred<string>()
    const llmClient: LlmClient & { chat: ReturnType<typeof vi.fn> } = {
      chat: vi
        .fn()
        .mockImplementationOnce(() => firstTurn.promise)
        .mockResolvedValueOnce(
          JSON.stringify({
            decision: 'respond',
            reply: '护卫先开口。',
            memory: [],
          }),
        ),
      chatStream: vi.fn(async () => ''),
    }

    const session = new GameSession('room-10', config, characters, '# world', llmClient, {
      npcBackend: 'llm',
    })

    session.assignCharacter('player-1', 'Player', 'hero')

    const done: Array<{ npcId: string; text: string }> = []
    const turnPromise = session.handlePlayerMessage(
      'player-1',
      '快回答我',
      () => {},
      (message) => done.push({ npcId: message.senderId, text: message.content }),
    )

    await Promise.resolve()

    expect(llmClient.chat).toHaveBeenCalledTimes(2)

    firstTurn.resolve(
      JSON.stringify({
        decision: 'silent',
        reply: '',
        memory: [],
      }),
    )

    await expect(turnPromise).resolves.toMatchObject({
      responseCount: 1,
    })

    expect(done).toEqual([{ npcId: 'npc-2', text: '护卫先开口。' }])
  })

  it('rejects English-only LLM replies and keeps scanning until the first Chinese reply', async () => {
    const llmClient: LlmClient = {
      chat: vi.fn(),
      chatStream: vi.fn(),
    }
    const decideTurn = vi
      .spyOn(NpcDriver.prototype, 'decideTurn')
      .mockResolvedValueOnce({
        decision: 'respond',
        reply: 'I can cover the west gate.',
        agentId: 'npc-1-agent',
        memory: [],
      })
      .mockResolvedValueOnce({
        decision: 'respond',
        reply: '西门交给我。',
        agentId: 'npc-2-agent',
        memory: [],
      })

    try {
      const session = new GameSession('room-llm-guardrail', config, characters, '# world', llmClient, {
        npcBackend: 'llm',
      })

      session.assignCharacter('player-1', 'Player', 'hero')

      const onChunk = vi.fn()
      const done: Array<{ npcId: string; text: string }> = []

      await expect(
        session.handlePlayerMessage(
          'player-1',
          '谁去守门',
          onChunk,
          (message) => done.push({ npcId: message.senderId, text: message.content }),
        ),
      ).resolves.toMatchObject({
        responseCount: 1,
      })

      expect(decideTurn).toHaveBeenCalledTimes(2)
      expect(onChunk).toHaveBeenCalledWith(expect.objectContaining({ senderId: 'npc-2' }), '西门交给我。')
      expect(done).toEqual([{ npcId: 'npc-2', text: '西门交给我。' }])
      expect(session.getMessages().map((message) => message.content)).not.toContain('I can cover the west gate.')
    } finally {
      decideTurn.mockRestore()
    }
  })

  it('builds the LLM recent transcript from the shared budgeted context window', async () => {
    const llmClient = createLlmClient([
      JSON.stringify({
        decision: 'silent',
        reply: '',
        memory: [],
      }),
      JSON.stringify({
        decision: 'silent',
        reply: '',
        memory: [],
      }),
    ])

    const session = new GameSession(
      'room-context',
      config,
      characters,
      '# world',
      llmClient,
      {
        npcBackend: 'llm',
        initialMessages: [
          ...Array.from({ length: 6 }, (_, index) =>
            createHistoryMessage(index + 1, '旧消息'.repeat(DEFAULT_NPC_CONTEXT_MAX_CHARACTERS)),
          ),
          ...Array.from({ length: DEFAULT_NPC_CONTEXT_MAX_MESSAGES + 5 }, (_, index) =>
            createHistoryMessage(index + 100, `短消息-${index + 1}`),
          ),
        ],
      },
    )

    session.assignCharacter('player-1', 'Player', 'hero')

    await session.handlePlayerMessage('player-1', '最新玩家发言', () => {}, () => {})

    const firstPrompt = String(llmClient.chat.mock.calls[0][0][1]?.content ?? '')
    expect(firstPrompt).toContain('短消息-7')
    expect(firstPrompt).toContain('短消息-25')
    expect(firstPrompt).toContain('Latest player message from Hero: 最新玩家发言')
    expect(firstPrompt).not.toContain('短消息-6')
    expect(firstPrompt).not.toContain('旧消息')
  })

  it('allows a turn-level llm override even when the session default backend is agent-runtime', async () => {
    const llmClient = createLlmClient([
      JSON.stringify({
        decision: 'respond',
        reply: '我来回应这一句。',
        memory: [],
      }),
      JSON.stringify({
        decision: 'silent',
        reply: '',
        memory: [],
      }),
    ])
    const runtimeAdapter: NpcTurnAdapter = {
      runTurn: vi.fn().mockResolvedValue({
        decision: 'respond',
        reply: '这句不该走 runtime。',
        runtimeSession: {
          agentId: 'runtime-agent-should-not-run',
        },
      }),
    }

    const session = new GameSession('room-llm-override', config, characters, '# world', llmClient, {
      npcBackend: 'agent-runtime',
      runtimeAdapter,
    })

    session.assignCharacter('player-1', 'Player', 'hero')

    const onChunk = vi.fn()
    const onNpcDone = vi.fn()

    await expect(
      session.handlePlayerMessage('player-1', '这轮请走 llm', onChunk, onNpcDone, {
        npcBackend: 'llm',
      }),
    ).resolves.toMatchObject({
      responseCount: 1,
    })

    expect(runtimeAdapter.runTurn).not.toHaveBeenCalled()
    expect(llmClient.chat).toHaveBeenCalled()
    expect(onNpcDone).toHaveBeenCalledWith(
      expect.objectContaining({
        senderId: 'npc-1',
        content: '我来回应这一句。',
      }),
    )
  })

  it('suppresses LLM replies that are not Chinese enough', async () => {
    const llmClient = createLlmClient([
      JSON.stringify({
        decision: 'respond',
        reply: 'Hold the line，快！',
        memory: [],
      }),
    ])

    const singleNpcCharacters: CharacterConfig[] = [characters[0]!, characters[1]!]
    const session = new GameSession('room-english-llm', config, singleNpcCharacters, '# world', llmClient, {
      npcBackend: 'llm',
    })

    session.assignCharacter('player-1', 'Player', 'hero')

    const onChunk = vi.fn()
    const onNpcDone = vi.fn()

    await expect(session.handlePlayerMessage('player-1', '现在给我答复', onChunk, onNpcDone)).resolves.toMatchObject({
      responseCount: 0,
    })

    expect(onChunk).not.toHaveBeenCalled()
    expect(onNpcDone).not.toHaveBeenCalled()
    expect(session.getMessages().map((message) => message.content)).not.toContain('Hold the line，快！')
  })
})
