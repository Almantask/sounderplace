# Sunderplace

Marketplace for TTRPG ambience and sound-effect packs. v1 sells operator-curated [Stable Audio 3](https://stability.ai/) tracks (prompt craft + human review). There is no subscription: pay **X** for a snapshot of a pack version, or **Y** for a one-time update pass. Ten free starter packs (30 tracks each) cover the most-used ambience and FX categories.

Generate locally with [Thunder FX](https://github.com/Almantask/thunder-fx), classify with [Sunder](https://github.com/Almantask/sunder), mix in [Arcanum Audio](https://almantask.github.io/rpg-audio-mixer-web/).

## Stack

Vite + React 19 + TypeScript + Tailwind 4, Hono on Cloudflare Workers, D1, R2.

## Develop

Node 22+. Copy `.dev.vars.example` to `.dev.vars`.

```bash
npm install
npm test
npm run typecheck
npm run lint
npm run dev:full
```

- UI: http://127.0.0.1:5173
- API: http://127.0.0.1:8787 (`/api/...`)

Put `SESSION_SECRET` and optional `ALLOW_DEV_LOGIN=1` in `.dev.vars` only — never in `wrangler.toml`. Unpaid local grants and “any user is admin” work only when **both** `APP_URL` and the incoming request host are loopback, and Stripe keys are unset. Production must set `APP_URL` to the public `https://` origin. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` for real Checkout. Production admin is a verified email in `ADMIN_EMAILS` (GitHub sign-in) or `OPERATOR_TOKEN`. Sessions last 7 days with a 24-hour idle timeout; **Sign out everywhere** revokes every device.

## Operator ingest

```bash
npm run ingest -- --dir ./my-pack --slug tavern-ambience --title Tavern --kind ambience --category tavern --csv results.csv --hashes catalog-hashes.txt
```

Writes `ingest-output/pack.json` and `pack.zip`. Upload objects to R2 using `r2-keys.txt`. Packs must contain at least 30 themed tracks. Exact SHA-256 matches against `--hashes` are rejected (catalog-wide duplicate policy).

## License

Application source: Apache-2.0. Audio packs are not open source.
