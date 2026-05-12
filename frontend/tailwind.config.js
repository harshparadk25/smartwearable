module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif']
      },
      colors: {
        brand: {
          50: '#eef2ff',
          200: '#c7d2fe',
          500: '#4f46e5',
          700: '#3730a3'
        }
      },
      keyframes: {
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' }
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'fade-in': 'fadeIn 0.6s ease-out both'
      }
    }
  },
  plugins: []
};
