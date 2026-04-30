// Per-listing action menu used on /mine. Refresh extends the share URL's
// expiry by re-calling sdk.shareObject() with a new validUntil and sending
// a signed update-listing. Edit updates title/description. Delete removes
// the catalog row (the video itself stays on Sia).

import type { Sdk } from '@siafoundation/sia-storage'
import { useState } from 'react'
import { type Listing, api } from '../lib/api'
import {
  DEFAULT_EXPIRY_DAYS,
  EXPIRY_OPTIONS,
  computeValidUntil,
} from '../lib/constants'
import { useToastStore } from '../stores/toast'

type Mode = 'menu' | 'refresh' | 'edit' | 'delete'

export function ListingActions({
  listing,
  sdk,
  onChanged,
}: {
  listing: Listing
  sdk: Sdk
  onChanged: (next: Listing | null) => void
}) {
  const [mode, setMode] = useState<Mode>('menu')

  if (mode === 'refresh') {
    return <RefreshDialog listing={listing} sdk={sdk} onClose={() => setMode('menu')} onDone={onChanged} />
  }
  if (mode === 'edit') {
    return <EditDialog listing={listing} sdk={sdk} onClose={() => setMode('menu')} onDone={onChanged} />
  }
  if (mode === 'delete') {
    return <DeleteDialog listing={listing} sdk={sdk} onClose={() => setMode('menu')} onDone={() => onChanged(null)} />
  }

  return (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={() => setMode('refresh')}
        className="px-2 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:border-neutral-900 dark:hover:border-neutral-100 transition-colors"
        title="Extend the share URL's expiry"
      >
        Refresh
      </button>
      <button
        type="button"
        onClick={() => setMode('edit')}
        className="px-2 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:border-neutral-900 dark:hover:border-neutral-100 transition-colors"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => setMode('delete')}
        className="px-2 py-1 text-xs rounded border border-red-200 dark:border-red-900 bg-white dark:bg-neutral-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:border-red-700 dark:hover:border-red-500 transition-colors"
      >
        Delete
      </button>
    </div>
  )
}

// ---- Refresh ----

