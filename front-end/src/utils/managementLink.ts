export interface PendingManagementClaim {
  issuedAt: number
  itemId: string
  managementToken: string
}

const pendingManagementClaimStorageKey = 'np_sr_pending_management_claim'
const pendingManagementClaimMaxAgeMs = 2 * 60 * 1000

export function consumePendingManagementClaim() {
  if (!import.meta.client)
    return null

  try {
    const rawValue = window.sessionStorage.getItem(pendingManagementClaimStorageKey)
    window.sessionStorage.removeItem(pendingManagementClaimStorageKey)

    if (!rawValue)
      return null

    const value = JSON.parse(rawValue) as Partial<PendingManagementClaim>
    const issuedAt = Number(value.issuedAt)
    const ageMs = Date.now() - issuedAt

    if (
      !Number.isFinite(issuedAt)
      || ageMs < -30_000
      || ageMs > pendingManagementClaimMaxAgeMs
      || typeof value.itemId !== 'string'
      || typeof value.managementToken !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.itemId)
      || !/^[0-9a-f]{64}$/i.test(value.managementToken)
    ) {
      return null
    }

    return {
      issuedAt,
      itemId: value.itemId,
      managementToken: value.managementToken,
    } satisfies PendingManagementClaim
  }
  catch {
    return null
  }
}
