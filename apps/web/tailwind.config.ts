import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // RM brand blue (ribbon monogram) — UI/UX Web design tokens.
        brand: { DEFAULT: '#2563eb', dark: '#1d4ed8' },
      },
    },
  },
  plugins: [],
};

export default config;
