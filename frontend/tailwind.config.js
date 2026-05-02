// Tailwind CSS configuration
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#00A651',
        'primary-dark': '#008541',
        'primary-light': '#26C97B',
        accent: '#FFB81C',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', '"Helvetica Neue"', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
