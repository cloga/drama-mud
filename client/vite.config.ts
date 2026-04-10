import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function normalizeBasePath(value: string | undefined) {
  const trimmed = (value ?? '/').trim()
  if (!trimmed || trimmed === '/') {
    return '/'
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = normalizeBasePath(env.VITE_APP_BASE_PATH)

  return {
    base,
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        '/api': 'http://localhost:3001',
        '/ws': {
          target: 'ws://localhost:3001',
          ws: true,
        },
        [`${base}api`]: 'http://localhost:3001',
        [`${base}ws`]: {
          target: 'ws://localhost:3001',
          ws: true,
        },
      },
    },
  }
})
