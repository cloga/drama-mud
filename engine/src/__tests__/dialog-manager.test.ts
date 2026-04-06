import { describe, expect, it } from 'vitest'
import { DialogManager } from '../dialog/dialog-manager.js'

describe('DialogManager message metadata', () => {
  it('preserves caller supplied id and timestamp overrides', () => {
    const dialog = new DialogManager()

    const message = dialog.addMessage({
      id: 'message-123',
      timestamp: 1234567890,
      senderId: 'npc-1',
      senderName: '谋士',
      content: '我会记住这条消息。',
      type: 'dialog',
    })

    expect(message).toEqual({
      id: 'message-123',
      timestamp: 1234567890,
      senderId: 'npc-1',
      senderName: '谋士',
      content: '我会记住这条消息。',
      type: 'dialog',
    })
    expect(dialog.getAllMessages()).toEqual([message])
  })
})
