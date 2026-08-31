import type { AdminPackDetail, AdminPackSummary, PackDetail, PackSummary, SessionUser } from '@shared/types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers,
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
  signOut: (options?: { all?: boolean }) =>
    request<{ ok: boolean }>('/api/auth/sign-out', {
      method: 'POST',
      body: JSON.stringify({ all: options?.all === true }),
    }),
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
  sendFeedback: (body: { name?: string; email?: string; category?: string; message: string }) =>
    request<{ ok: true }>('/api/feedback', { method: 'POST', body: JSON.stringify(body) }),
  adminPacks: () => request<{ packs: AdminPackSummary[] }>('/api/admin/packs'),
  adminPack: (slug: string) => request<{ pack: AdminPackDetail }>(`/api/admin/packs/${slug}`),
  createAdminPack: (body: Record<string, unknown>) =>
    request<{ pack: AdminPackDetail }>('/api/admin/packs', { method: 'POST', body: JSON.stringify(body) }),
  updateAdminPack: (slug: string, body: Record<string, unknown>) =>
    request<{ pack: AdminPackDetail }>(`/api/admin/packs/${slug}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAdminPack: (slug: string) =>
    request<{ ok: true; archived: boolean; purchases?: number; objectsRemoved?: number }>(
      `/api/admin/packs/${slug}`,
      { method: 'DELETE' },
    ),
  createAdminTrack: (slug: string, body: Record<string, unknown>) =>
    request<{ pack: AdminPackDetail }>(`/api/admin/packs/${slug}/tracks`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteAdminTrack: (slug: string, trackId: string) =>
    request<{ pack: AdminPackDetail }>(`/api/admin/packs/${slug}/tracks/${trackId}`, { method: 'DELETE' }),
  uploadAdminTrackAudio: (slug: string, trackId: string, file: File) => {
    const form = new FormData()
    form.set('file', file)
    return request<{ pack: AdminPackDetail }>(`/api/admin/packs/${slug}/tracks/${trackId}/audio`, {
      method: 'PUT',
      body: form,
    })
  },
  uploadAdminPackArchive: (slug: string, file: File) => {
    const form = new FormData()
    form.set('file', file)
    return request<{ pack: AdminPackDetail }>(`/api/admin/packs/${slug}/archive`, { method: 'PUT', body: form })
  },
}
