import type { PackKind } from '@shared/types'
import { Input } from '@/components/ui/input'

export interface FilterValue {
  kind: PackKind | 'all'
  category: string
  mood: string
  instrument: string
  query: string
}

export function PackFilters({
  value,
  categories,
  moods,
  instruments,
  onChange,
}: {
  value: FilterValue
  categories: string[]
  moods: string[]
  instruments: string[]
  onChange: (value: FilterValue) => void
}) {
  return (
    <form className="grid gap-3 md:grid-cols-5" onSubmit={(event) => event.preventDefault()} aria-label="Pack filters">
      <label className="text-sm text-muted">
        Kind
        <select
          className="mt-1 h-10 w-full rounded-md border border-line bg-leather px-2 text-ink"
          value={value.kind}
          onChange={(event) => onChange({ ...value, kind: event.target.value as FilterValue['kind'] })}
        >
          <option value="all">All</option>
          <option value="ambience">Ambience</option>
          <option value="fx">Sound effects</option>
        </select>
      </label>
      <label className="text-sm text-muted">
        Category
        <select
          className="mt-1 h-10 w-full rounded-md border border-line bg-leather px-2 text-ink"
          value={value.category}
          onChange={(event) => onChange({ ...value, category: event.target.value })}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm text-muted">
        Mood
        <select
          className="mt-1 h-10 w-full rounded-md border border-line bg-leather px-2 text-ink"
          value={value.mood}
          onChange={(event) => onChange({ ...value, mood: event.target.value })}
        >
          <option value="">All moods</option>
          {moods.map((mood) => (
            <option key={mood} value={mood}>
              {mood}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm text-muted">
        Instrument
        <select
          className="mt-1 h-10 w-full rounded-md border border-line bg-leather px-2 text-ink"
          value={value.instrument}
          onChange={(event) => onChange({ ...value, instrument: event.target.value })}
        >
          <option value="">All instruments</option>
          {instruments.map((instrument) => (
            <option key={instrument} value={instrument}>
              {instrument}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm text-muted">
        Search
        <Input
          className="mt-1"
          value={value.query}
          onChange={(event) => onChange({ ...value, query: event.target.value })}
          placeholder="Forest, lute, combat…"
        />
      </label>
    </form>
  )
}
