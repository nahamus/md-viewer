import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works whether it's served from a
  // domain root or a GitHub Pages project subpath (username.github.io/repo/).
  base: './',
})