function RefreshDialog({
  listing,
  sdk,
  onClose,
  onDone,
}: {
  listing: Listing
  sdk: Sdk
  onClose: () => void
  onDone: (next: Listing) => void
}) {
  const [days, setDays] = useState<number | null>(DEFAULT_EXPIRY_DAYS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const addToast = useToastStore((s) => s.addToast)

  async function handleSubmit() {
    setError(null)
    setBusy(true)
    try {
      // 1. Reconstitute the PinnedObject from the share URL. We can do
      //    this because the App Key is ours — `sharedObject` decrypts using
      //    the key in the URL's fragment.
      const obj = await sdk.sharedObject(listing.shareUrl)

      // 2. Mint a new share URL with the new expiry. `null` days uses the
      //    year-9999 sentinel from computeValidUntil.
      const validUntil = computeValidUntil(days)
      const newShareUrl = sdk.shareObject(obj, validUntil)

      // 3. Send the signed update to the catalog. Server will verify the
      //    new URL points to the same Object ID before accepting.
      const updated = await api.updateListing(
        {
          listingId: listing.id,
          shareUrl: newShareUrl,
          validUntil: validUntil.toISOString(),
        },
        sdk.appKey(),
      )

      addToast('Share URL refreshed')
      onDone(updated)
      onClose()
    } catch (e) {
      console.error('[refresh]', e)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Refresh expiry">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Mint a new share URL for the same video with a new expiry. Old shared links to this listing
        will keep working until their original expiry.
      </p>
      <div className="space-y-1">
        <label htmlFor={`exp-${listing.id}`} className="text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
          Available for
        </label>
        <select
          id={`exp-${listing.id}`}
          value={days === null ? 'unlimited' : String(days)}
          onChange={(e) =>
            setDays(e.target.value === 'unlimited' ? null : Number(e.target.value))
          }
          disabled={busy}
          className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-100"
        >
          {EXPIRY_OPTIONS.map((o) => (
            <option key={o.label} value={o.days === null ? 'unlimited' : String(o.days)}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {days === null
            ? 'New URL will stay valid until you delete this listing.'
            : `New URL will be valid until ${new Date(
                Date.now() + days * 86_400_000,
              ).toLocaleDateString()}.`}
        </p>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      <DialogButtons>
        <button type="button" onClick={onClose} disabled={busy} className="btn-secondary">
          Cancel
        </button>
        <button type="button" onClick={handleSubmit} disabled={busy} className="btn-primary">
          {busy ? 'Refreshing…' : 'Refresh'}
        </button>
      </DialogButtons>
    </Modal>
  )
}

// ---- Edit ----

function EditDialog({
  listing,
  sdk,
  onClose,
  onDone,
}: {
  listing: Listing
  sdk: Sdk
  onClose: () => void
  onDone: (next: Listing) => void
}) {
  const [title, setTitle] = useState(listing.title)
  const [description, setDescription] = useState(listing.description)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const addToast = useToastStore((s) => s.addToast)

  const dirty = title.trim() !== listing.title || description.trim() !== listing.description

  async function handleSubmit() {
    if (!dirty || !title.trim()) return
    setError(null)
    setBusy(true)
    try {
      const updated = await api.updateListing(
        {
          listingId: listing.id,
          title: title.trim(),
          description: description.trim(),
        },
        sdk.appKey(),
      )
      addToast('Listing updated')
      onDone(updated)
      onClose()
    } catch (e) {
      console.error('[edit]', e)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Edit listing">
      <div className="space-y-1">
        <label htmlFor={`title-${listing.id}`} className="text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
          Title
        </label>
        <input
          id={`title-${listing.id}`}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          disabled={busy}
          className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-100"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`desc-${listing.id}`} className="text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
          Description
        </label>
        <textarea
          id={`desc-${listing.id}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={5000}
          disabled={busy}
          className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-100 resize-y"
        />
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      <DialogButtons>
        <button type="button" onClick={onClose} disabled={busy} className="btn-secondary">
          Cancel
        </button>
        <button type="button" onClick={handleSubmit} disabled={busy || !dirty || !title.trim()} className="btn-primary">
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </DialogButtons>
    </Modal>
  )
}

// ---- Delete ----

// Parse the 64-hex Object ID from a Sia share URL path. Same pattern the
// API uses server-side; duplicated here so we don't have to round-trip
// the listing through the server to find out what to unpin.
const SHARE_PATH_RE = /^\/objects\/([0-9a-fA-F]{64})\/shared$/
function objectIdFromShareUrl(shareUrl: string): string | null {
  try {
    const m = SHARE_PATH_RE.exec(new URL(shareUrl).pathname)
    return m ? m[1].toLowerCase() : null
  } catch {
    return null
  }
}

function DeleteDialog({
  listing,
  sdk,
  onClose,
  onDone,
}: {
  listing: Listing
  sdk: Sdk
  onClose: () => void
  onDone: () => void
}) {
  const [unpinFromSia, setUnpinFromSia] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unpinWarning, setUnpinWarning] = useState<string | null>(null)
  const addToast = useToastStore((s) => s.addToast)

  async function handleSubmit() {
    setError(null)
    setUnpinWarning(null)
    setBusy(true)
    try {
      // 1. Catalog delete first. If this fails, we leave Sia alone and
      //    bail — the listing is still visible and we want it that way.
      await api.deleteListing(listing.id, sdk.appKey())

      // 2. Optional Sia unpin. Done after the catalog delete so a Sia
      //    failure leaves a recoverable state ("video still on Sia, no
      //    catalog row") rather than an unrecoverable one ("listing
      //    points at a deleted Sia object").
      if (unpinFromSia) {
        const objectId = objectIdFromShareUrl(listing.shareUrl)
        if (!objectId) {
          // Surface this but don't fail the whole flow — the catalog row is gone.
          setUnpinWarning(
            "Couldn't parse the Object ID out of the share URL. The listing was removed from the catalog but the video is still on Sia.",
          )
        } else {
          try {
            await sdk.deleteObject(objectId)
            addToast('Listing deleted and unpinned from Sia')
            onDone()
            onClose()
            return
          } catch (e) {
            console.error('[delete] sia unpin failed:', e)
            setUnpinWarning(
              `Listing was removed from the catalog, but unpinning from Sia failed: ${
                e instanceof Error ? e.message : String(e)
              }. The video is still on Sia under your indexer account.`,
            )
            // Fall through — the catalog action succeeded, so we still call onDone.
            // We leave the modal open so the warning is visible.
            onDone()
            return
          }
        }
      }

      addToast('Listing deleted')
      onDone()
      onClose()
    } catch (e) {
      console.error('[delete]', e)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Delete listing?">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        This removes <span className="font-medium text-neutral-900 dark:text-neutral-100">{listing.title}</span> from the
        Vidway catalog.
      </p>

      <label className="flex items-start gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 cursor-pointer transition-colors">
        <input
          type="checkbox"
          checked={unpinFromSia}
          onChange={(e) => setUnpinFromSia(e.target.checked)}
          disabled={busy}
          className="mt-0.5 accent-neutral-900 dark:accent-neutral-100"
        />
        <div className="flex-1">
          <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Also unpin from Sia</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Removes the object from your indexer account too. The shards on storage providers may
            stay until their contracts expire, but the indexer stops tracking the object and you
            won&apos;t be billed for further metadata.
          </div>
        </div>
      </label>

      {!unpinFromSia && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Without this, the video stays on Sia under your indexer account — only the Vidway
          catalog row is removed.
        </p>
      )}

      {unpinWarning && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-900 dark:text-amber-300">
          {unpinWarning}
        </div>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}

      <DialogButtons>
        <button type="button" onClick={onClose} disabled={busy} className="btn-secondary">
          {unpinWarning ? 'Close' : 'Cancel'}
        </button>
        {!unpinWarning && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white transition-colors"
          >
            {busy ? 'Deleting…' : unpinFromSia ? 'Delete and unpin' : 'Delete listing'}
          </button>
        )}
      </DialogButtons>
    </Modal>
  )
}

// ---- Shared modal scaffold ----

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function DialogButtons({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-2 pt-2">{children}</div>
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-800 dark:text-red-300">
      {children}
    </div>
  )
}
