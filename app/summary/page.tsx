'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Send, RefreshCw, CheckCircle, AlertTriangle, TrendingUp } from 'lucide-react'
import { dummySummary } from '@/lib/dummy-data'
import { DailySummary } from '@/lib/types'

export default function SummaryPage() {
  const [summary, setSummary] = useState<DailySummary | null>(dummySummary)
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function generateSummary() {
    setGenerating(true)
    setSent(false)
    // TODO (Insights & Delivery — Person B): POST to /api/insights/generate
    // Body: { entries: confirmedEntries, healthSnapshot, workouts, habits, rollingSummary }
    // Returns: DailySummary
    await new Promise((r) => setTimeout(r, 1800))
    setSummary(dummySummary)
    setGenerating(false)
  }

  async function sendWhatsApp() {
    if (!summary) return
    setSending(true)
    try {
      const res = await fetch('/api/notify/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Unknown error' }))
        alert(`Failed to send: ${error}`)
        return
      }
      setSent(true)
    } finally {
      setSending(false)
    }
  }

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="flex flex-col min-h-dvh pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      {/* Header */}
      <div className="px-5 pt-8 pb-4 flex items-center gap-3">
        <Link
          href="/"
          className="p-2 -ml-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Today's Summary</h1>
          <p className="text-xs text-gray-400">{formattedDate}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5">
        {/* Generate / Regenerate button */}
        <button
          onClick={generateSummary}
          disabled={generating}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50"
        >
          <RefreshCw size={15} className={generating ? 'animate-spin' : ''} />
          {generating ? 'Generating with Claude…' : summary ? 'Regenerate' : 'Generate Summary'}
        </button>

        {/* Summary content */}
        {generating && (
          <div className="flex flex-col gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {summary && !generating && (
          <>
            {/* What worked well */}
            <SummaryCard
              icon={<CheckCircle size={16} className="text-green-600" />}
              label="What worked well"
              labelColor="text-green-700"
              bgColor="bg-green-50"
              borderColor="border-green-200"
              text={summary.what_worked}
            />

            {/* What was average */}
            <SummaryCard
              icon={<TrendingUp size={16} className="text-yellow-600" />}
              label="What was average"
              labelColor="text-yellow-700"
              bgColor="bg-yellow-50"
              borderColor="border-yellow-200"
              text={summary.what_was_average}
            />

            {/* Warnings — only if any */}
            {summary.warnings.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200">
                  <AlertTriangle size={15} className="text-amber-600" />
                  <span className="text-sm font-semibold text-amber-800">Watch out</span>
                </div>
                <div className="divide-y divide-amber-100">
                  {summary.warnings.map((w, i) => (
                    <div key={i} className="px-4 py-3">
                      <p className="text-sm text-amber-900 leading-relaxed">{w}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* WhatsApp send */}
            <div className="mt-2">
              {sent ? (
                <div className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-green-50 border border-green-200">
                  <CheckCircle size={16} className="text-green-600" />
                  <span className="text-sm font-semibold text-green-700">Sent via WhatsApp</span>
                </div>
              ) : (
                <button
                  onClick={sendWhatsApp}
                  disabled={sending}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 active:scale-95 transition-all disabled:opacity-50"
                >
                  <Send size={15} />
                  {sending ? 'Sending…' : 'Send via WhatsApp'}
                </button>
              )}
              <p className="text-center text-xs text-gray-400 mt-2">
                Delivered via Twilio · end-of-day push configured at 9 PM
              </p>
            </div>

            {/* Generated timestamp */}
            {summary.generated_at && (
              <p className="text-center text-xs text-gray-300">
                Generated {new Date(summary.generated_at).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            )}
          </>
        )}

        {!summary && !generating && (
          <div className="text-center py-16 text-gray-400 text-sm">
            Tap "Generate Summary" to get your end-of-day insights.
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({
  icon, label, labelColor, bgColor, borderColor, text,
}: {
  icon: React.ReactNode
  label: string
  labelColor: string
  bgColor: string
  borderColor: string
  text: string
}) {
  return (
    <div className={`rounded-2xl border ${borderColor} ${bgColor} px-4 py-4`}>
      <div className={`flex items-center gap-2 mb-2 ${labelColor}`}>
        {icon}
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <p className="text-sm text-gray-800 leading-relaxed">{text}</p>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-1/3 mb-3" />
      <div className="h-3 bg-gray-200 rounded w-full mb-2" />
      <div className="h-3 bg-gray-200 rounded w-4/5" />
    </div>
  )
}
