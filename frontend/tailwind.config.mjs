/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Sarabun', 'Inter', 'system-ui', 'sans-serif'],
        thai: ['Sarabun', 'sans-serif'],
        en: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#eef4ff',
          100: '#dbe7ff',
          200: '#bdd3ff',
          300: '#91b4ff',
          400: '#5d88f0',
          500: '#335fd4',
          600: '#244aa8',
          700: '#1e3a8a',
          800: '#172f70',
          900: '#14285e',
          dark: '#1e3a8a',
        },
        secondary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          900: '#14532d',
        },
        accent: {
          500: '#059669',
          600: '#047857',
          dark: '#059669',
        },
        thai: {
          red: '#A51C30',
          blue: '#003087',
          gold: '#C9A84C',
        },
        status: {
          success: '#10b981',
          warning: '#f59e0b',
          danger: '#ef4444',
          info: '#3b82f6',
        },
      },
      spacing: {
        '13': '3.25rem',
        '15': '3.75rem',
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '3rem',
      },
      boxShadow: {
        'xs': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'sm': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        'card': '0 1px 3px rgba(0,0,0,0.05)',
        'card-hover': '0 10px 25px -5px rgba(0,0,0,0.12)',
        'button': '0 4px 12px rgba(30,58,138,0.22)',
        'button-hover': '0 8px 25px rgba(30,58,138,0.26)',
        'glow': '0 0 0 3px rgba(30,58,138,0.1)',
        'accent-glow': '0 4px 12px rgba(5,150,105,0.35)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out both',
        'fade-in-fast': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.6s ease-out both',
        'slide-in-left': 'slideInLeft 0.6s ease-out both',
        'slide-in-right': 'slideInRight 0.6s ease-out both',
        'float': 'float 6s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(-12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(40px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-40px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(40px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
    },
  },
  plugins: [
    // Safe area inset utilities for Capacitor mobile (notch / Dynamic Island)
    function ({ addUtilities }) {
      addUtilities({
        '.pb-safe': { paddingBottom: 'env(safe-area-inset-bottom, 0px)' },
        '.pt-safe': { paddingTop: 'env(safe-area-inset-top, 0px)' },
        '.pl-safe': { paddingLeft: 'env(safe-area-inset-left, 0px)' },
        '.pr-safe': { paddingRight: 'env(safe-area-inset-right, 0px)' },
        '.mb-safe': { marginBottom: 'env(safe-area-inset-bottom, 0px)' },
        '.mt-safe': { marginTop: 'env(safe-area-inset-top, 0px)' },
      });
    },
  ],
};
