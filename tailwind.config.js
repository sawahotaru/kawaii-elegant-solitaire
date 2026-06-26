/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'game-bg': '#fdf2f8', // Pale pink
        'card-red': '#ef4444',
        'card-black': '#1f2937',
        'lavender': {
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
