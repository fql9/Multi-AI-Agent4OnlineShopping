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
  title: 'Shopping Copilot - 你的全球购物智能助手',
  description: '像对话一样购物！Shopping Copilot 帮你全球比价、找同款、推荐最优购买方案。',
  keywords: ['Shopping Copilot', 'AI购物', '全球比价', '找同款', '智能购物助手', 'Multi-Agent'],
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
