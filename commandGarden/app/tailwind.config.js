import daisyui from 'daisyui';

export default {
  content: ['./index.html', './src/client/**/*.{ts,tsx}'],
  plugins: [daisyui],
  daisyui: {
    themes: ['light'],
  },
};
