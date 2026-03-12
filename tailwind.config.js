/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./App.tsx",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        // Custom colors from the original HTML
        paper: '#FFFFFF',
        ink: '#111827',
        'mono-light': '#6B7280',
        'mono-mid': '#4B5563',
        'mono-dark': '#F9FAFB',
        'mono-darker': '#F3F4F6',
        selection: '#111827',
        'selection-light': '#374151',
        'selection-super-light': '#E5E7EB',
        'limb-highlight': '#4B5563',
        'accent-purple': '#4B5563',
        'accent-green': '#4B5563',
        'accent-red': '#EF4444',
        shell: '#F9FAFB',
        black: '#000000',
        ridge: '#E5E7EB',
        'focus-ring': '#374151',
        olive: '#808000',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--app-font-sans)", "sans-serif"],
        mono: ['"JetBrains Mono"', 'monospace'],
        archaic: ['"VT323"', 'monospace'],
      },
      backgroundImage: {
        'triangle-grid': `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3e%3cpath d='M12 0 L0 12 L12 24 L24 12 Z M0 0 L12 24 L24 0 Z' stroke='rgba(229, 231, 235, 1)' stroke-width='1' fill='none'/%3e%3c/svg%3e")`,
      },
      animation: {
        'terminal-boot': 'terminal-boot 2s steps(1, end) forwards',
        'pop': 'pop 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
      },
      keyframes: {
        'terminal-boot': {
          '0%': { opacity: '0' },
          '10%, 20%, 30%, 50%, 70%, 90%': { opacity: '1' },
          '15%, 25%, 55%, 75%': { opacity: '0.3' },
          '100%': { opacity: '0' },
        },
        'pop': {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)' },
        }
      }
    },
  },
  plugins: [],
}
