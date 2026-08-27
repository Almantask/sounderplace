# Security issues — Sunderplace

**Date:** 2026-08-27  
**Scope:** Application source in this repository (Vite SPA + Hono worker, D1, R2).  
**Method:** Static review of authentication, session handling, admin gates, payments, uploads, and public APIs.  
**Not in scope:** Live exploitation, payload development, or attacking a deployed instance.

This review did not run exploits against the site. Findings below are from the code as written. Severity assumes a Worker deployed from the current `wrangler.toml` and `worker/` sources, with Stripe and GitHub optionally configured.

---

## Summary

| Severity | Count | Highest-impact themes |
| --- | --- | --- |
| Critical | 2 | Dev flags and secrets shipped in config; admin identity is an unproven email |
| High | 3 | Checkout price logic; OAuth account linking; unpaid license grant when the dev flag is on |
| Medium | 8 | CORS, session revocation, user enumeration, webhook checks, uploads, abuse limits |
| Low | 6 | Headers, crypto hygiene, predictable demo IDs, download header construction |

Parameterized SQL, HttpOnly `SameSite=Lax` cookies, PBKDF2 password hashes, and an API-side admin gate (not UI-only) are in place. The problems are mostly authorization, payment invariants, and production configuration.

---

## Critical

### 1. Production Worker config enables “any user is admin” and free paid licenses

**Where:** `wrangler.toml` (`[vars]`), consumed by `shared/admin.ts` (`isAdminAccess`) and `worker/index.ts` (checkout).

`wrangler.toml` sets `ALLOW_DEV_LOGIN = "1"` and a fixed `SESSION_SECRET`. Cloudflare `[vars]` are uploaded with the Worker. README describes the flag as local-only, but nothing in the deploy config turns it off for production.

When `ALLOW_DEV_LOGIN` is `"1"` and `ADMIN_EMAILS` is unset:

- `isAdminAccess` treats **any signed-in email** as an operator.
- Checkout **grants snapshot or update-pass entitlements without Stripe** whenever `STRIPE_SECRET_KEY` is missing.

**Impact:** Anyone who can create an account can manage the catalog (create/delete packs, upload archives) and obtain paid downloads. The session HMAC key is also in git, so a database copy of session tokens can be turned into valid cookies.

**Fix:**

- Keep `ALLOW_DEV_LOGIN` and `SESSION_SECRET` out of `wrangler.toml`. Put secrets in `wrangler secret` / `.dev.vars` only.
- Default the Worker to deny admin and deny unpaid checkout. Enable the dev bypass only in local `.dev.vars`.
- Fail closed: missing `ADMIN_EMAILS` must mean no email-based admin, not “everyone.”
- Rotate `SESSION_SECRET` if this repo or any Worker using this file was ever deployed.

---

### 2. Admin allowlist is an email string with no proof of ownership

**Where:** `worker/auth.ts` (`createUser` sets `email_verified` to `1`), `worker/index.ts` sign-up, `shared/admin.ts` (`parseAdminEmails` / `isAdminAccess`).

Sign-up stores whatever email the client sends. There is no confirmation mail, magic link, or verified-provider check. The UI’s eight-character password rule is not enforced on the server. Admin rights are `session email ∈ ADMIN_EMAILS`.

**Impact:** Whoever registers an operator address first becomes admin (create/update/delete packs, replace R2 audio and zip archives, destroy entitlements by deleting packs). If the real operator later uses GitHub sign-in with that same address, they land in the attacker’s existing account (see issue 4).

**Fix:**

- Do not grant admin from a self-asserted email. Require a verified identity (confirmed email, SSO, or an operator secret that is not in git).
- Keep `email_verified` false until a real verification step succeeds; never set it on password sign-up.
- Enforce password length and a reasonable maximum on the server.
- Treat `ADMIN_EMAILS` as insufficient on its own until verification exists.

---

## High

### 3. Checkout `license` is not an allowlist; unknown values are priced as upgrades and grant an update pass

