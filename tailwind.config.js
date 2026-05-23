/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Mirrors welshdog-designs-web3-shop so the shell feels native.
        brand: {
          dark: '#0f0c29',
          purple: '#302b63',
          teal: '#24243e',
          accent: '#00f2ea',
          pink: '#ff0058',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
