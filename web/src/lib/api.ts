import type { AppKey } from '@siafoundation/sia-storage'
import { VIDWAY_API_URL } from './constants'
import { buildSignedRequest } from './signing'

export type Listing = {
  id: string
  shareUrl: string
  title: string
  description: string
  durationSec: number
  width: number
  height: number
  thumbnailB64: string
  thumbnailMime: string
  uploaderPubkey: string
  /**
   * Username of the uploader, if they've claimed one. NULL when the
   * uploader has no profile yet — fall back to a truncated pubkey for
   * display in that case.
   */
  uploaderUsername: string | null
  validUntil: string
  createdAt: string
  updatedAt: string
  probeStatus: 'alive' | 'dead' | 'unknown'
}

export type UserProfile = {
  pubkey: string
  username: string
  createdAt: string
  updatedAt: string
}

export type UsernameAvailability = {
  available: boolean
  reason?: string
}

export type ListListingsResult = {
  items: Listing[]
  nextCursor: string | null
}

export type ListListingsParams = {
  q?: string
  sort?: 'recent' | 'expiring' | 'longest' | 'shortest'
  uploader?: string
  status?: 'alive' | 'all'
  limit?: number
  cursor?: string
}

export type CreateListingInput = {
  shareUrl: string
  title: string
  description: string
  durationSec: number
  width: number
  height: number
  thumbnailB64: string
  validUntil: string
}

export type UpdateListingInput = {
  listingId: string
  title?: string
  description?: string
  shareUrl?: string
  validUntil?: string
}

class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, msg: string) {
    super(msg)
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${VIDWAY_API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    let body: { error?: string; message?: string } = {}
    try {
      body = await res.json()
    } catch {}
    throw new ApiError(res.status, body.error ?? 'http_error', body.message ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  async listListings(params: ListListingsParams = {}): Promise<ListListingsResult> {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) q.set(k, String(v))
    }
    const qs = q.toString()
    return request<ListListingsResult>(`/listings${qs ? `?${qs}` : ''}`)
  },

  async getListing(id: string): Promise<Listing> {
    return request<Listing>(`/listings/${id}`)
  },

  async createListing(input: CreateListingInput, appKey: AppKey): Promise<{ id: string }> {
    const body = buildSignedRequest('create-listing', input, appKey)
    return request<{ id: string }>('/listings', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async updateListing(input: UpdateListingInput, appKey: AppKey): Promise<Listing> {
    const body = buildSignedRequest('update-listing', input, appKey)
    return request<Listing>(`/listings/${input.listingId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  async deleteListing(listingId: string, appKey: AppKey): Promise<void> {
    const body = buildSignedRequest('delete-listing', { listingId }, appKey)
    await request<void>(`/listings/${listingId}`, {
      method: 'DELETE',
      body: JSON.stringify(body),
    })
  },

  async flagListing(
    listingId: string,
    input: { reason: 'illegal' | 'spam' | 'broken' | 'other'; detail?: string },
  ): Promise<void> {
    await request<{ ok: true }>(`/listings/${listingId}/flag`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  // ---- Users / profiles ----

  /**
   * Set or update the current user's profile (signed). Returns the
   * canonical stored profile, including the timestamps.
   */
  async setProfile(input: { username: string }, appKey: AppKey): Promise<UserProfile> {
    const body = buildSignedRequest('set-profile', input, appKey)
    return request<UserProfile>('/users', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /**
   * Look up a profile by pubkey. Returns null if the pubkey has never
   * set a profile (equivalent to a 404 from the API).
   */
  async getProfileByPubkey(pubkey: string): Promise<UserProfile | null> {
    try {
      return await request<UserProfile>(`/users/by-pubkey/${encodeURIComponent(pubkey)}`)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null
      throw e
    }
  },

  /**
   * Look up a profile by username. Case-insensitive on the server.
   * Returns null if no such user exists.
   */
  async getProfileByUsername(username: string): Promise<UserProfile | null> {
    try {
      return await request<UserProfile>(`/users/${encodeURIComponent(username)}`)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null
      throw e
    }
  },

  /**
   * Check whether a username is available. Used by the profile form
   * for live feedback before submission.
   */
  async checkUsername(username: string): Promise<UsernameAvailability> {
    const q = new URLSearchParams({ username })
    return request<UsernameAvailability>(`/users/check?${q.toString()}`)
  },
}

export { ApiError }
