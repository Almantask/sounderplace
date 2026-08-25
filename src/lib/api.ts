import type { PackDetail, PackSummary, SessionUser } from '@shared/types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`)
  }
  return data
}

export const api = {
  session: () => request<{ user: SessionUser | null }>('/api/session'),
  signIn: (email: string, password: string) =>
    request<{ user: SessionUser }>('/api/auth/sign-in', { method: 'POST', body: JSON.stringify({ email, password }) }),
  signUp: (name: string, email: string, password: string) =>
    request<{ user: SessionUser }>('/api/auth/sign-up', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),
  signOut: () => request<{ ok: boolean }>('/api/auth/sign-out', { method: 'POST' }),
  packs: (params: URLSearchParams) => request<{ packs: PackSummary[] }>(`/api/packs?${params}`),
  featured: () => request<{ packs: PackSummary[] }>('/api/featured'),
  pack: (slug: string) =>
    request<{
      pack: PackDetail & { moods: string[]; instruments: string[] }
      entitlement: { license: string; snapshotVersion: string } | null
      checkoutKind: string
      upgradeDeltaCents: number
    }>(`/api/packs/${slug}`),
  library: () =>
    request<{
      items: Array<{
        slug: string
        title: string
        kind: string
        currentVersion: string
        snapshotVersion: string
        license: string
      }>
    }>('/api/library'),
  claim: (slug: string) => request<{ ok: boolean }>(`/api/packs/${slug}/claim`, { method: 'POST' }),
  checkout: (slug: string, license: 'snapshot' | 'update_pass' | 'upgrade') =>
    request<{ url: string }>('/api/checkout', { method: 'POST', body: JSON.stringify({ slug, license }) }),
  donate: (amountCents?: number) =>
    request<{ url: string; fallback?: boolean }>('/api/donate', {
      method: 'POST',
      body: JSON.stringify({ amountCents }),
    }),
  ecosystem: () =>
    request<{
      links: Array<{ name: string; href: string; blurb: string }>
      donate: { defaultCents: number; githubSponsors: string; kofi: string }
    }>('/api/ecosystem'),
}
