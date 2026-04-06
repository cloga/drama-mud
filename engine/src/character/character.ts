import type { Character, CharacterConfig } from '../types/index.js'

/** Manages character creation and state */
export class CharacterManager {
  private characters: Map<string, Character> = new Map()

  /** Create a character from config */
  addCharacter(config: CharacterConfig, initialSceneId: string): Character {
    const character: Character = {
      id: config.id,
      name: config.name,
      description: config.description,
      personality: config.personality,
      currentSceneId: initialSceneId,
      memory: [],
    }
    this.characters.set(character.id, character)
    return character
  }

  /** Get character by ID */
  getCharacter(id: string): Character | undefined {
    return this.characters.get(id)
  }

  /** Get all characters */
  getAllCharacters(): Character[] {
    return Array.from(this.characters.values())
  }

  /** Get characters in a specific scene */
  getCharactersInScene(sceneId: string): Character[] {
    return this.getAllCharacters().filter((c) => c.currentSceneId === sceneId)
  }

  /** Move character to a new scene */
  moveCharacter(characterId: string, sceneId: string): boolean {
    const character = this.characters.get(characterId)
    if (!character) return false
    character.currentSceneId = sceneId
    return true
  }

  /** Add a memory entry to a character */
  addMemory(characterId: string, memory: string): void {
    const character = this.characters.get(characterId)
    if (character) {
      character.memory.push(memory)
    }
  }
}
