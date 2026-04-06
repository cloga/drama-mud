import type { Message } from '@drama-mud/engine'

export const DEFAULT_NPC_CONTEXT_MAX_MESSAGES = 20
export const DEFAULT_NPC_CONTEXT_MAX_CHARACTERS = 2_400

interface NpcContextWindowOptions {
  maxMessages?: number
  maxCharacters?: number
}

export function buildRecentNpcContext(
  messages: Message[],
  options: NpcContextWindowOptions = {},
): Message[] {
  const maxMessages = options.maxMessages ?? DEFAULT_NPC_CONTEXT_MAX_MESSAGES
  const maxCharacters = options.maxCharacters ?? DEFAULT_NPC_CONTEXT_MAX_CHARACTERS

  if (messages.length === 0 || maxMessages <= 0 || maxCharacters <= 0) {
    return []
  }

  const window: Message[] = []
  let usedCharacters = 0

  for (let index = messages.length - 1; index >= 0 && window.length < maxMessages; index -= 1) {
    const message = messages[index]
    const messageSize = estimateMessageContextSize(message)

    if (window.length > 0 && usedCharacters + messageSize > maxCharacters) {
      break
    }

    window.push(message)
    usedCharacters += messageSize
  }

  return window.reverse()
}

function estimateMessageContextSize(message: Message): number {
  return message.senderName.length + message.type.length + message.content.length + 16
}
