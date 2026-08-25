import { describe, expect, it } from 'vitest'
import { canDownloadVersion, isNewerThanSnapshot, versionsForLibrary } from './entitlements.ts'

describe('entitlements', () => {
  it('lets a snapshot license download only the purchased version', () => {
    const entitlement = { packId: 'pack-1', license: 'snapshot' as const, snapshotVersion: 'v1' }
    expect(canDownloadVersion(entitlement, 'pack-1', 'v1')).toBe(true)
    expect(canDownloadVersion(entitlement, 'pack-1', 'v2')).toBe(false)
    expect(canDownloadVersion(entitlement, 'other', 'v1')).toBe(false)
  })

  it('lets an update-pass license download every version of that pack', () => {
    const entitlement = { packId: 'pack-1', license: 'update_pass' as const, snapshotVersion: 'v1' }
    expect(canDownloadVersion(entitlement, 'pack-1', 'v1')).toBe(true)
    expect(canDownloadVersion(entitlement, 'pack-1', 'v3')).toBe(true)
  })

  it('lists library versions for snapshot vs update-pass', () => {
    const published = ['v1', 'v2', 'v3']
    expect(
      versionsForLibrary({ packId: 'p', license: 'snapshot', snapshotVersion: 'v2' }, published),
    ).toEqual(['v2'])
    expect(
      versionsForLibrary({ packId: 'p', license: 'update_pass', snapshotVersion: 'v1' }, published),
    ).toEqual(published)
  })

  it('detects a newer pack version than the snapshot', () => {
    expect(isNewerThanSnapshot('v2', 'v1')).toBe(true)
    expect(isNewerThanSnapshot('v1', 'v1')).toBe(false)
  })
})
