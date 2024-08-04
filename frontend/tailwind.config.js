module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: '#0a192f',
        'lightest-slate': '#ccd6f6',
        'green-bright': '#64ffda',
        'sky-bright': '#33C7FF',
        'neutral-950': '#0d0d0d',
      },
      fontFamily: {
        ntr: ['NTR', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
