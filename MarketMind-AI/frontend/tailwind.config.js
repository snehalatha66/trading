// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        "bg-main": "#101310",
        "bg-sidebar": "#151915",
        "bg-card": "#1C231E",
        "bg-surface": "#252D27",
        "primary-emerald": "#20C982",
        "secondary-gold": "#D6AD62",
        "positive": "#20C982",
        "negative": "#E46B70",
        "text-main": "#F1F3F0",
        "text-secondary": "#929B93",
        "border-dark": "#303A32"
      },
      borderRadius: {
        DEFAULT: "0.5rem", // 8px ~ 12-16px radius for cards
        lg: "0.75rem"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"]
      }
    }
  },
  darkMode: "class",
  plugins: []
};