**Where:** `worker/index.ts` (`POST /api/checkout`), `worker/lib/stripe.ts` (`licenseUnitAmount`).

The handler only special-cases `"upgrade"` for the “must already own a snapshot” rule, and only special-cases `"snapshot"` when deciding what entitlement to grant. `licenseUnitAmount` treats any other string as the upgrade delta (update-pass price minus snapshot price). Anything other than `"snapshot"` is stored as `update_pass`.

TypeScript on the client does not constrain the JSON body.

**Impact:** A signed-in buyer who does not own the pack can start Checkout for an **update-pass entitlement at the upgrade delta**, not at the update-pass list price. With Stripe on, that is a real underpayment. With issue 1, it is a free update pass.

**Fix:**

- Accept only `"snapshot" | "update_pass" | "upgrade"`.
- Compute amount and granted license from that enum in one place (do not fall through to upgrade pricing).
- Keep the snapshot-ownership check for `"upgrade"` only after the value is known to be exactly that variant.
- Add an API test that unknown `license` values return 400 and never create a Stripe session.

---

### 4. GitHub sign-in binds a session to an email without OAuth CSRF protection or a verified-email requirement

**Where:** `worker/index.ts` (`GET /api/auth/github`, `GET /api/auth/github/callback`).

The authorize URL has no `state` (and no PKCE). The callback trusts `gh.email`, else a primary+verified address, else **the first address in the emails list**, which may be unverified. If a local user row already exists for that email, the Worker creates a session for that row and does not record a GitHub `account` link.

**Impact:** Login CSRF (the victim’s browser finishes an OAuth code that is not theirs). Account takeover if an attacker can make GitHub return an address that already belongs to a password account. Combining this with issue 2 targets operator mailboxes.

**Fix:**

- Put a random `state` in the authorize URL (signed cookie or server store) and require it on the callback.
- Use only GitHub emails with `verified: true`. Reject the login otherwise.
- Link GitHub accounts by `provider_id` + GitHub user id, not by raw email match, or require the email to be already verified on your side before merging.
- Do not create a session for an existing password user unless the GitHub identity is already linked or the email is verified.

---

### 5. Paid licenses can be granted without payment when the dev flag is on

**Where:** `worker/index.ts` (`POST /api/checkout` branch on missing `STRIPE_SECRET_KEY` and `ALLOW_DEV_LOGIN === '1'`).

This is the runtime half of issue 1. It is listed separately because it is a payment-integrity bug even if admin were locked down: the same flag skips Stripe and writes entitlements plus a fake `purchases` row.

**Fix:** Gate this path on an explicit local-only environment (for example `ENVIRONMENT === 'development'`), never on a flag that is easy to leave enabled in `[vars]`. In any deployed environment, missing Stripe keys should return 501, not a grant.

---

## Medium

### 6. CORS reflects any `Origin` and allows credentials

**Where:** `worker/index.ts` (`app.use('/api/*', cors({ origin: (origin) => origin, credentials: true }))`).

Every requesting origin is echoed in `Access-Control-Allow-Origin` while cookies are allowed.

`SameSite=Lax` on `sp_session` currently blocks most cross-site `fetch` from sending the session cookie, so this is not a full authenticated CORS bypass in modern browsers. It still trains the API to trust the world, exposes public JSON (and error text) to any site, and becomes high severity if the cookie is ever changed to `SameSite=None` or if a browser mishandles Lax.

**Fix:** Allow only `APP_URL` (and a short explicit dev list). Do not reflect the request Origin.

---

### 7. Sign-out does not invalidate the server session

**Where:** `worker/index.ts` (`POST /api/auth/sign-out`), `worker/auth.ts` (`createSession`).

Sign-out only clears the cookie. The `session` row stays valid until `expires_at` (30 days). Many concurrent sessions are allowed; there is no revoke-all.

**Impact:** A stolen cookie remains usable after the user signs out. There is no way to kill sessions after a laptop loss or secret rotation besides waiting for expiry (or rotating `SESSION_SECRET` and dropping all cookies).

