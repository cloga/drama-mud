import { describe, expect, it } from 'vitest'
import { buildNpcRuntimeUserPrompt } from '../llm/prompts.js'
import { MAX_DURABLE_FACTS } from '../types/index.js'

describe('buildNpcRuntimeUserPrompt', () => {
  it('renders durable memory as structured facts and documents the JSON schema', () => {
    const prompt = buildNpcRuntimeUserPrompt({
      npc: {
        name: 'Advisor',
        memory: [
          {
            kind: 'promise',
            subject: 'Hero',
            content: 'promised to return before dawn',
            salience: 90,
            updatedAt: 1700000000000,
          },
        ],
      },
      sessionKey: 'room-1:npc-1',
      recentMessages: [
        {
          id: 'm1',
          senderId: 'hero',
          senderName: 'Hero',
          content: 'Wait for me at the gate.',
          timestamp: 1,
          type: 'dialog',
        },
      ],
      latestPlayerMessage: 'Wait for me at the gate.',
      playerName: 'Hero',
    })

    expect(prompt).toContain('Durable memory facts (JSON):')
    expect(prompt).toContain('"kind": "promise"')
    expect(prompt).toContain('"subject": "Hero"')
    expect(prompt).toContain('"salience": 90')
    expect(prompt).toContain('"updatedAt": 1700000000000')
    expect(prompt).toContain('"memory":[{"kind":"relationship|goal|secret|promise|state|preference|observation"')
    expect(prompt).toContain(`Keep at most ${MAX_DURABLE_FACTS} grounded durable facts.`)
    expect(prompt).toContain('Recent conversation:')
    expect(prompt).toContain('[Hero][dialog] Wait for me at the gate.')
  })

  it('tells each NPC to decide independently whether to speak', () => {
    const prompt = buildNpcRuntimeUserPrompt({
      npc: {
        name: 'Advisor',
        memory: [],
      },
      sessionKey: 'room-1:npc-1',
      recentMessages: [],
      latestPlayerMessage: '你先说。',
      playerName: 'Hero',
    })

    expect(prompt).toContain('Decide whether this NPC should stay silent or respond right now based on this NPC alone.')
    expect(prompt).toContain('Choose "silent" if the NPC would naturally hold back or has nothing meaningful to add right now.')
    expect(prompt).toContain(
      'Assess this NPC independently; multiple NPCs may respond in the same beat if it fits their character and the moment.',
    )
    expect(prompt).not.toContain('best speaker')
  })

  it('normalizes legacy string memory before rendering the prompt', () => {
    const prompt = buildNpcRuntimeUserPrompt({
      npc: {
        name: 'Advisor',
        memory: ['Hero owes me an answer'] as never,
      },
      sessionKey: 'room-1:npc-1',
      recentMessages: [],
      latestPlayerMessage: '答复我。',
      playerName: 'Hero',
    })

    expect(prompt).toContain('"kind": "observation"')
    expect(prompt).toContain('"subject": "general"')
    expect(prompt).toContain('"content": "Hero owes me an answer"')
  })
})
