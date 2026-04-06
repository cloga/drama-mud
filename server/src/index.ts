import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import { createLlmClient } from '@drama-mud/engine'
import { loadConfig } from './config.js'
import { registerRoutes } from './api/routes.js'
import { registerWsHandler } from './ws/handler.js'
import { RoomManager } from './rooms/room-manager.js'

export async function createServer() {
  const config = loadConfig()

  const app = Fastify({ logger: true })

  await app.register(cors, { origin: true })
  await app.register(websocket)

  const roomManager = new RoomManager()
  const llmClient = createLlmClient({
    apiKey: config.llmApiKey,
    baseURL: config.llmBaseUrl,
    model: config.llmModel,
  })

  registerRoutes(app, roomManager)
  registerWsHandler(app, roomManager, llmClient)

  return { app, config }
}

async function main() {
  const { app, config } = await createServer()

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' })
    console.log(`Drama MUD server running on port ${config.port}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