**Fix:** Delete the row that matches the presented token on sign-out. Add “sign out everywhere.” Consider a shorter idle timeout and rotation on sign-in.

---

### 8. Sign-in timing differs when the email does not exist

**Where:** `worker/index.ts` (`POST /api/auth/sign-in`).

If no credential account is found, the handler returns 401 **without** running PBKDF2. Existing users always pay for 100,000 iterations.

**Impact:** Email enumeration via response time, in addition to the explicit 409 on sign-up for an existing address.

**Fix:** Always run `verifyPassword` against a dummy hash when the user is missing. Keep a generic error. Rate-limit and lock out by IP and by email.

---

### 9. Stripe webhook signature check is incomplete

**Where:** `worker/index.ts` (`verifyStripeSignature`, `POST /api/stripe/webhook`).

The Worker HMACs `timestamp.payload` and compares hex with `===` (not constant-time). It does not reject old timestamps. `Object.fromEntries` on the header keeps a single `v1` value, which is brittle if Stripe sends several signatures during key rotation. Entitlements are taken from session metadata; `amount_cents` is stored as `0`.

**Impact:** Replay of a captured, correctly signed body after the Stripe five-minute window. Weaker detection of underpayment or metadata surprises. Timing leakage on the compare is secondary.

**Fix:** Use Stripe’s official verification (or the same rules: tolerance on `t`, constant-time compare, all `v1` candidates). Persist and trust `amount_total` from the session. Ignore events you cannot map to a known Checkout session created by this app.

---

### 10. Public preview endpoint does not check listing status or “designated preview” 

**Where:** `worker/index.ts` (`GET /api/previews/:trackId`), `worker/lib/admin.ts` (`storeTrackAudio`).

The handler returns R2 bytes for any track id that has `preview_r2_key`. It does not require `listing_status = 'live'` or that the track is the pack’s preview track. Uploading audio for `sort_order === 0` stores the **full** object as the preview (product choice; see FAQ), and uses the client-supplied `file.type` as `Content-Type`.

**Impact:** Draft or rejected packs are fetchable if a track id leaks (admin UI, logs, referrer). A misleading `Content-Type` on that public URL can change how browsers treat the bytes. Seed track ids are predictable (`track_<slug>_01`), which is acceptable only because previews are meant to be public for live packs.

**Fix:** Join to the live pack version and allow only the designated preview track. Force a safe audio `Content-Type`. Do not copy full-track keys onto non-preview rows. Reject unmatched MIME vs extension.

---

### 11. Admin uploads have no size cap and trust the client filename/MIME

**Where:** `worker/lib/admin.ts` (`storeTrackAudio`, `storePackArchive`, `fileExtension` in `shared/admin.ts`).

Extension is taken from the filename; body is not sniffed. Empty files are rejected; large files are not. Zip contents are not inspected for path traversal (the Worker stores the zip as a blob, so zip-slip is a risk for **operators who unzip unsafely**, not for the Worker itself).

**Impact:** Storage and Worker-memory exhaustion. Stored objects with unexpected types (see issue 10).

**Fix:** Enforce max bytes (audio and zip). Validate magic bytes. Ignore client `Content-Type` except as a hint. Scan or rebuild zips if you ever extract them on a server.

---

### 12. Donation amount has a floor but no ceiling or type check

**Where:** `worker/index.ts` (`POST /api/donate`).

Any value `>= 100` is sent to Stripe as `unit_amount`. Non-integers and very large numbers are not rejected.

**Impact:** Abuse of Checkout (fraud/dispute load), accidental huge charges, and odd Stripe errors from non-integer amounts.

**Fix:** Require a finite integer in a documented range (for example $1–$500). Ignore client amounts if you only want a fixed donate SKU.

---

### 13. No rate limiting on auth, feedback, checkout, or donate

**Where:** `worker/index.ts` (those routes have no limiter).

PBKDF2 (100k iterations) makes password guessing slower and makes unauthenticated sign-in a cheap CPU DoS. Feedback inserts are unauthenticated (by design) with only length checks.

