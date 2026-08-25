import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api'

export function EcosystemPage() {
  const [links, setLinks] = useState<Array<{ name: string; href: string; blurb: string }>>([])
  const [donate, setDonate] = useState<{ defaultCents: number; githubSponsors: string; kofi: string } | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    api
      .ecosystem()
      .then((data) => {
        setLinks(data.links)
        setDonate(data.donate)
      })
      .catch(() => {
        setLinks([
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
        ])
        setDonate({
          defaultCents: 500,
          githubSponsors: 'https://github.com/sponsors/Almantask',
          kofi: 'https://ko-fi.com/almantask',
        })
      })
  }, [])

  async function donateNow() {
    try {
      const result = await api.donate(donate?.defaultCents)
      window.location.assign(result.url)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not start donation')
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl">Ecosystem</h1>
        <p className="mt-2 max-w-3xl text-muted">
          Sunderplace sells curated packs. Generation, tagging, and live mixing stay in the open tools you already run
          on your own GPU and in the browser. There is no subscription — if the free library and tools help your table,
          a donation keeps the lights on.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        {links.map((link) => (
          <Card key={link.href}>
            <h2 className="font-display text-2xl text-gold">
              <a href={link.href} target="_blank" rel="noreferrer">
                {link.name}
              </a>
            </h2>
            <p className="mt-2 text-sm text-muted">{link.blurb}</p>
          </Card>
        ))}
      </div>
      <Card className="space-y-3">
        <h2 className="font-display text-2xl">Donate</h2>
        <p className="text-sm text-muted">
          One-time tip via Stripe when configured, or GitHub Sponsors / Ko-fi. Not a membership.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={donateNow}>Donate {donate ? `$${(donate.defaultCents / 100).toFixed(0)}` : ''}</Button>
          {donate ? (
            <>
              <Button variant="outline" asChild>
                <a href={donate.githubSponsors} target="_blank" rel="noreferrer">
                  GitHub Sponsors
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={donate.kofi} target="_blank" rel="noreferrer">
                  Ko-fi
                </a>
              </Button>
            </>
          ) : null}
        </div>
        {message ? <p className="text-sm text-red-300">{message}</p> : null}
      </Card>
    </div>
  )
}
