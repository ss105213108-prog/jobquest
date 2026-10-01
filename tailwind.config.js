/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#24170e',
        wood: '#4d2f1d',
        leather: '#3b2417',
        parchment: '#e5c98f',
        parchmentLight: '#f0dcaa',
        brass: '#b4863c',
      },
    },
  },
  plugins: [],
}