**Impact:** Credential stuffing, Worker exhaustion, database spam.

**Fix:** Cloudflare rate limiting or a WAF rule on `/api/auth/*`, `/api/feedback`, `/api/checkout`, and `/api/donate`. Cap feedback per IP per hour.

---

## Low

### 14. Missing browser security headers

The Worker and `index.html` do not set CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, or `frame-ancestors`. React’s default escaping reduces XSS risk today; a CSP still limits the blast radius of a future DOM XSS and of the preview `Content-Type` issue.

**Fix:** Set headers on the API Worker and on whatever hosts the SPA (Pages `_headers` or the same Worker).

---

### 15. Secret comparisons are not constant-time

**Where:** `worker/auth.ts` (password hex and session HMAC), `shared/admin.ts` (operator bearer token), `worker/index.ts` (Stripe `v1`).

**Fix:** `crypto.subtle.timingSafeEqual` (or equivalent) on equal-length byte arrays. Compare operator tokens the same way.

---

### 16. Download `Content-Disposition` interpolates the version path segment

**Where:** `worker/index.ts` (`GET /api/downloads/:slug/:version`).

`slug` is constrained by `slugify` when written. `version` is the URL param, constrained only by matching a `pack_versions` row. Header injection would need a stored version string with quotes or CR/LF.

**Fix:** Allow only `^v\d+$` (or a tight allowlist) and build `filename` from that.

---

### 17. Sign-up 409 discloses registered emails

**Where:** `worker/index.ts` (`POST /api/auth/sign-up`).

Useful for UX; it also confirms who has an account. If you care about enumeration, use a generic response and send “already registered” only by email.

---

### 18. Predictable seed primary keys

**Where:** `shared/seed-statements.ts` (`pack_<slug>`, `track_<slug>_NN`).

Fine for fixtures; do not reuse this pattern for user-generated rows (admin tracks already use UUIDs). Do not treat these ids as unguessable in access control — the preview query must authorize as in issue 10.

---

### 19. Crypto and session hygiene

- PBKDF2-SHA256 with 100k iterations is acceptable but weaker than Argon2id / scrypt at current OWASP recommendations.
- Session lifetime is 30 days with no idle timeout.
- `createUser` and GitHub insert are not a single transaction; a mid-flight failure can leave a `user` without an `account`.
- GitHub callback assumes the emails JSON is an array; an API error object will throw.

---

## What looks sound

- Catalog and admin SQL uses bound parameters.
- Session cookie is `HttpOnly` and `SameSite=Lax`; `Secure` is set when `APP_URL` is `https://`.
- Passwords are salted PBKDF2, not stored plaintext.
- Public pack listing filters `listing_status = 'live'`.
- Paid zip download checks a session and `entitledToVersion` (free packs are intentionally open to signed-in users).
- Stripe Checkout line items are built from server-side pack prices when `license` is one of the intended three strings (the bug is the fourth path, issue 3).
- Admin mutations go through `adminGate`, not only a hidden `/admin` route.

---

## Suggested fix order

1. Remove `ALLOW_DEV_LOGIN` and `SESSION_SECRET` from `wrangler.toml`; fail closed on admin and checkout. Rotate the session secret if this config was deployed.
2. Stop treating unverified emails as admin identity.
3. Allowlist checkout `license` and add tests for rejected values.
4. Fix GitHub OAuth (`state`, verified email only, no naive email merge).
5. Restrict CORS; revoke sessions on sign-out; rate-limit auth.
6. Tighten preview authorization, upload limits, webhook verification, and donate amount checks.

---

## Out of scope / not verified here

- Runtime behavior on a public hostname (WAF, TLS, Cloudflare dashboard secrets vs `[vars]`).
- Whether production already overrides `wrangler.toml` in the Cloudflare UI.
- Third-party services (GitHub App settings, Stripe Dashboard, R2 bucket public access) beyond what this repo configures.
- Social-engineering of Checkout URLs or operator unzip workflows.
