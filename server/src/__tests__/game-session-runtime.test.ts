import { describe, expect, it, vi } from 'vitest'
import type { LlmClient, CharacterConfig, GameConfig } from '@drama-mud/engine'
import { DEFAULT_NPC_CONTEXT_MAX_MESSAGES } from '../npc-context-window.js'
import { GameSession } from '../session/game-session.js'
import type { NpcTurnAdapter } from '../runtime/optimus-runtime.js'

const config: GameConfig = {
  name: 'power-trip-fixed',
  displayName: '权谋局',
  type: 'power-trip',
  roleMode: 'fixed',
  description: '宫廷权谋',
}

const characters: CharacterConfig[] = [
  {
    id: 'hero',
    name: '主角',
    description: '初入局的主角',
    personality: '沉着',
    isNpc: false,
  },
  {
    id: 'advisor',
    name: '谋士',
    description: '善谋的军师',
    personality: '冷静、机敏',
    isNpc: true,
  },
]

const llmClient: LlmClient = {
  chat: vi.fn(),
  chatStream: vi.fn(),
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

function createHistoryMessage(index: number) {
  return {
    id: `history-${index}`,
    senderId: index % 2 === 0 ? 'hero' : 'advisor',
    senderName: index % 2 === 0 ? '主角' : '谋士',
    content: `历史消息-${index}`,
    timestamp: index,
    type: 'dialog' as const,
  }
}

describe('GameSession runtime adapter integration', () => {
  it('does not emit NPC output when the runtime decides to stay silent', async () => {
    const runtimeAdapter: NpcTurnAdapter = {
      runTurn: vi.fn().mockResolvedValue({
        decision: 'silent',
        reason: 'Not relevant this turn.',
        runtimeSession: {
          agentId: 'room-1:advisor',
        },
      }),
    }

    const session = new GameSession('room-1', config, characters, '# 世界', llmClient, {
      npcBackend: 'agent-runtime',
      runtimeAdapter,
    })

    session.assignCharacter('player-1', 'Alice', 'hero')

    const onChunk = vi.fn()
    const onNpcDone = vi.fn()
    const result = await session.handlePlayerMessage('player-1', '你好', onChunk, onNpcDone, {
      playerMessageId: 'player-msg-1',
      playerMessageTimestamp: 100,
    })

    expect(result.responseCount).toBe(0)
    expect(result.playerMessage).toMatchObject({
      id: 'player-msg-1',
      timestamp: 100,
      senderId: 'hero',
      senderName: '主角',
      content: '你好',
    })
    expect(onChunk).not.toHaveBeenCalled()
    expect(onNpcDone).not.toHaveBeenCalled()
    expect(session.getMessages()).toHaveLength(1)
    expect(session.getMessages()[0]?.content).toBe('你好')
  })

  it('reuses the runtime agent_id across turns for the same npc session', async () => {
    const runtimeAdapter: NpcTurnAdapter = {
      runTurn: vi
        .fn()
        .mockResolvedValueOnce({
          decision: 'respond',
          reply: '先稳住局势。',
          runtimeSession: {
            agentId: 'runtime-agent-42',
            sessionId: 'runtime-session-42',
          },
        })
        .mockResolvedValueOnce({
          decision: 'silent',
          runtimeSession: {
            agentId: 'runtime-agent-42',
            sessionId: 'runtime-session-42',
          },
        }),
    }

    const session = new GameSession('room-1', config, characters, '# 世界', llmClient, {
      npcBackend: 'agent-runtime',
      runtimeAdapter,
    })

    session.assignCharacter('player-1', 'Alice', 'hero')

    const onChunk = vi.fn<(message: { id: string; timestamp: number }, chunk: string) => void>()
    const onNpcDone = vi.fn<(message: { id: string; timestamp: number; content: string }) => void>()

    await expect(session.handlePlayerMessage('player-1', '第一句', onChunk, onNpcDone)).resolves.toMatchObject({
      responseCount: 1,
    })
    await expect(session.handlePlayerMessage('player-1', '第二句', onChunk, onNpcDone)).resolves.toMatchObject({
      responseCount: 0,
    })

    expect(runtimeAdapter.runTurn).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        roomId: 'room-1',
        npc: expect.objectContaining({ id: 'advisor' }),
      }),
      {
        agentId: 'room-1:advisor',
        sessionId: undefined,
      },
    )
    expect(runtimeAdapter.runTurn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        roomId: 'room-1',
        npc: expect.objectContaining({ id: 'advisor' }),
      }),
      {
        agentId: 'runtime-agent-42',
        sessionId: 'runtime-session-42',
      },
    )
    expect(onChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        senderId: 'advisor',
        senderName: '谋士',
        type: 'dialog',
      }),
      '先稳住局势。',
    )
    expect(onNpcDone).toHaveBeenCalledWith(
      expect.objectContaining({
        senderId: 'advisor',
        senderName: '谋士',
        content: '先稳住局势。',
        type: 'dialog',
      }),
    )

    const chunkMessage = onChunk.mock.calls[0]?.[0]
    const doneMessage = onNpcDone.mock.calls[0]?.[0]
    expect(doneMessage?.id).toBe(chunkMessage?.id)
    expect(doneMessage?.timestamp).toBe(chunkMessage?.timestamp)
  })

  it('suppresses runtime replies that are not Chinese enough', async () => {
    const runtimeAdapter: NpcTurnAdapter = {
      runTurn: vi.fn().mockResolvedValue({
        decision: 'respond',
        reply: 'Hold the line，快！',
        runtimeSession: {
          agentId: 'runtime-agent-99',
        },
      }),
    }

    const session = new GameSession('room-english-runtime', config, characters, '# 世界', llmClient, {
      npcBackend: 'agent-runtime',
      runtimeAdapter,
    })

    session.assignCharacter('player-1', 'Alice', 'hero')

    const onChunk = vi.fn()
    const onNpcDone = vi.fn()

    await expect(session.handlePlayerMessage('player-1', '快说', onChunk, onNpcDone)).resolves.toMatchObject({
      responseCount: 0,
    })

    expect(onChunk).not.toHaveBeenCalled()
    expect(onNpcDone).not.toHaveBeenCalled()
    expect(session.getMessages().map((message) => message.content)).not.toContain('Hold the line，快！')
  })

  it('emits every runtime reply that chooses to speak and sanitizes each one', async () => {
    const multiNpcCharacters: CharacterConfig[] = [
      ...characters,
      {
        id: 'guard',
        name: '护卫',
        description: '守在门外的护卫',
        personality: '寡言、警觉',
        isNpc: true,
      },
    ]

    const runtimeAdapter: NpcTurnAdapter = {
      runTurn: vi
        .fn()
        .mockResolvedValueOnce({
          decision: 'respond',
          reply: '操！这他妈什么动静？！……老子才不怕！',
          runtimeSession: {
            agentId: 'runtime-agent-42',
          },
        })
        .mockResolvedValueOnce({
          decision: 'respond',
          reply: '这一句不该被触发。',
          runtimeSession: {
            agentId: 'runtime-agent-43',
          },
        }),
    }

    const session = new GameSession('room-2', config, multiNpcCharacters, '# 世界', llmClient, {
      npcBackend: 'agent-runtime',
      runtimeAdapter,
    })

    session.assignCharacter('player-1', 'Alice', 'hero')

    const onChunk = vi.fn<(message: { id: string; timestamp: number; senderId: string }, chunk: string) => void>()
    const onNpcDone = vi.fn<(message: { id: string; timestamp: number; senderId: string; content: string }) => void>()

    await expect(session.handlePlayerMessage('player-1', '谁来答话', onChunk, onNpcDone)).resolves.toMatchObject({
      responseCount: 2,
    })

    expect(runtimeAdapter.runTurn).toHaveBeenCalledTimes(2)
    expect(onNpcDone).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        senderId: 'advisor',
        content: '糟了！这什么动静？！……我才不怕！',
      }),
    )
    expect(onNpcDone).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        senderId: 'guard',
        content: '这一句不该被触发。',
      }),
    )

    const firstChunkMessage = onChunk.mock.calls[0]?.[0]
    const firstDoneMessage = onNpcDone.mock.calls[0]?.[0]
    expect(firstDoneMessage?.id).toBe(firstChunkMessage?.id)
    expect(firstDoneMessage?.timestamp).toBe(firstChunkMessage?.timestamp)
  })

  it('starts the next runtime NPC while waiting on a silent candidate', async () => {
    const multiNpcCharacters: CharacterConfig[] = [
      ...characters,
      {
        id: 'guard',
        name: '护卫',
        description: '守在门外的护卫',
        personality: '寡言、警觉',
        isNpc: true,
      },
    ]

    const firstTurn = createDeferred<Awaited<ReturnType<NpcTurnAdapter['runTurn']>>>()
    const runtimeAdapter: NpcTurnAdapter = {
      runTurn: vi
        .fn()
        .mockImplementationOnce(() => firstTurn.promise)
        .mockResolvedValueOnce({
          decision: 'respond',
          reply: '护卫先接话。',
          runtimeSession: {
            agentId: 'runtime-agent-guard',
          },
        }),
    }

    const session = new GameSession('room-4', config, multiNpcCharacters, '# 世界', llmClient, {
      npcBackend: 'agent-runtime',
      runtimeAdapter,
    })

    session.assignCharacter('player-1', 'Alice', 'hero')

    const onChunk = vi.fn()
    const onNpcDone = vi.fn()
    const turnPromise = session.handlePlayerMessage('player-1', '有人回应吗', onChunk, onNpcDone)

    await Promise.resolve()

    expect(runtimeAdapter.runTurn).toHaveBeenCalledTimes(2)
    expect(runtimeAdapter.runTurn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        npc: expect.objectContaining({ id: 'guard' }),
      }),
      {
        agentId: 'room-4:guard',
        sessionId: undefined,
      },
    )

    firstTurn.resolve({
      decision: 'silent',
      runtimeSession: {
        agentId: 'runtime-agent-advisor',
      },
    })

    await expect(turnPromise).resolves.toMatchObject({
      responseCount: 1,
    })

    expect(onNpcDone).toHaveBeenCalledWith(
      expect.objectContaining({
        senderId: 'guard',
        content: '护卫先接话。',
      }),
    )
  })

  it('rejects English-only runtime replies and keeps scanning until the first Chinese reply', async () => {
    const multiNpcCharacters: CharacterConfig[] = [
      ...characters,
      {
        id: 'guard',
        name: '护卫',
        description: '守在门外的护卫',
        personality: '寡言、警觉',
        isNpc: true,
      },
    ]

    const runtimeAdapter: NpcTurnAdapter = {
      runTurn: vi
        .fn()
        .mockResolvedValueOnce({
          decision: 'respond',
          reply: 'I can cover the west gate.',
          runtimeSession: {
            agentId: 'runtime-agent-advisor',
          },
        })
        .mockResolvedValueOnce({
          decision: 'respond',
          reply: '西门交给我。',
          runtimeSession: {
            agentId: 'runtime-agent-guard',
          },
        }),
    }

    const session = new GameSession('room-runtime-guardrail', config, multiNpcCharacters, '# 世界', llmClient, {
      npcBackend: 'agent-runtime',
      runtimeAdapter,
    })

    session.assignCharacter('player-1', 'Alice', 'hero')

    const onChunk = vi.fn()
    const onNpcDone = vi.fn()

    await expect(session.handlePlayerMessage('player-1', '谁去守门', onChunk, onNpcDone)).resolves.toMatchObject({
      responseCount: 1,
    })

    expect(runtimeAdapter.runTurn).toHaveBeenCalledTimes(2)
    expect(onChunk).toHaveBeenCalledWith(expect.objectContaining({ senderId: 'guard' }), '西门交给我。')
    expect(onNpcDone).toHaveBeenCalledWith(
      expect.objectContaining({
        senderId: 'guard',
        content: '西门交给我。',
      }),
    )
    expect(session.getMessages().map((message) => message.content)).not.toContain('I can cover the west gate.')
  })

  it('passes the shared recent context window into the runtime adapter', async () => {
    const runTurn = vi.fn().mockResolvedValue({
      decision: 'silent',
      runtimeSession: {
        agentId: 'runtime-agent-context',
      },
    })
    const runtimeAdapter: NpcTurnAdapter = { runTurn }

    const session = new GameSession('room-context', config, characters, '# 世界', llmClient, {
      npcBackend: 'agent-runtime',
      runtimeAdapter,
      initialMessages: Array.from({ length: DEFAULT_NPC_CONTEXT_MAX_MESSAGES + 5 }, (_, index) =>
        createHistoryMessage(index + 1),
      ),
    })

    session.assignCharacter('player-1', 'Alice', 'hero')

    await session.handlePlayerMessage('player-1', '最新一句', vi.fn(), vi.fn())

    expect(runtimeAdapter.runTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        recentMessages: expect.arrayContaining([
          expect.objectContaining({ content: '历史消息-7' }),
          expect.objectContaining({ content: '历史消息-25' }),
          expect.objectContaining({ content: '最新一句' }),
        ]),
        latestPlayerMessage: expect.objectContaining({
          content: '最新一句',
        }),
      }),
      expect.anything(),
    )

    const recentMessages = runTurn.mock.calls[0]?.[0]?.recentMessages
    expect(recentMessages).toHaveLength(DEFAULT_NPC_CONTEXT_MAX_MESSAGES)
    expect(recentMessages?.[0]?.content).toBe('历史消息-7')
    expect(recentMessages?.at(-1)?.content).toBe('最新一句')
  })
})
