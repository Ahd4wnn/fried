import type { Config } from 'tailwindcss'

/**
 * Hovio design tokens — see docs/design-system.md.
 * Forest green on cream, Instrument Serif for display, Inter for everything else.
 * The `forest` 50–900 scale is derived from the brand primary #1C5C32 (lands at 600).
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Breakpoints from design-system.md (these match Tailwind defaults; declared for clarity).
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
    },
    extend: {
      colors: {
        forest: {
          DEFAULT: '#1C5C32', // primary — buttons, links, active state
          deep: '#143F23', // hover / pressed, dark accents
          tint: '#E7EFE9', // subtle fills, selected rows
          50: '#F0F5F1',
          100: '#E7EFE9',
          200: '#C7DBCD',
          300: '#9DBFA7',
          400: '#5E8E6C',
          500: '#2D6E43',
          600: '#1C5C32',
          700: '#184E2B',
          800: '#143F23',
          900: '#0E2D19',
        },
        cream: '#FBF9F4', // app background
        paper: '#FFFFFF', // cards, surfaces
        ink: {
          DEFAULT: '#1A1C1A', // primary text
          soft: '#5B615C', // secondary text
        },
        line: '#E8E5DD', // hairline borders, dividers
        success: '#1C5C32', // reuse forest
        warning: '#B8860B', // caution states
        danger: '#B23A3A', // errors only — never crisis CTAs
        // Joy / accent palette (warm, used sparingly) — see docs/design-system.md.
        // Soft bg pairs with ink text (AA); `deep` is for small icons/tags only.
        'accent-sage': { DEFAULT: '#DCEDE2', deep: '#7FB59A' },
        'accent-sky': { DEFAULT: '#DCEAF2', deep: '#8FB8D4' },
        'accent-lavender': { DEFAULT: '#ECE6F7', deep: '#B7A6E0' },
        'accent-apricot': { DEFAULT: '#FBE3D0', deep: '#E8A87C' },
        'accent-butter': { DEFAULT: '#F8EDC8', deep: '#E6C65C' },
        'accent-blush': { DEFAULT: '#F8DEE4', deep: '#E1A7B5' },
      },
      fontFamily: {
        display: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"InterVariable"', 'Inter', 'system-ui', 'sans-serif'],
        fraunces: ['Fraunces', 'serif'],
      },
      fontSize: {
        // Type scale (rem) from design-system.md.
        xs: ['0.75rem', { lineHeight: '1.5' }],
        sm: ['0.875rem', { lineHeight: '1.5' }],
        base: ['1rem', { lineHeight: '1.6' }],
        lg: ['1.125rem', { lineHeight: '1.6' }],
        xl: ['1.25rem', { lineHeight: '1.5' }],
        '2xl': ['1.5rem', { lineHeight: '1.4' }],
        '3xl': ['2rem', { lineHeight: '1.2' }],
        '4xl': ['2.75rem', { lineHeight: '1.1' }],
        '5xl': ['3.5rem', { lineHeight: '1.05' }],
      },
      borderRadius: {
        none: '0',
        sm: '8px',
        DEFAULT: '12px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        '2xl': '32px',
        '3xl': '40px',
        full: '9999px',
      },
      boxShadow: {
        // Soft, low depth — no hard drop shadows.
        soft: '0 1px 2px rgba(20,28,20,.04), 0 8px 24px rgba(20,28,20,.06)',
        // Slightly raised — used for gentle hover-lift on bento cards.
        lift: '0 2px 4px rgba(20,28,20,.05), 0 14px 36px rgba(20,28,20,.10)',
      },
    },
  },
  plugins: [],
} satisfies Config
