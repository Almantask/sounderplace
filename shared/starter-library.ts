import type { PackKind } from './types.ts'

export interface StarterPackDef {
  slug: string
  title: string
  kind: PackKind
  category: string
  description: string
  moods: string[]
  instruments: string[]
  trackCount: number
}

export const STARTER_TRACK_COUNT = 30

export const STARTER_PACKS: StarterPackDef[] = [
  {
    slug: 'tavern-ambience',
    title: 'Tavern',
    kind: 'ambience',
    category: 'tavern',
    description: 'Lively inn beds: fiddle, lute, and feast-hall murmur for settlement scenes.',
    moods: ['lively', 'festive'],
    instruments: ['fiddle', 'lute', 'frame drum'],
    trackCount: STARTER_TRACK_COUNT,
  },
  {
    slug: 'forest-ambience',
    title: 'Forest',
    kind: 'ambience',
    category: 'forest',
    description: 'Green woodland beds with harp, wooden flute, and fingerpicked guitar.',
    moods: ['calm', 'verdant'],
    instruments: ['harp', 'flute', 'guitar'],
    trackCount: STARTER_TRACK_COUNT,
  },
  {
    slug: 'dungeon-ambience',
    title: 'Dungeon',
    kind: 'ambience',
    category: 'dungeon',
    description: 'Underground exploration: cavern drones, drips, and low stone resonances.',
    moods: ['tense', 'dark'],
    instruments: ['low drones', 'percussion'],
    trackCount: STARTER_TRACK_COUNT,
  },
  {
    slug: 'combat-ambience',
    title: 'Combat',
    kind: 'ambience',
    category: 'combat',
    description: 'Battle underscore with staccato strings, war drums, and brass.',
    moods: ['aggressive', 'driving'],
    instruments: ['strings', 'drums', 'brass'],
    trackCount: STARTER_TRACK_COUNT,
  },
  {
    slug: 'night-ambience',
    title: 'Night',
    kind: 'ambience',
    category: 'night',
    description: 'Starlit nocturnal beds: soft pads, nylon guitar, and distant chimes.',
    moods: ['quiet', 'mysterious'],
    instruments: ['pads', 'nylon guitar', 'chimes'],
    trackCount: STARTER_TRACK_COUNT,
  },
  {
    slug: 'combat-fx',
    title: 'Combat FX',
    kind: 'fx',
    category: 'combat',
    description: 'Melee hits, blocks, arrows, and weapon handling for the soundboard.',
    moods: ['impact', 'sharp'],
    instruments: ['steel', 'wood'],
    trackCount: STARTER_TRACK_COUNT,
  },
  {
    slug: 'magic-fx',
    title: 'Magic FX',
    kind: 'fx',
    category: 'magic',
    description: 'Spell ignition, whoosh, heal, shield, and teleport one-shots.',
    moods: ['arcane', 'shimmer'],
    instruments: ['whoosh', 'chime'],
    trackCount: STARTER_TRACK_COUNT,
  },
  {
    slug: 'footsteps-fx',
    title: 'Footsteps',
    kind: 'fx',
    category: 'footsteps',
    description: 'Steps on stone, wood, grass, metal, water, and snow.',
    moods: ['neutral', 'movement'],
    instruments: ['foley'],
    trackCount: STARTER_TRACK_COUNT,
  },
  {
    slug: 'foley-doors-fx',
    title: 'Foley & Doors',
    kind: 'fx',
    category: 'foley-doors',
    description: 'Doors, latches, chests, cloth, glass, and coin handling.',
    moods: ['practical', 'place'],
    instruments: ['wood', 'metal'],
    trackCount: STARTER_TRACK_COUNT,
  },
  {
    slug: 'ui-fx',
    title: 'UI',
    kind: 'fx',
    category: 'ui',
    description: 'Menu clicks, confirm, error, pause, and inventory cues.',
    moods: ['clean', 'interface'],
    instruments: ['click', 'tone'],
    trackCount: STARTER_TRACK_COUNT,
  },
]

export const ECOSYSTEM_LINKS = [
  {
    name: 'Thunder FX',
    href: 'https://github.com/Almantask/thunder-fx',
    blurb: 'Generate sound effects and ambience locally on your GPU with Stable Audio 3.',
  },
  {
    name: 'Sunder',
    href: 'https://github.com/Almantask/sunder',
    blurb: 'Classify and tag tracks by mood, category, and instruments with CLAP — on your machine.',
  },
  {
    name: 'Arcanum Audio',
    href: 'https://almantask.github.io/rpg-audio-mixer-web/',
    blurb: 'Mix downloaded packs into campaigns, sessions, and live scenes.',
  },
] as const

export function trackName(packTitle: string, index: number): string {
  return `${packTitle} ${String(index + 1).padStart(2, '0')}`
}
