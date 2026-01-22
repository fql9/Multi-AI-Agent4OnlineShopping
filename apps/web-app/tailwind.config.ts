import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary - Brand Teal (#39C5BB)
        'primary': {
          50: '#ecfaf9',
          100: '#d1f2ef',
          200: '#a7e7e2',
          300: '#74d8d1',
          400: '#4ccac1',
          500: '#39C5BB',
          600: '#2fb3aa',
          700: '#248f88',
          800: '#1f716b',
          900: '#185854',
          950: '#0d3a37',
        },
        // Accent - same brand teal
        'accent': {
          50: '#ecfaf9',
          100: '#d1f2ef',
          200: '#a7e7e2',
          300: '#74d8d1',
          400: '#4ccac1',
          500: '#39C5BB',
          600: '#2fb3aa',
          700: '#248f88',
          800: '#1f716b',
          900: '#185854',
          950: '#0d3a37',
        },
        // Success - Teal Green
        'success': {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        // Warning - Amber
        'warning': {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        // Danger - Rose
        'danger': {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          800: '#9f1239',
          900: '#881337',
        },
        // Neutral - Slate with blue tint
        'surface': {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'SF Mono', 'Monaco', 'Consolas', 'monospace'],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        'glow': '0 0 40px -10px rgba(57, 197, 187, 0.18)',
        'glow-lg': '0 0 60px -15px rgba(57, 197, 187, 0.24)',
        'inner-glow': 'inset 0 2px 4px 0 rgba(57, 197, 187, 0.08)',
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
        'card-hover': '0 20px 25px -5px rgba(0, 0, 0, 0.06), 0 8px 10px -6px rgba(0, 0, 0, 0.06)',
        'tech': '0 10px 40px -10px rgba(57, 197, 187, 0.24)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-slow': 'bounceSlow 1s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        bounceSlow: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-3px)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 20px -5px rgba(57, 197, 187, 0.3)' },
          '50%': { boxShadow: '0 0 30px -5px rgba(57, 197, 187, 0.5)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-tech': 'linear-gradient(135deg, #39C5BB 0%, #2fb3aa 100%)',
        'gradient-success': 'linear-gradient(135deg, #39C5BB 0%, #2fb3aa 100%)',
        'mesh': `
          radial-gradient(at 40% 20%, rgba(57, 197, 187, 0.08) 0px, transparent 50%),
          radial-gradient(at 80% 0%, rgba(57, 197, 187, 0.08) 0px, transparent 50%),
          radial-gradient(at 0% 50%, rgba(57, 197, 187, 0.06) 0px, transparent 50%)
        `,
      },
    },
  },
  plugins: [],
}
export default config
