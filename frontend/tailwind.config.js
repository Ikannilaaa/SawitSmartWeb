/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // Pastikan baris ini ada dan benar
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'sawit-green': { DEFAULT: '#2E7D32', light: '#A5D6A7' },
        'sawit-yellow': '#FDD835',
        'sawit-red': '#D32F2F',
        'dark-primary': '#111827',
        'dark-secondary': '#1f2937',
        'dark-accent': '#374151',
      }
    },
  },
  plugins: [],
}