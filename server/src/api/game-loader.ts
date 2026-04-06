import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { GameConfig, CharacterConfig } from '@drama-mud/engine'

/** Loaded game template with characters data */
export interface GameTemplate {
  config: GameConfig
  characters: CharacterConfig[]
  worldMd: string
}

/** Resolve the games/ directory relative to the project root */
function gamesDir(): string {
  // server runs from drama-mud/server/, games/ is at drama-mud/games/
  return join(process.cwd(), '..', 'games')
}

/** Load all game templates from the games/ directory */
export async function loadGameTemplates(): Promise<GameTemplate[]> {
  const base = gamesDir()
  const entries = await readdir(base, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory())

  const templates: GameTemplate[] = []
  for (const dir of dirs) {
    const dirPath = join(base, dir.name)
    try {
      const configRaw = await readFile(join(dirPath, 'config.json'), 'utf-8')
      const config: GameConfig = JSON.parse(configRaw)

      let characters: CharacterConfig[] = []
      try {
        const charsRaw = await readFile(join(dirPath, 'characters.json'), 'utf-8')
        characters = JSON.parse(charsRaw)
      } catch {
        // No characters.json — open-mode templates may not have one
      }

      let worldMd = ''
      try {
        worldMd = await readFile(join(dirPath, 'world.md'), 'utf-8')
      } catch {
        // world.md is optional
      }

      templates.push({ config, characters, worldMd })
    } catch {
      // Skip directories without a valid config.json
    }
  }

  return templates
}
