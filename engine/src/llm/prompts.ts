import { MAX_DURABLE_FACTS, normalizeDurableMemory, type GameType, type Message, type NpcCharacter, type Scene } from '../types/index.js'

/** Build the system prompt for an NPC character */
export function buildNpcSystemPrompt(
  npc: Pick<NpcCharacter, 'name' | 'personality' | 'description'>,
  scene: Scene,
  gameType: GameType,
): string {
  const toneGuide = getToneGuide(gameType)

  return [
    `You are "${npc.name}", ${npc.description}`,
    `Personality: ${npc.personality}`,
    `Current scene: ${scene.name} — ${scene.description}`,
    '',
    'Rules:',
    '- Always stay in character; speak in first person',
    '- Write all visible dialogue in natural Simplified Chinese; do not switch to English',
    '- Keep replies concise and impactful, no more than 3 paragraphs',
    '- React appropriately to the other party\'s actions',
    '- Keep language broadcast-safe: no profanity, vulgar insults, slurs, or sexual obscenity',
    '- If the character is angry, show pressure through tone and wording, not swear words',
    `- Tone: ${toneGuide}`,
  ].join('\n')
}

export function buildNpcRuntimeUserPrompt(input: {
  npc: Pick<NpcCharacter, 'name' | 'memory'>
  sessionKey: string
  recentMessages: Message[]
  latestPlayerMessage: string
  playerName: string
}): string {
  const memoryBlock = formatDurableMemory(input.npc.memory)
  const transcript =
    input.recentMessages.length > 0
      ? input.recentMessages
          .map((message) => `[${message.senderName}][${message.type}] ${message.content}`)
          .join('\n')
      : '(no prior dialog)'

  return [
    `Session key: ${input.sessionKey}`,
    '',
    'Durable memory facts (JSON):',
    memoryBlock,
    '',
    'Recent conversation:',
    transcript,
    '',
    `Latest player message from ${input.playerName}: ${input.latestPlayerMessage}`,
    '',
    'Decide whether this NPC should stay silent or respond right now based on this NPC alone.',
    'Assess this NPC independently; multiple NPCs may respond in the same beat if it fits their character and the moment.',
    'Choose "silent" if the NPC would naturally hold back or has nothing meaningful to add right now.',
    'Choose "respond" only if the NPC should actively speak up in character.',
    'If decision is "respond", write reply in natural Simplified Chinese only—never in English—while keeping the JSON schema unchanged.',
    'Keep any reply broadcast-safe: no profanity, vulgar insults, slurs, or sexual obscenity.',
    'If the NPC is furious, express tension or intimidation without swear words.',
    '',
    'Return strict JSON with this shape and no markdown fences:',
    '{"decision":"silent"|"respond","reply":"string","memory":[{"kind":"relationship|goal|secret|promise|state|preference|observation","subject":"string","content":"string","salience":0-100,"updatedAt":1700000000000}]}',
    '',
    'Memory rules:',
    `- Keep at most ${MAX_DURABLE_FACTS} grounded durable facts.`,
    '- Each fact must be atomic, typed, and specific to this NPC.',
    '- Preserve still-relevant prior facts by re-emitting them with updated salience or timestamps when needed.',
    '- Prefer higher-salience facts when space is tight.',
    '- If staying silent, set reply to an empty string.',
  ].join('\n')
}

function formatDurableMemory(memory: readonly unknown[]): string {
  const facts = normalizeDurableMemory(memory, {
    defaultSubject: 'general',
  })

  if (facts.length === 0) {
    return '(none)'
  }

  return JSON.stringify(facts, null, 2)
}

function getToneGuide(gameType: GameType): string {
  switch (gameType) {
    case 'power-trip':
      return 'Cooperate with the player; let them feel power and control. Show awe or submission when appropriate.'
    case 'comeback':
      return 'Start strong, even dominating, but leave room for reversal. Gradually reveal weaknesses as the story progresses.'
    case 'ghost-scare':
      return 'Build horror and suspense. Reactions should convey fear and unease. Exaggerate when scared.'
  }
}

/** Build narration prompt to describe scene transitions or events */
export function buildNarrationPrompt(scene: Scene, eventDescription: string): string {
  return [
    'You are the game narrator, responsible for describing scenes and events.',
    `Current scene: ${scene.name} — ${scene.description}`,
    `Event to describe: ${eventDescription}`,
    '',
    'Rules:',
    '- Write in third-person narrator perspective',
    '- Create an immersive atmosphere with vivid descriptions',
    '- Keep it within 2–4 sentences',
  ].join('\n')
}
