import { describe, expect, it, vi } from 'vitest'
import { normalizeMemory } from '../character/npc-driver.js'
import { MAX_DURABLE_FACTS } from '../types/index.js'

describe('npc durable memory normalization', () => {
  it('converts legacy strings, normalizes facts, deduplicates, and sorts by salience', () => {
    const facts = normalizeMemory(
      [
        'Hero promised to return',
        {
          kind: 'promise',
          subject: 'Hero',
          content: 'promised to return',
          salience: 92.4,
          updatedAt: 400,
        },
        {
          kind: 'promise',
          subject: 'Hero',
          content: 'promised to return',
          salience: 88,
          updatedAt: 350,
        },
        {
          kind: 'mystery',
          subject: 'Guard',
          content: 'looked nervous',
          salience: 150,
          updatedAt: -1,
        },
        {
          type: 'secret',
          subject: 'Advisor',
          text: 'is hiding a letter',
          salience: 70,
          timestamp: 250,
        },
        '',
        null,
      ],
      123,
    )

    expect(facts).toEqual([
      {
        kind: 'observation',
        subject: 'Guard',
        content: 'looked nervous',
        salience: 100,
        updatedAt: 123,
      },
      {
        kind: 'promise',
        subject: 'Hero',
        content: 'promised to return',
        salience: 92,
        updatedAt: 400,
      },
      {
        kind: 'secret',
        subject: 'Advisor',
        content: 'is hiding a letter',
        salience: 70,
        updatedAt: 250,
      },
      {
        kind: 'observation',
        subject: 'general',
        content: 'Hero promised to return',
        salience: 50,
        updatedAt: 123,
      },
    ])
  })

  it('keeps only the highest-salience durable facts when over the cap', () => {
    const facts = normalizeMemory(
      Array.from({ length: 20 }, (_, index) => ({
        kind: 'state',
        subject: `Fact-${index}`,
        content: `Detail-${index}`,
        salience: index,
        updatedAt: index,
      })),
      10,
    )

    expect(facts).toHaveLength(MAX_DURABLE_FACTS)
    expect(facts[0]).toMatchObject({ subject: 'Fact-19', salience: 19 })
    expect(facts.at(-1)).toMatchObject({
      subject: `Fact-${20 - MAX_DURABLE_FACTS}`,
      salience: 20 - MAX_DURABLE_FACTS,
    })
  })
})
