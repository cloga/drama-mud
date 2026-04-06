import type { Message } from '../types/index.js'

/** Manages dialog context with a sliding window for LLM context limits */
export class DialogManager {
  private messages: Message[] = []
  private maxMessages: number

  constructor(maxMessages = 50) {
    this.maxMessages = maxMessages
  }

  /** Add a message to the dialog history */
  addMessage(message: Omit<Message, 'id' | 'timestamp'>): Message {
    const fullMessage: Message = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    }

    this.messages.push(fullMessage)

    // Trim oldest messages if over limit (keep system messages)
    if (this.messages.length > this.maxMessages) {
      const systemMessages = this.messages.filter((m) => m.type === 'system')
      const nonSystemMessages = this.messages.filter((m) => m.type !== 'system')
      const trimmed = nonSystemMessages.slice(-this.maxMessages + systemMessages.length)
      this.messages = [...systemMessages, ...trimmed]
    }

    return fullMessage
  }

  /** Get recent messages for LLM context */
  getRecentMessages(count?: number): Message[] {
    if (count === undefined) return [...this.messages]
    return this.messages.slice(-count)
  }

  /** Get all messages */
  getAllMessages(): Message[] {
    return [...this.messages]
  }

  /** Clear dialog history */
  clear(): void {
    this.messages = []
  }
}
