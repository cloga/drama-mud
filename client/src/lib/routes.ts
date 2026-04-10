import { getRoomHistory, type RoomHistoryEntry } from './room-history.js'

export type View = 'lobby' | 'character-select' | 'game'

export interface RouteGameState {
  roomId: string
  templateName: string
  templateDisplayName?: string
  playerName: string
  characterId?: string
}

export interface ParsedRoute {
  view: View
  gameState: Partial<RouteGameState>
}

export interface RouteLocationInput {
  pathname?: string
  search?: string
  hash?: string
}

const APP_BASE_PATH = resolveAppBasePath()

function isBrowserReady() {
  return typeof window !== 'undefined'
}

function trimOrUndefined(value: string | null) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function resolveAppBasePath() {
  const baseUrl = import.meta.env?.BASE_URL
  const normalized = normalizePathname(baseUrl)
  return normalized === '/' ? '' : normalized
}

function normalizePathname(pathname?: string) {
  const trimmed = pathname?.trim() || '/'
  const withoutIndex = trimmed === '/index.html' ? '/' : trimmed
  if (withoutIndex === '/') {
    return withoutIndex
  }

  return withoutIndex.replace(/\/+$/, '')
}

function stripAppBasePath(pathname?: string) {
  const normalized = normalizePathname(pathname)
  if (!APP_BASE_PATH) {
    return normalized
  }

  if (normalized === APP_BASE_PATH) {
    return '/'
  }

  if (normalized.startsWith(`${APP_BASE_PATH}/`)) {
    return normalized.slice(APP_BASE_PATH.length) || '/'
  }

  return normalized
}

function withAppBasePath(pathname: string) {
  const normalized = normalizePathname(pathname)
  if (!APP_BASE_PATH) {
    return normalized
  }

  if (normalized === '/') {
    return APP_BASE_PATH
  }

  return `${APP_BASE_PATH}${normalized}`
}

function parseQuery(searchOrQuery = '') {
  const normalized = searchOrQuery.startsWith('?') ? searchOrQuery.slice(1) : searchOrQuery
  return new URLSearchParams(normalized)
}

function parseRouteParts(pathPart: string, searchOrQuery = ''): ParsedRoute | null {
  const normalizedPath = normalizePathname(pathPart)

  if (normalizedPath === '/' || normalizedPath === '/lobby' || normalizedPath === 'lobby') {
    return { view: 'lobby', gameState: {} }
  }

  const segments = normalizedPath
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (segments[0] !== 'rooms' || !segments[1]) {
    return null
  }

  const query = parseQuery(searchOrQuery)
  const roomId = decodeURIComponent(segments[1])
  const templateName = trimOrUndefined(query.get('template'))
  const templateDisplayName = trimOrUndefined(query.get('title'))
  const playerName = trimOrUndefined(query.get('player'))
  const characterId = trimOrUndefined(query.get('character'))

  if (segments[2] === 'characters') {
    return {
      view: 'character-select',
      gameState: {
        roomId,
        ...(templateName ? { templateName } : {}),
        ...(templateDisplayName ? { templateDisplayName } : {}),
        ...(playerName ? { playerName } : {}),
      },
    }
  }

  if (segments[2] === 'chat') {
    return {
      view: 'game',
      gameState: {
        roomId,
        ...(templateName ? { templateName } : {}),
        ...(templateDisplayName ? { templateDisplayName } : {}),
        ...(playerName ? { playerName } : {}),
        ...(characterId ? { characterId } : {}),
      },
    }
  }

  return null
}

function parseLegacyHash(hash = ''): ParsedRoute | null {
  const rawHash = hash.startsWith('#') ? hash.slice(1) : hash
  const normalizedHash = rawHash.trim()

  if (!normalizedHash) {
    return null
  }

  const [pathPart, queryString = ''] = normalizedHash.split('?')
  return parseRouteParts(pathPart, queryString)
}

