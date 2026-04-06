import { describe, it, expect, beforeEach } from 'vitest'
import { CharacterManager } from '../character/character.js'
import type { CharacterConfig } from '../types/index.js'

describe('CharacterManager', () => {
  let manager: CharacterManager

  beforeEach(() => {
    manager = new CharacterManager()
  })

  const sampleConfig: CharacterConfig = {
    id: 'char-1',
    name: 'Grand Marshal Zhang',
    description: 'A dignified martial arts alliance leader',
    personality: 'Calm and commanding',
    isNpc: true,
  }

  it('should add a character', () => {
    const character = manager.addCharacter(sampleConfig, 'scene-1')
    expect(character.id).toBe('char-1')
    expect(character.name).toBe('Grand Marshal Zhang')
    expect(character.currentSceneId).toBe('scene-1')
  })

  it('should retrieve character by id', () => {
    manager.addCharacter(sampleConfig, 'scene-1')
    const found = manager.getCharacter('char-1')
    expect(found).toBeDefined()
    expect(found?.name).toBe('Grand Marshal Zhang')
  })

  it('should return undefined for unknown id', () => {
    expect(manager.getCharacter('nonexistent')).toBeUndefined()
  })

  it('should list characters in a scene', () => {
    manager.addCharacter(sampleConfig, 'scene-1')
    manager.addCharacter({ ...sampleConfig, id: 'char-2', name: 'B' }, 'scene-2')

    expect(manager.getCharactersInScene('scene-1')).toHaveLength(1)
    expect(manager.getCharactersInScene('scene-2')).toHaveLength(1)
    expect(manager.getCharactersInScene('scene-3')).toHaveLength(0)
  })

  it('should move character to another scene', () => {
    manager.addCharacter(sampleConfig, 'scene-1')
    const moved = manager.moveCharacter('char-1', 'scene-2')
    expect(moved).toBe(true)
    expect(manager.getCharacter('char-1')?.currentSceneId).toBe('scene-2')
  })

  it('should add memory to character', () => {
    manager.addCharacter(sampleConfig, 'scene-1')
    manager.addMemory('char-1', 'Encountered a mysterious traveler')
    expect(manager.getCharacter('char-1')?.memory).toContainEqual(
      expect.objectContaining({
        kind: 'observation',
        subject: 'general',
        content: 'Encountered a mysterious traveler',
      }),
    )
  })
})
