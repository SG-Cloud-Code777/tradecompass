/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        buy: { DEFAULT: '#16a34a', soft: '#16a34a22' },
        hold: { DEFAULT: '#d97706', soft: '#d9770622' },
        sell: { DEFAULT: '#dc2626', soft: '#dc262622' },
      },
    },
  },
  plugins: [],
};
