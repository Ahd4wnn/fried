import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { Spinner, Textarea } from '../ui'

/**
 * Therapist private session notes. The text is envelope-encrypted server-side
 * and readable only by the authoring therapist — never the seeker, never admin.
 */
export function NotesEditor({ bookingId }: { bookingId: string }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .getSessionNote(bookingId)
      .then((n) => {
        if (!cancelled && n.text) setText(n.text)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [bookingId])

  const handleSave = async () => {
    if (!text.trim()) return
    setSaving(true)
    setError(null)
    try {
      const saved = await api.saveSessionNote(bookingId, text.trim())
      setSavedAt(saved.updated_at)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t save the note.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[11px] text-ink-soft">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        Encrypted and visible only to you — never the seeker, never Hovio staff.
      </div>
      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner className="h-5 w-5 text-forest" />
        </div>
      ) : (
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="Your private observations for this session…"
          aria-label="Private session notes"
        />
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-ink-soft">
          {savedAt ? 'Saved just now' : ''}
        </span>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading || !text.trim()}
          className="focus-ring inline-flex h-10 items-center gap-2 rounded-full bg-forest px-5 text-xs font-semibold text-white transition-all hover:bg-forest-deep disabled:opacity-50"
        >
          {saving ? <Spinner className="h-3.5 w-3.5" /> : null} Save note
        </button>
      </div>
    </div>
  )
}
