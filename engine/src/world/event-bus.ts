import type { GameEvent } from '../types/index.js'

type EventHandler = (event: GameEvent) => void

/** Simple typed event bus for game events */
export class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map()

  /** Subscribe to an event type */
  on(eventType: string, handler: EventHandler): () => void {
    const existing = this.handlers.get(eventType) ?? []
    existing.push(handler)
    this.handlers.set(eventType, existing)

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(eventType)
      if (handlers) {
        const index = handlers.indexOf(handler)
        if (index !== -1) handlers.splice(index, 1)
      }
    }
  }

  /** Emit an event to all subscribers */
  emit(type: string, payload: Record<string, unknown>): void {
    const event: GameEvent = {
      type,
      payload,
      timestamp: Date.now(),
    }

    const handlers = this.handlers.get(type) ?? []
    for (const handler of handlers) {
      handler(event)
    }
  }

  /** Remove all handlers */
  clear(): void {
    this.handlers.clear()
  }
}
