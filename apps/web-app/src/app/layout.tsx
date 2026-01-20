import type { Metadata } from 'next'
import Script from 'next/script'
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const plusJakarta = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'AI Shopping Agent | Multi-AI-Agent4OnlineShopping',
  description: 'Shopping like prompting! AI-powered delegated buying platform with real-time agent visualization.',
  keywords: ['AI', 'Shopping', 'Multi-Agent', 'LangGraph', 'E-commerce'],
}

const useMockApi = process.env.NEXT_PUBLIC_MOCK_API === '1'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${plusJakarta.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans antialiased bg-surface-50">
        {useMockApi && <Script src="/mock-api.js" strategy="beforeInteractive" />}
        {children}
      </body>
    </html>
  )
}
