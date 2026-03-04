/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Exact palette from spec
        navy: {
          50:  '#f0f4f8',
          100: '#d9e2ec',
          200: '#bcccdc',
          300: '#9fb3c8',
          400: '#627d98',
          500: '#486581',
          600: '#001f3f',
          650: '#113d69',
          700: '#001a35',
          800: '#00152b',
          900: '#001020',
          950: '#000a15',
        },
        'navy-placeholder': '#283c63', // 👈 change this anytime

        // Single accent color — clear sky blue pops well on deep navy
        accent:         '#4a9eda',
        accent2:        '#2e7db5',
        'accent-light': '#7dc2f0',
        muted:          '#9fb3c8',
        success:        '#3aaf7a',
        warn:           '#c9922a',
        danger:         '#c0392b',
      },
      fontFamily: {
        sans:    ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['"Syne"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        card:        '0 2px 10px rgba(0,0,0,.5)',
        'card-hover':'0 6px 20px rgba(0,0,0,.6)',
        modal:       '0 20px 70px rgba(0,0,0,.75)',
        glow:        '0 0 0 1px rgba(74,158,218,.35), 0 3px 14px rgba(74,158,218,.2)',
      },
      borderRadius: {
        sm:     '4px',
        DEFAULT:'6px',
        md:     '8px',
        lg:     '10px',
        xl:     '14px',
        '2xl':  '18px',
        full:   '9999px',
      },
    },
  },
  plugins: [],
}
