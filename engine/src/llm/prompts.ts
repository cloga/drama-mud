import type { GameType, NpcCharacter, Scene } from '../types/index.js'

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
    '- Keep replies concise and impactful, no more than 3 paragraphs',
    '- React appropriately to the other party\'s actions',
    `- Tone: ${toneGuide}`,
  ].join('\n')
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
