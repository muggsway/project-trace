'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Camera, Flame, Pencil, X, Utensils } from 'lucide-react'
import { JournalEntry, Macros } from '@/lib/types'
import { dummyEntries } from '@/lib/dummy-data'
import { formatTime } from '@/lib/utils'

export default function FoodPage() {
  const [entries, setEntries] = useState<JournalEntry[]>(dummyEntries)
  // Map entry id → local object URL for uploaded photo thumbnails
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [editing, setEditing] = useState<JournalEntry | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const foodEntries = entries
    .filter((e) => e.entry_type === 'food' && e.status === 'confirmed')
    .sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime())

  const totalCalories = foodEntries.reduce((sum, e) => sum + (e.macros?.calories ?? 0), 0)
  const totalProtein = foodEntries.reduce((sum, e) => sum + (e.macros?.protein_g ?? 0), 0)
  const totalCarbs = foodEntries.reduce((sum, e) => sum + (e.macros?.carbs_g ?? 0), 0)
  const totalFat = foodEntries.reduce((sum, e) => sum + (e.macros?.fat_g ?? 0), 0)

  async function handlePhoto(file: File) {
    setUploading(true)
    setUploadError(null)
    const thumbUrl = URL.createObjectURL(file)
    try {
      const form = new FormData()
      form.append('image', file)
      const res = await fetch('/api/log/photo', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      if (!data.is_food) {
        setUploadError('No food detected in that photo — try another.')
        URL.revokeObjectURL(thumbUrl)
        return
      }
      const entry: JournalEntry = { ...data.entry, macros: data.macros }
      setEntries((prev) => [entry, ...prev])
      setThumbnails((prev) => ({ ...prev, [entry.id]: thumbUrl }))
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Something went wrong')
      URL.revokeObjectURL(thumbUrl)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function handleEntryUpdated(updated: JournalEntry) {
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
    setEditing(null)
  }

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="flex flex-col min-h-screen pb-28">
      {/* Header */}
      <div className="px-5 pt-8 pb-4 flex items-center gap-3">
        <Link href="/" className="p-2 -ml-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft size={20} className="text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Food Log</h1>
          <p className="text-xs text-gray-400">{formattedDate}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5">
        {/* Daily totals card */}
        <div className="rounded-2xl border border-gray-100 bg-white px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Flame size={16} className="text-green-600" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Today's Totals
            </span>
          </div>
          <p className="text-3xl font-bold text-gray-900 mb-1">
            {totalCalories > 0 ? `${totalCalories} kcal` : '—'}
          </p>
          {totalCalories > 0 && (
            <div className="flex gap-4 mt-2">
              <Macro label="Protein" value={totalProtein} unit="g" color="text-blue-600" />
              <Macro label="Carbs" value={totalCarbs} unit="g" color="text-amber-600" />
              <Macro label="Fat" value={totalFat} unit="g" color="text-red-500" />
            </div>
          )}
        </div>

        {/* Food entries */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
            {foodEntries.length} {foodEntries.length === 1 ? 'item' : 'items'} logged
          </h2>

          {foodEntries.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              No food logged yet. Take a photo to get started.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {foodEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-gray-100 bg-white px-4 py-3 flex items-center gap-3"
                >
                  {/* Thumbnail or placeholder */}
                  {thumbnails[entry.id] ? (
                    <img
                      src={thumbnails[entry.id]}
                      alt={entry.description}
                      className="w-12 h-12 rounded-xl object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                      <Utensils size={18} className="text-green-400" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{entry.description}</p>
                    {entry.quantity && (
                      <p className="text-xs text-gray-400">{entry.quantity}</p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400 tabular-nums">
                        {formatTime(entry.logged_at)}
                      </span>
                      {entry.macros && (
                        <span className="text-xs text-gray-400">
                          · {entry.macros.protein_g}g P · {entry.macros.carbs_g}g C · {entry.macros.fat_g}g F
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Calories + edit */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {entry.macros && (
                      <span className="text-sm font-bold text-gray-700">
                        {entry.macros.calories} kcal
                      </span>
                    )}
                    <button
                      onClick={() => setEditing(entry)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Floating photo button */}
      <div className="fixed bottom-8 left-0 right-0">
      <div className="max-w-md mx-auto px-5">
        {uploadError && (
          <p className="text-xs text-red-500 text-center mb-2">{uploadError}</p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handlePhoto(file)
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gray-900 text-white py-4 text-sm font-semibold hover:bg-gray-800 active:scale-[0.98] transition-all disabled:opacity-50 shadow-2xl"
        >
          <Camera size={18} />
          {uploading ? 'Analysing photo…' : 'Log food from photo'}
        </button>
        </div>
      </div>

      {/* Edit sheet */}
      {editing && (
        <EditSheet
          entry={editing}
          thumbnail={thumbnails[editing.id]}
          onSave={handleEntryUpdated}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Edit sheet
// ---------------------------------------------------------------------------

function EditSheet({
  entry,
  thumbnail,
  onSave,
  onClose,
}: {
  entry: JournalEntry
  thumbnail?: string
  onSave: (updated: JournalEntry) => void
  onClose: () => void
}) {
  const [description, setDescription] = useState(entry.description)
  const [quantity, setQuantity] = useState(entry.quantity ?? '')
  const [macros, setMacros] = useState<Macros | undefined>(entry.macros)
  const [estimating, setEstimating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setEstimating(true)
    setError(null)
    try {
      const res = await fetch('/api/log/estimate-macros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, quantity: quantity || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to estimate macros')
      const updatedMacros: Macros = data
      setMacros(updatedMacros)
      onSave({ ...entry, description, quantity: quantity || undefined, macros: updatedMacros })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setEstimating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative max-w-md mx-auto w-full bg-white rounded-t-3xl shadow-2xl">
        {/* Handle + header */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-100">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">Edit Food</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {/* Thumbnail */}
          {thumbnail && (
            <img
              src={thumbnail}
              alt={entry.description}
              className="w-full h-40 rounded-2xl object-cover"
            />
          )}

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest block mb-1.5">
              Item
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-300"
              placeholder="e.g. scrambled eggs"
            />
          </div>

          {/* Quantity */}
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest block mb-1.5">
              Quantity
            </label>
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-300"
              placeholder="e.g. 1 bowl, 200g, 2 cups"
            />
          </div>

          {/* Macros — read only */}
          {macros && (
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest block mb-1.5">
                Macros (auto-calculated)
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Calories', value: macros.calories, unit: 'kcal' },
                  { label: 'Protein', value: macros.protein_g, unit: 'g' },
                  { label: 'Carbs', value: macros.carbs_g, unit: 'g' },
                  { label: 'Fat', value: macros.fat_g, unit: 'g' },
                ].map(({ label, value, unit }) => (
                  <div key={label} className="rounded-xl bg-gray-50 border border-gray-100 px-2 py-2 text-center">
                    <p className="text-sm font-bold text-gray-700">{value}<span className="text-[10px] font-normal text-gray-400">{unit}</span></p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-500 text-center">{error}</p>}

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={estimating || !description.trim()}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gray-900 text-white py-3.5 text-sm font-semibold hover:bg-gray-800 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {estimating ? 'Updating macros…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Macro({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div>
      <p className={`text-base font-bold ${color}`}>{value}{unit}</p>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
    </div>
  )
}
