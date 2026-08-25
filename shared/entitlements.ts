import type { LicenseType } from './types.ts'

export interface EntitlementRecord {
  packId: string
  license: LicenseType
  snapshotVersion: string
}

function versionNumber(version: string): number {
  const match = /^v(\d+)$/i.exec(version.trim())
  if (!match) return Number.NaN
  return Number(match[1])
}

export function canDownloadVersion(entitlement: EntitlementRecord, packId: string, version: string): boolean {
  if (entitlement.packId !== packId) return false
  if (entitlement.license === 'update_pass') return true
  return entitlement.snapshotVersion === version
}

export function versionsForLibrary(
  entitlement: EntitlementRecord,
  publishedVersions: string[],
): string[] {
  if (entitlement.license === 'update_pass') {
    return [...publishedVersions]
  }
  return publishedVersions.filter((version) => version === entitlement.snapshotVersion)
}

export function isNewerThanSnapshot(publishedVersion: string, snapshotVersion: string): boolean {
  const published = versionNumber(publishedVersion)
  const snapshot = versionNumber(snapshotVersion)
  if (Number.isNaN(published) || Number.isNaN(snapshot)) {
    return publishedVersion !== snapshotVersion
  }
  return published > snapshot
}
