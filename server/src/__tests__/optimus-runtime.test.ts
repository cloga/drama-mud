import type { CharacterConfig, GameConfig, Message, Scene } from '@drama-mud/engine'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_NPC_CONTEXT_MAX_CHARACTERS, DEFAULT_NPC_CONTEXT_MAX_MESSAGES } from '../npc-context-window.js'
import {
  OptimusRuntimeClient,
  OptimusRuntimeError,
  createRuntimeHttpRunner,
  createRuntimeRunner,
  parseRuntimeEnvelopeOutput,
} from '../runtime/optimus-runtime.js'

const game: GameConfig = {
  name: 'power-trip-fixed',
  displayName: '权力游戏',
  type: 'power-trip',
  roleMode: 'fixed',
  description: 'A courtly intrigue game',
}

const scene: Scene = {
  id: 'main-hall',
  name: 'Main Hall',
  description: 'Everyone watches every word.',
  connectedScenes: [],
}

const npc: CharacterConfig = {
  id: 'advisor',
  name: '谋士',
  description: 'A careful strategist',
  personality: '谨慎、善谋',
  isNpc: true,
}

const recentMessages: Message[] = [
  {
    id: 'm1',
    senderId: 'hero',
    senderName: 'Hero',
    content: '你怎么看？',
    timestamp: Date.now(),
    type: 'dialog',
  },
]

function createRecentMessage(index: number, content: string): Message {
  return {
    id: `m-${index}`,
    senderId: index % 2 === 0 ? 'hero' : 'advisor',
    senderName: index % 2 === 0 ? 'Hero' : '谋士',
    content,
    timestamp: index,
    type: 'dialog',
  }
}

