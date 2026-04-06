import type { World, Scene } from '../types/index.js'

/** Manages world state and scene transitions */
export class WorldState {
  private scenes: Map<string, Scene>
  private currentSceneId: string

  constructor(world: World) {
    this.scenes = new Map(world.scenes.map((s) => [s.id, s]))
    this.currentSceneId = world.scenes[0]?.id ?? ''
  }

  /** Get the current active scene */
  getCurrentScene(): Scene | undefined {
    return this.scenes.get(this.currentSceneId)
  }

  /** Get a scene by ID */
  getScene(id: string): Scene | undefined {
    return this.scenes.get(id)
  }

  /** Get all scenes */
  getAllScenes(): Scene[] {
    return Array.from(this.scenes.values())
  }

  /** Transition to a connected scene */
  transitionTo(sceneId: string): boolean {
    const current = this.getCurrentScene()
    if (!current) return false
    if (!current.connectedScenes.includes(sceneId)) return false
    if (!this.scenes.has(sceneId)) return false

    this.currentSceneId = sceneId
    return true
  }

  /** Check if a scene transition is valid */
  canTransitionTo(sceneId: string): boolean {
    const current = this.getCurrentScene()
    if (!current) return false
    return current.connectedScenes.includes(sceneId) && this.scenes.has(sceneId)
  }
}