export function buildRouteUrl(view: View, gameState: Partial<RouteGameState>): string {
  if (view === 'lobby' || !gameState.roomId) {
    return withAppBasePath('/lobby')
  }

  const params = new URLSearchParams()

  if (gameState.templateName) {
    params.set('template', gameState.templateName)
  }
  if (gameState.templateDisplayName) {
    params.set('title', gameState.templateDisplayName)
  }
  if (gameState.playerName) {
    params.set('player', gameState.playerName)
  }
  if (view === 'game' && gameState.characterId) {
    params.set('character', gameState.characterId)
  }

  const routePath =
    view === 'game'
      ? `/rooms/${encodeURIComponent(gameState.roomId)}/chat`
      : `/rooms/${encodeURIComponent(gameState.roomId)}/characters`

  const query = params.toString()
  return `${withAppBasePath(routePath)}${query ? `?${query}` : ''}`
}

export function parseRouteLocation(location: RouteLocationInput): ParsedRoute {
  return parseRouteParts(stripAppBasePath(location.pathname ?? '/'), location.search ?? '') ?? parseLegacyHash(location.hash ?? '') ?? {
    view: 'lobby',
    gameState: {},
  }
}

export function resolveRouteState(parsedRoute: ParsedRoute, roomHistory: RoomHistoryEntry[] = getRoomHistory()): ParsedRoute {
  if (parsedRoute.view === 'lobby' || !parsedRoute.gameState.roomId) {
    return { view: 'lobby', gameState: {} }
  }

  const historyEntry = roomHistory.find((entry) => entry.roomId === parsedRoute.gameState.roomId)
  const templateName = parsedRoute.gameState.templateName ?? historyEntry?.templateName
  const templateDisplayName = parsedRoute.gameState.templateDisplayName ?? historyEntry?.templateDisplayName
  const playerName = parsedRoute.gameState.playerName ?? historyEntry?.playerName
  const characterId = parsedRoute.gameState.characterId ?? historyEntry?.characterId

  if (!templateName || !playerName) {
    return { view: 'lobby', gameState: {} }
  }

  if (parsedRoute.view === 'character-select') {
    return {
      view: 'character-select',
      gameState: {
        roomId: parsedRoute.gameState.roomId,
        templateName,
        ...(templateDisplayName ? { templateDisplayName } : {}),
        playerName,
      },
    }
  }

  if (!characterId) {
    return {
      view: 'character-select',
      gameState: {
        roomId: parsedRoute.gameState.roomId,
        templateName,
        ...(templateDisplayName ? { templateDisplayName } : {}),
        playerName,
      },
    }
  }

  return {
    view: 'game',
    gameState: {
      roomId: parsedRoute.gameState.roomId,
      templateName,
      ...(templateDisplayName ? { templateDisplayName } : {}),
      playerName,
      characterId,
    },
  }
}

function updateRouteUrl(view: View, gameState: Partial<RouteGameState>, mode: 'push' | 'replace') {
  if (!isBrowserReady()) {
    return
  }

  const nextUrl = buildRouteUrl(view, gameState)
  const currentUrl = `${normalizePathname(window.location.pathname)}${window.location.search}`
  if (currentUrl === nextUrl && !window.location.hash) {
    return
  }

  if (mode === 'replace') {
    window.history.replaceState(null, '', nextUrl)
    return
  }

  window.history.pushState(null, '', nextUrl)
}

export function readRouteState(): ParsedRoute {
  if (!isBrowserReady()) {
    return { view: 'lobby', gameState: {} }
  }

  return resolveRouteState(parseRouteLocation(window.location))
}

export function pushRouteState(view: View, gameState: Partial<RouteGameState>) {
  updateRouteUrl(view, gameState, 'push')
}

export function replaceRouteState(view: View, gameState: Partial<RouteGameState>) {
  updateRouteUrl(view, gameState, 'replace')
}
