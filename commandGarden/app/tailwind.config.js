import daisyui from 'daisyui';

export default {
  content: ['./index.html', './src/client/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  plugins: [daisyui],
  daisyui: {
    themes: [
      {
        light: {
          'primary': '#3b82f6',
          'primary-content': '#ffffff',
          'secondary': '#64748b',
          'secondary-content': '#ffffff',
          'accent': '#0ea5e9',
          'accent-content': '#ffffff',
          'neutral': '#1e293b',
          'neutral-content': '#f8fafc',
          'base-100': '#ffffff',
          'base-200': '#f8fafc',
          'base-300': '#e2e8f0',
          'base-content': '#1e293b',
          'info': '#3b82f6',
          'success': '#22c55e',
          'warning': '#f59e0b',
          'error': '#ef4444',
        },
      },
      {
        dark: {
          'primary': '#60a5fa',
          'primary-content': '#0c1524',
          'secondary': '#94a3b8',
          'secondary-content': '#0f172a',
          'accent': '#38bdf8',
          'accent-content': '#0c1524',
          'neutral': '#cbd5e1',
          'neutral-content': '#0f172a',
          'base-100': '#0f172a',
          'base-200': '#1e293b',
          'base-300': '#334155',
          'base-content': '#e2e8f0',
          'info': '#60a5fa',
          'success': '#4ade80',
          'warning': '#fbbf24',
          'error': '#f87171',
        },
      },
    ],
  },
};
