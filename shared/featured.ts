export interface RankablePack {
  id: string
  featuredEligible: boolean
}

export interface UniqueActivity {
  packId: string
  userId: string
  at: Date
}

export function featuredScore(
  packId: string,
  activities: UniqueActivity[],
  now: Date,
  windowDays = 30,
): number {
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)
  const users = new Set<string>()
  for (const activity of activities) {
    if (activity.packId !== packId) continue
    if (activity.at < cutoff) continue
    users.add(activity.userId)
  }
  return users.size
}

export function rankFeaturedPacks(
  packs: RankablePack[],
  activities: UniqueActivity[],
  now: Date,
  limit = 6,
): string[] {
  return packs
    .filter((pack) => pack.featuredEligible)
    .map((pack) => ({ id: pack.id, score: featuredScore(pack.id, activities, now) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((row) => row.id)
}
