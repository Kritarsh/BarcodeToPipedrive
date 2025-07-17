/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,jsx,ts,tsx,html}",
    "./public/index.html",
  ],
  darkMode: 'media', // Enable system preference-based dark mode
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")],
};