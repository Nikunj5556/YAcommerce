/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#000000',
          accent: '#002FA7',
        }
      }
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
