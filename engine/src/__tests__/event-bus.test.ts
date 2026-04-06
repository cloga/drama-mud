import { describe, it, expect, beforeEach } from 'vitest'
import { EventBus } from '../world/event-bus.js'

describe('EventBus', () => {
  let bus: EventBus

  beforeEach(() => {
    bus = new EventBus()
  })

  it('should emit and receive events', () => {
    const received: string[] = []
    bus.on('test', (e) => received.push(e.type))
    bus.emit('test', {})
    expect(received).toEqual(['test'])
  })

  it('should support multiple handlers', () => {
    let count = 0
    bus.on('test', () => count++)
    bus.on('test', () => count++)
    bus.emit('test', {})
    expect(count).toBe(2)
  })

  it('should unsubscribe via returned function', () => {
    let count = 0
    const unsub = bus.on('test', () => count++)
    bus.emit('test', {})
    unsub()
    bus.emit('test', {})
    expect(count).toBe(1)
  })

  it('should clear all handlers', () => {
    let count = 0
    bus.on('test', () => count++)
    bus.clear()
    bus.emit('test', {})
    expect(count).toBe(0)
  })
})
