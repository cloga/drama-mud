import type { GameType } from '../types/index.js'

/** Story arc phases */
export type NarrativePhase = 'intro' | 'rising' | 'climax' | 'resolution' | 'ended'

/** Controls story arc progression based on game type */
export class NarrativeEngine {
  private phase: NarrativePhase = 'intro'
  private turnCount = 0

  constructor(
    private gameType: GameType,
    private totalTurns = 20,
  ) {}

  /** Advance the narrative by one turn */
  advanceTurn(): NarrativePhase {
    this.turnCount++
    const progress = this.turnCount / this.totalTurns

    this.phase = this.calculatePhase(progress)
    return this.phase
  }

  /** Get current phase */
  getCurrentPhase(): NarrativePhase {
    return this.phase
  }

  /** Get narrative guidance for LLM prompts based on game type and phase */
  getNarrativeGuidance(): string {
    return buildPhaseGuidance(this.gameType, this.phase)
  }

  private calculatePhase(progress: number): NarrativePhase {
    if (progress >= 1) return 'ended'
    if (progress >= 0.85) return 'resolution'
    if (progress >= 0.6) return 'climax'
    if (progress >= 0.2) return 'rising'
    return 'intro'
  }
}

function buildPhaseGuidance(gameType: GameType, phase: NarrativePhase): string {
  const guides: Record<GameType, Record<NarrativePhase, string>> = {
    'power-trip': {
      intro: 'Showcase the player character\'s abilities; establish a sense of dominance',
      rising: 'Present greater challenges, but the player always has the upper hand',
      climax: 'The ultimate challenge appears; the player unleashes their full power',
      resolution: 'The player achieves a resounding victory; earns universal admiration',
      ended: 'The story has ended',
    },
    comeback: {
      intro: 'Set up adversity; the player starts at a disadvantage',
      rising: 'Difficulties intensify, but clues for a turning point emerge',
      climax: 'The pivotal reversal moment; the tide turns dramatically',
      resolution: 'The player completes the comeback and defeats the opponent',
      ended: 'The story has ended',
    },
    'ghost-scare': {
      intro: 'A calm scene with subtle unsettling details',
      rising: 'Strange events multiply; tension builds',
      climax: 'The player launches the most terrifying scare',
      resolution: 'The horrifying truth is revealed; one final scare',
      ended: 'The story has ended',
    },
  }

  return guides[gameType][phase]
}
