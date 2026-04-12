import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Project Trace',
  description: 'Triangulate your health data. Surface real insights.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,          // prevent accidental zoom on input focus (iOS)
  userScalable: false,
  viewportFit: 'cover',     // extend into notch / Dynamic Island area
  themeColor: '#ffffff',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-[#f8f9fa] antialiased">
        {/* min-h-dvh uses dynamic viewport height — fixes iOS Safari address bar issue */}
        <div className="max-w-md mx-auto min-h-dvh bg-white shadow-sm relative">
          {children}
        </div>
      </body>
    </html>
  )
}