describe('OptimusRuntimeClient', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('sends the previous agent_id and returns structured decision output', async () => {
    const runner = vi.fn().mockResolvedValue({
      status: 'completed',
      result: {
        decision: 'respond',
        reply: '先稳住局势，再做打算。',
        reason: 'The advisor should answer directly.',
      },
      runtime_metadata: {
        agent_id: 'agent-42',
        session_id: 'session-42',
      },
    })

    const client = new OptimusRuntimeClient({
      workspaceRoot: 'C:\\workspace\\drama-mud',
      roleEngine: 'github-copilot',
      roleModel: 'gpt-5.4-mini',
      fallbackEngines: ['claude-code'],
      runner,
    })

    const result = await client.runNpcTurn({
      roomId: 'room-1',
      game,
      scene,
      worldMd: '# world',
      npc,
      recentMessages,
      latestPlayerMessage: {
        playerName: 'Player',
        characterName: 'Hero',
        content: '你怎么看？',
      },
      agentId: 'agent-previous',
    })

    expect(result).toEqual({
      decision: 'respond',
      reply: '先稳住局势，再做打算。',
      reason: 'The advisor should answer directly.',
      agentId: 'agent-42',
      sessionId: 'session-42',
    })
    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: 'agent-previous',
        session_id: undefined,
        role_engine: 'github-copilot',
        role_model: 'gpt-5.4-mini',
        workspace_path: 'C:\\workspace\\drama-mud',
        runtime_policy: expect.objectContaining({
          fallback_engines: ['claude-code'],
        }),
      }),
    )

    const request = runner.mock.calls[0]?.[0]
    expect(request?.instructions).toContain(
      'Decide whether this NPC should reply to the latest player message right now based on this NPC alone.',
    )
    expect(request?.instructions).toContain(
      'Do not wait for a single "best" speaker or assume another character should lead; each NPC decides independently whether to speak.',
    )
    expect(request?.instructions).not.toContain('Use "silent" when the NPC should hold back, has nothing useful to add, or another character should lead.')
  })

  it('uses the shared recent context builder before sending runtime input', async () => {
    const runner = vi.fn().mockResolvedValue({
      status: 'completed',
      result: {
        decision: 'silent',
      },
    })

    const client = new OptimusRuntimeClient({
      workspaceRoot: 'C:\\workspace\\drama-mud',
      runner,
    })

    await client.runTurn({
      roomId: 'room-1',
      game,
      scene,
      worldMd: '# world',
      npc,
      recentMessages: [
        ...Array.from({ length: DEFAULT_NPC_CONTEXT_MAX_MESSAGES + 5 }, (_, index) =>
          createRecentMessage(index + 1, `短消息-${index + 1}`),
        ),
        createRecentMessage(999, '很长的回忆'.repeat(DEFAULT_NPC_CONTEXT_MAX_CHARACTERS)),
        createRecentMessage(1_000, '现在轮到你回应'),
      ],
      latestPlayerMessage: {
        playerName: 'Player',
        characterName: 'Hero',
        content: '现在轮到你回应',
      },
    })

    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          recentMessages: [
            {
              senderId: 'hero',
              senderName: 'Hero',
              type: 'dialog',
              content: '现在轮到你回应',
            },
          ],
        }),
      }),
    )
  })

  it('falls back to gpt-5.4 when gpt-5.4-mini fails', async () => {
    const runner = vi
      .fn()
      .mockRejectedValueOnce(new Error('mini timed out'))
      .mockResolvedValueOnce({
        status: 'completed',
        result: {
          decision: 'respond',
          reply: '我来接这个话头。',
        },
      })

    const client = new OptimusRuntimeClient({
      workspaceRoot: 'C:\\workspace\\drama-mud',
      roleEngine: 'github-copilot',
      roleModel: 'gpt-5.4-mini',
      fallbackModels: ['gpt-5.4'],
      runner,
    })

    await expect(
      client.runNpcTurn({
        roomId: 'room-1',
        game,
        scene,
        worldMd: '# world',
        npc,
        recentMessages,
        latestPlayerMessage: {
          playerName: 'Player',
          characterName: 'Hero',
          content: '你怎么看？',
        },
      }),
    ).resolves.toMatchObject({
      decision: 'respond',
      reply: '我来接这个话头。',
    })

    expect(runner.mock.calls.map(([request]) => request.role_model)).toEqual(['gpt-5.4-mini', 'gpt-5.4'])
  })

  it('throws actionable runtime errors for failed envelopes', async () => {
    const client = new OptimusRuntimeClient({
      workspaceRoot: 'C:\\workspace\\drama-mud',
      runner: vi.fn().mockResolvedValue({
        status: 'failed',
        error_code: 'auth_failed',
        error_message: 'Authentication required',
      }),
    })

    await expect(
      client.runNpcTurn({
        roomId: 'room-1',
        game,
        scene,
        worldMd: '# world',
        npc,
        recentMessages,
        latestPlayerMessage: {
          playerName: 'Player',
          characterName: 'Hero',
          content: '你怎么看？',
        },
      }),
    ).rejects.toMatchObject({
      name: 'OptimusRuntimeError',
      code: 'auth_failed',
    })
  })

  it('rejects invalid completed payloads', async () => {
    const client = new OptimusRuntimeClient({
      runner: vi.fn().mockResolvedValue({
        status: 'completed',
        result: {
          decision: 'respond',
        },
      }),
    })

    await expect(
      client.runNpcTurn({
        roomId: 'room-1',
        game,
        scene,
        worldMd: '# world',
        npc,
        recentMessages,
        latestPlayerMessage: {
          playerName: 'Player',
          characterName: 'Hero',
          content: '你怎么看？',
        },
      }),
    ).rejects.toMatchObject({
      code: 'invalid_result',
    })
  })

  it('treats plain text completed payloads as direct NPC replies', async () => {
    const client = new OptimusRuntimeClient({
      runner: vi.fn().mockResolvedValue({
        status: 'completed',
        result: '先别声张，静观其变。',
      }),
    })

    await expect(
      client.runTurn({
        roomId: 'room-1',
        game,
        scene,
        worldMd: '# world',
        npc,
        recentMessages,
        latestPlayerMessage: {
          playerName: 'Player',
          characterName: 'Hero',
          content: '你怎么看？',
        },
      }),
    ).resolves.toEqual({
      decision: 'respond',
      reply: '先别声张，静观其变。',
      reason: undefined,
      runtimeSession: {
        agentId: undefined,
        sessionId: undefined,
      },
    })
  })

  it('retries once with a fresh session when the previous runtime run is missing', async () => {
    const runner = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'failed',
        error_code: 'run_not_found',
        error_message: 'Agent Runtime run was not found in the task manifest.',
      })
      .mockResolvedValueOnce({
        status: 'completed',
        result: {
          decision: 'respond',
          reply: '换条新线继续说。',
        },
        runtime_metadata: {
          agent_id: 'agent-fresh',
          session_id: 'session-fresh',
        },
      })

    const client = new OptimusRuntimeClient({
      workspaceRoot: 'C:\\workspace\\drama-mud',
      runner,
    })

    await expect(
      client.runTurn(
        {
          roomId: 'room-1',
          game,
          scene,
          worldMd: '# world',
          npc,
          recentMessages,
          latestPlayerMessage: {
            playerName: 'Player',
            characterName: 'Hero',
            content: '你怎么看？',
          },
        },
        {
          agentId: 'agent-stale',
          sessionId: 'session-stale',
        },
      ),
    ).resolves.toEqual({
      decision: 'respond',
      reply: '换条新线继续说。',
      reason: undefined,
      runtimeSession: {
        agentId: 'agent-fresh',
        sessionId: 'session-fresh',
      },
    })

    expect(runner).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        agent_id: 'agent-stale',
        session_id: 'session-stale',
      }),
    )
    expect(runner).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        agent_id: undefined,
        session_id: undefined,
      }),
    )
  })

  it('retries once with a fresh session when a resumed runtime session crashes in structured parsing', async () => {
    const runner = vi
      .fn()
      .mockRejectedValueOnce(new Error("Cannot read properties of undefined (reading 'value')"))
      .mockResolvedValueOnce({
        status: 'completed',
        result: {
          decision: 'respond',
          reply: '别靠近，我先确认你的来历。',
        },
        runtime_metadata: {
          agent_id: 'agent-recovered',
          session_id: 'session-recovered',
        },
      })

    const client = new OptimusRuntimeClient({
      workspaceRoot: 'C:\\workspace\\drama-mud',
      runner,
    })

    await expect(
      client.runTurn(
        {
          roomId: 'room-1',
          game,
          scene,
          worldMd: '# world',
          npc,
          recentMessages,
          latestPlayerMessage: {
            playerName: 'Player',
            characterName: 'Hero',
            content: '你怎么看？',
          },
        },
        {
          agentId: 'agent-stale',
          sessionId: 'session-stale',
        },
      ),
    ).resolves.toEqual({
      decision: 'respond',
      reply: '别靠近，我先确认你的来历。',
      reason: undefined,
      runtimeSession: {
        agentId: 'agent-recovered',
        sessionId: 'session-recovered',
      },
    })

    expect(runner).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        agent_id: 'agent-stale',
        session_id: 'session-stale',
      }),
    )
    expect(runner).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        agent_id: undefined,
        session_id: undefined,
      }),
    )
  })

  it('retries once with a fresh session when the reused runtime state is corrupted', async () => {
    const runner = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'failed',
        error_message: "Cannot read properties of undefined (reading 'value')",
      })
      .mockResolvedValueOnce({
        status: 'completed',
        result: {
          decision: 'respond',
          reply: '先别回头，看我示意。',
        },
        runtime_metadata: {
          agent_id: 'agent-reset',
          session_id: 'session-reset',
        },
      })

    const client = new OptimusRuntimeClient({
      workspaceRoot: 'C:\\workspace\\drama-mud',
      runner,
    })

    await expect(
      client.runTurn(
        {
          roomId: 'room-1',
          game,
          scene,
          worldMd: '# world',
          npc,
          recentMessages,
          latestPlayerMessage: {
            playerName: 'Player',
            characterName: 'Hero',
            content: '你怎么看？',
          },
        },
        {
          agentId: 'agent-corrupted',
          sessionId: 'session-corrupted',
        },
      ),
    ).resolves.toEqual({
      decision: 'respond',
      reply: '先别回头，看我示意。',
      reason: undefined,
      runtimeSession: {
        agentId: 'agent-reset',
        sessionId: 'session-reset',
      },
    })

    expect(runner).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        agent_id: 'agent-corrupted',
        session_id: 'session-corrupted',
      }),
    )
    expect(runner).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        agent_id: undefined,
        session_id: undefined,
      }),
    )
  })

  it('normalizes task_timeout envelopes to the existing timeout error code', async () => {
    const client = new OptimusRuntimeClient({
      runner: vi.fn().mockResolvedValue({
        status: 'failed',
        error_code: 'task_timeout',
        error_message: 'No activity from engine for the configured heartbeat period.',
      }),
    })

    await expect(
      client.runTurn({
        roomId: 'room-1',
        game,
        scene,
        worldMd: '# world',
        npc,
        recentMessages,
        latestPlayerMessage: {
          playerName: 'Player',
          characterName: 'Hero',
          content: '你怎么看？',
        },
      }),
    ).rejects.toMatchObject({
      name: 'OptimusRuntimeError',
      code: 'timeout',
    })
  })

  it('posts NPC turns to the HTTP runtime endpoint by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          status: 'completed',
          result: {
            decision: 'respond',
            reply: '此事先按兵不动。',
          },
          runtime_metadata: {
            agent_id: 'agent-http',
            session_id: 'session-http',
          },
        }),
      ),
    })
    vi.stubGlobal('fetch', fetchMock)

    const runner = createRuntimeHttpRunner({
      baseUrl: 'http://127.0.0.1:3100/',
      timeoutMs: 5_000,
    })

    await expect(
      runner({
        role: 'dev',
        workspace_path: 'C:\\workspace\\drama-mud',
        instructions: 'Return JSON only',
        input: { task: 'npc turn' },
        runtime_policy: {
          mode: 'sync',
          timeout_ms: 5_000,
        },
      }),
    ).resolves.toMatchObject({
      status: 'completed',
      result: {
        decision: 'respond',
        reply: '此事先按兵不动。',
      },
      runtime_metadata: {
        agent_id: 'agent-http',
        session_id: 'session-http',
      },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3100/api/v1/agent/run',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
      }),
    )
  })

  it('treats HTTP 404 responses as transport failures so CLI fallback can engage', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          message: 'Resource not found',
        }),
      ),
    })
    vi.stubGlobal('fetch', fetchMock)

    const runner = createRuntimeHttpRunner({
      baseUrl: 'http://127.0.0.1:3100/',
      timeoutMs: 5_000,
    })

    await expect(
      runner({
        role: 'dev',
        workspace_path: 'C:\\workspace\\drama-mud',
        instructions: 'Return JSON only',
        input: { task: 'npc turn' },
        runtime_policy: {
          mode: 'sync',
          timeout_ms: 5_000,
        },
      }),
    ).rejects.toMatchObject({
      name: 'OptimusRuntimeError',
      code: 'http_unavailable',
    })
  })

  it('falls back to the CLI runner when the HTTP runtime is unavailable', async () => {
    const cliRunner = vi.fn().mockResolvedValue({
      status: 'completed',
      result: {
        decision: 'respond',
        reply: '改走 CLI 兜底。',
      },
      runtime_metadata: {
        agent_id: 'agent-cli',
        session_id: 'session-cli',
      },
    })

    const runner = createRuntimeRunner({
      workspaceRoot: 'C:\\workspace\\drama-mud',
      transport: 'http',
      baseUrl: 'http://127.0.0.1:3100',
      cliPath: 'unused',
      nodePath: 'unused',
      timeoutMs: 5_000,
      httpRunner: vi
        .fn()
        .mockRejectedValue(new OptimusRuntimeError('http_unavailable', 'connect ECONNREFUSED 127.0.0.1:3100')),
      cliRunner,
    })

    await expect(
      runner({
        role: 'dev',
        workspace_path: 'C:\\workspace\\drama-mud',
        instructions: 'Return JSON only',
        input: { task: 'npc turn' },
        runtime_policy: {
          mode: 'sync',
          timeout_ms: 5_000,
        },
      }),
    ).resolves.toMatchObject({
      status: 'completed',
      result: {
        decision: 'respond',
        reply: '改走 CLI 兜底。',
      },
      runtime_metadata: {
        agent_id: 'agent-cli',
        session_id: 'session-cli',
      },
    })

    expect(cliRunner).toHaveBeenCalledOnce()
  })

  it('parses a completed envelope even when runtime-cli logs are mixed into stdout', () => {
    const output = '[CLI] run role=dev\n{"status":"completed","result":{"decision":"respond","reply":"日志混杂也要成功。"}}\n'

    expect(parseRuntimeEnvelopeOutput(output)).toEqual({
      status: 'completed',
      result: {
        decision: 'respond',
        reply: '日志混杂也要成功。',
      },
    })
  })

  it('skips unrelated JSON log entries and returns the actual runtime envelope from mixed stdout', () => {
    const output = [
      '[CLI] warm pool reused',
      '{"level":"info","message":"engine booted"}',
      '{"status":"completed","result":{"decision":"respond","reply":"前面的 JSON 日志不该干扰解析。"}}',
    ].join('\n')

    expect(parseRuntimeEnvelopeOutput(output)).toEqual({
      status: 'completed',
      result: {
        decision: 'respond',
        reply: '前面的 JSON 日志不该干扰解析。',
      },
    })
  })

  it('accepts a completed envelope emitted as multiline JSON output', () => {
    const output = '{\n  "status": "completed",\n  "result": {\n    "decision": "respond",\n    "reply": "多行 JSON 可解析。"\n  }\n}\n'

    expect(parseRuntimeEnvelopeOutput(output)).toEqual({
      status: 'completed',
      result: {
        decision: 'respond',
        reply: '多行 JSON 可解析。',
      },
    })
  })
})
