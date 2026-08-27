import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface FAQItem {
  id: string
  question: string
  answer: React.ReactNode
}

const FAQ_ITEMS: FAQItem[] = [
  {
    id: 'what-is-sunderplace',
    question: 'What is Sunderplace and what is its intended use?',
    answer: (
      <div className="space-y-2 text-sm text-muted">
        <p>
          <strong className="text-ink">Sunderplace</strong> is a curated marketplace designed specifically for
          tabletop roleplaying games (TTRPGs), Game Masters (GMs), sound designers, and content creators who need
          thematic, high-quality audio beds and sound-effect packs for their sessions.
        </p>
        <p>
          Instead of generic soundboards or monthly subscriptions, Sunderplace provides cohesive packs of 30+
          curated tracks (e.g. Tavern, Forest, Dungeon, Combat, Night, Magic FX, Foley) that you can download once
          and use forever in your live campaigns, virtual tabletops (VTTs), streams, and game development.
        </p>
      </div>
    ),
  },
  {
    id: 'arcanum-audio-and-intensity-levels',
    question: 'How does Sunderplace work with Arcanum Audio and its 3 intensity levels?',
    answer: (
      <div className="space-y-3 text-sm text-muted">
        <p>
          Sunderplace is part of an open audio ecosystem. Packs downloaded from Sunderplace are formatted to drop
          directly into <strong className="text-ink">Arcanum Audio</strong>, a multi-track tabletop audio mixer built
          for real-time atmosphere control during gameplay.
        </p>
        <p>
          In <strong className="text-ink">Arcanum Audio</strong>, ambient soundscapes and music are structured across{' '}
          <strong className="text-gold">3 dynamic intensity levels</strong> so the Game Master can seamlessly shift the
          mood as dramatic stakes change at the table:
        </p>
        <div className="grid gap-3 pt-1 md:grid-cols-3">
          <div className="rounded-md border border-line bg-leather/30 p-3">
            <h3 className="font-display text-base text-gold">1. Low Intensity</h3>
            <p className="mt-1 font-medium text-ink">Calm / Exploration / Rest</p>
            <p className="mt-1 text-xs text-muted">
              Gentle, unobtrusive background atmospheres for social scenes, tavern banter, town markets, wilderness
              travel, and resting. Features soft drones, nylon guitar, harp, and peaceful environmental murmur that
              never drowns out GM narration.
            </p>
          </div>
          <div className="rounded-md border border-line bg-leather/30 p-3">
            <h3 className="font-display text-base text-gold">2. Medium Intensity</h3>
            <p className="mt-1 font-medium text-ink">Suspense / Tension / Danger</p>
            <p className="mt-1 text-xs text-muted">
              Building tension for dungeon exploration, sneaking past sentries, trap-laden corridors, hazardous
              terrain, and mysterious investigations. Features rhythmic pulses, dark resonant drones, and subtle
              staccato strings.
            </p>
          </div>
          <div className="rounded-md border border-line bg-leather/30 p-3">
            <h3 className="font-display text-base text-gold">3. High Intensity</h3>
            <p className="mt-1 font-medium text-ink">Combat / Action / Climax</p>
            <p className="mt-1 text-xs text-muted">
              High-energy, visceral underscore for combat encounters, boss fights, spell clashes, and desperate chases.
              Features driving war drums, taiko, aggressive brass, and epic orchestral swells that elevate the table's
              adrenaline.
            </p>
          </div>
        </div>
        <p className="pt-1">
          By combining Sunderplace packs with Arcanum Audio, GMs can transition between Low, Medium, and High
          intensity on the fly with a single slider, while triggering FX one-shots on cue.
        </p>
      </div>
    ),
  },
  {
    id: 'the-broader-ecosystem',
    question: 'How do Thunder FX, Sunder, and Arcanum Audio connect?',
    answer: (
      <div className="space-y-2 text-sm text-muted">
        <p>
          Sunderplace fits into a modular 3-tier creator pipeline:
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li>
            <strong className="text-ink">Thunder FX:</strong> Local GPU generation tool to generate raw sound effects and
            ambience with Stable Audio 3.
          </li>
          <li>
            <strong className="text-ink">Sunder:</strong> On-device CLAP classifier that categorizes, tags, and evaluates
            audio tracks by mood, category, and instruments.
          </li>
          <li>
            <strong className="text-ink">Arcanum Audio:</strong> Live web and mobile audio mixer for layering tracks,
            modulating the 3 intensity levels, and playing soundscapes during live TTRPG sessions.
          </li>
        </ul>
        <p>
          Sunderplace acts as the central marketplace where curated, ready-to-mix pack releases are published and shared.
        </p>
      </div>
    ),
  },
  {
    id: 'pack-previews',
    question: 'How do track previews work in the marketplace?',
    answer: (
      <div className="space-y-2 text-sm text-muted">
        <p>
          Every pack in the marketplace allows you to preview <strong className="text-ink">1 designated track (always Track 01)</strong>.
        </p>
        <p>
          <strong className="text-gold">Preview means playing the track in its entirety:</strong> you get full,
          untruncated audio playback with complete seek, volume, and playback controls. You can evaluate the entire track's
          sound design, loop points, fidelity, and instrumentation before deciding to acquire the pack.
        </p>
        <p>
          The remaining tracks in the 30+ track collection are unlocked as soon as you claim a free pack or purchase a
          license for a paid pack.
        </p>
      </div>
    ),
  },
  {
    id: 'pricing-and-licenses',
    question: 'What is the difference between Snapshot and Update Pass licenses?',
    answer: (
      <div className="space-y-2 text-sm text-muted">
        <p>
          There are <strong className="text-ink">no recurring subscriptions</strong> on Sunderplace. All purchases are
          one-time payments:
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li>
            <strong className="text-ink">Snapshot License:</strong> Grants lifetime access to download the exact version
            of the pack you bought (e.g. v1).
          </li>
          <li>
            <strong className="text-ink">Update Pass:</strong> Grants lifetime access to the current version plus all
            future updates, remastered tracks, and pack expansions forever.
          </li>
          <li>
            <strong className="text-ink">Snapshot Upgrade:</strong> If you bought a snapshot and later want updates, you
            can upgrade anytime by paying only the difference between the snapshot and update pass prices.
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'free-starter-packs',
    question: 'Are there free starter packs available?',
    answer: (
      <div className="space-y-2 text-sm text-muted">
        <p>
          Yes! Sunderplace provides <strong className="text-ink">10 free starter packs (30 tracks each, 300 tracks total)</strong>{' '}
          covering the most essential TTRPG needs: Tavern, Forest, Dungeon, Combat, Night, Combat FX, Magic FX,
          Footsteps, Foley & Doors, and UI sounds.
        </p>
        <p>
          You can download them immediately or create a free account to keep them organized in your personal Library.
        </p>
      </div>
    ),
  },
  {
    id: 'commercial-rights',
    question: 'Can I use these tracks in commercial games, streams, and videos?',
    answer: (
      <div className="space-y-2 text-sm text-muted">
        <p>
          Yes. All packs come with a royalty-free license that permits commercial and non-commercial use in TTRPG
          sessions, live streams (Twitch, YouTube), podcasts, video games, animations, and videos.
        </p>
        <p>
          The only restriction is that you may not redistribute, resell, or republish the raw audio files as a
          competing sample pack or raw audio library.
        </p>
      </div>
    ),
  },
]

export function FAQPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">Help & Documentation</p>
        <h1 className="font-display text-4xl md:text-5xl">Frequently Asked Questions</h1>
        <p className="max-w-3xl text-muted">
          Learn about the intended use of Sunderplace, how packs integrate with Arcanum Audio and its 3 intensity
          levels, preview policies, and licensing.
        </p>
      </header>

      <div className="space-y-4">
        {FAQ_ITEMS.map((item) => (
          <Card key={item.id} className="space-y-3 p-5" id={item.id}>
            <h2 className="font-display text-xl text-gold-bright md:text-2xl">{item.question}</h2>
            {item.answer}
          </Card>
        ))}
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h2 className="font-display text-2xl">Ready to explore?</h2>
          <p className="text-sm text-muted">
            Browse our catalog of 30+ track ambience and sound-effect packs with full 1-track previews.
          </p>
        </div>
        <div className="flex gap-3">
          <Button asChild>
            <Link to="/catalog">Browse Catalog</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/feedback">Send feedback</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/ecosystem">Ecosystem & Tools</Link>
          </Button>
        </div>
      </Card>
    </div>
  )
}
