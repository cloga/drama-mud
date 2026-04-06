import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RoomStore, type PersistedRoomRecord } from '../rooms/room-store.js'

describe('RoomStore', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('defers writes and persists only the latest queued snapshot', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'drama-mud-room-store-'))
    tempDirs.push(tempDir)
    const filePath = join(tempDir, 'rooms.json')
    const store = new RoomStore(filePath, { flushDelayMs: 25 })

    store.saveRooms([createRecord('room-a')])
    expect(existsSync(filePath)).toBe(false)

    await wait(5)
    store.saveRooms([createRecord('room-b')])

    await wait(60)

    expect(readRooms(filePath)).toEqual([createRecord('room-b')])
    store.close()
  })

  it('flushes pending writes when closed', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'drama-mud-room-store-'))
    tempDirs.push(tempDir)
    const filePath = join(tempDir, 'rooms.json')
    const store = new RoomStore(filePath, { flushDelayMs: 1_000 })

    store.saveRooms([createRecord('room-close')])
    expect(existsSync(filePath)).toBe(false)

    store.close()

    expect(readRooms(filePath)).toEqual([createRecord('room-close')])
  })
})

function createRecord(id: string): PersistedRoomRecord {
  return {
    id,
    hostName: 'Host',
    status: 'waiting',
    players: ['Host'],
    createdAt: 1,
    lastActivityAt: 1,
    npcBackend: 'llm',
    game: {
      config: {
        name: 'test-game',
        displayName: 'Test Game',
        description: 'Test game',
        type: 'power-trip',
        roleMode: 'open',
      },
      source: 'built-in',
      worldMd: '# Test',
      characters: [
        {
          id: 'hero',
          name: 'Hero',
          description: 'Hero description',
          personality: 'Brave',
          isNpc: false,
        },
        {
          id: 'npc',
          name: 'NPC',
          description: 'NPC description',
          personality: 'Calm',
          isNpc: true,
        },
      ],
    },
    messages: [],
  }
}

function readRooms(filePath: string): PersistedRoomRecord[] {
  return JSON.parse(readFileSync(filePath, 'utf8')) as PersistedRoomRecord[]
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
