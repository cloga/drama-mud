import { api, type GameDetail } from './api'
import { getCustomRoomGame } from './custom-room-game'

export type StoryTextBlock = { type: 'title' | 'heading' | 'paragraph' | 'quote'; content: string }
export type StoryBlock = StoryTextBlock | { type: 'list'; items: string[] }

function normalizeInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .trim()
}

export function parseWorldMarkdown(markdown: string): StoryBlock[] {
  const lines = markdown.replace(/\r/g, '').split('\n')
  const blocks: StoryBlock[] = []
  let paragraphBuffer: string[] = []
  let listBuffer: string[] = []

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) {
      return
    }

    const content = normalizeInlineMarkdown(paragraphBuffer.join(' '))
    if (content) {
      blocks.push({ type: 'paragraph', content })
    }
    paragraphBuffer = []
  }

  const flushList = () => {
    if (listBuffer.length === 0) {
      return
    }

    const items = listBuffer.map((item) => normalizeInlineMarkdown(item)).filter(Boolean)
    if (items.length > 0) {
      blocks.push({ type: 'list', items })
    }
    listBuffer = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line)
    if (headingMatch) {
      flushParagraph()
      flushList()
      const content = normalizeInlineMarkdown(headingMatch[2])
      if (content) {
        blocks.push({ type: headingMatch[1].length === 1 ? 'title' : 'heading', content })
      }
      continue
    }

    const listMatch = /^([-*+]|\d+\.)\s+(.*)$/.exec(line)
    if (listMatch) {
      flushParagraph()
      listBuffer.push(listMatch[2])
      continue
    }

    const quoteMatch = /^>\s?(.*)$/.exec(line)
    if (quoteMatch) {
      flushParagraph()
      flushList()
      const content = normalizeInlineMarkdown(quoteMatch[1])
      if (content) {
        blocks.push({ type: 'quote', content })
      }
      continue
    }

    paragraphBuffer.push(line)
  }

  flushParagraph()
  flushList()
  return blocks
}

export function renderInlineMarkdown(text: string) {
  const normalized = text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')

  return normalized
    .split(/(\*\*[^*]+\*\*|__[^_]+__)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (
        (part.startsWith('**') && part.endsWith('**')) ||
        (part.startsWith('__') && part.endsWith('__'))
      ) {
        return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>
      }

      return <span key={`${part}-${index}`}>{part}</span>
    })
}

export async function loadEffectiveGame(roomId: string, fallbackTemplateName?: string): Promise<GameDetail> {
  try {
    return await api.getRoomGameDetail(roomId, fallbackTemplateName)
  } catch (roomError) {
    const customRoomGame = getCustomRoomGame(roomId)
    if (customRoomGame) {
      return customRoomGame
    }

    throw roomError
  }
}
