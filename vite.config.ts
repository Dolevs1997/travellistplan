import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * `npm run dev` serves /api/chat from netlify/functions/chat.mts, the same code Netlify runs.
 * It reads ANTHROPIC_API_KEY (and CHAT_ACCESS_CODE) from the environment or from .env.local, which git ignores.
 */
function devChatApi(): Plugin {
  return {
    name: 'dev-chat-api',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')
      for (const k of ['ANTHROPIC_API_KEY', 'CHAT_ACCESS_CODE']) if (env[k] && !process.env[k]) process.env[k] = env[k]
      server.middlewares.use('/api/chat', async (req, res) => {
        try {
          const mod = (await server.ssrLoadModule('/netlify/functions/chat.mts')) as { default: (r: Request) => Promise<Response> }
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
          const response = await mod.default(
            new Request('http://localhost/api/chat', { method: req.method, headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }),
          )
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          if (response.body) for await (const chunk of response.body) res.write(chunk)
          res.end()
        } catch (err) {
          res.statusCode = 500
          res.end(String(err))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devChatApi()],
  // MapLibre's worker is bundled separately (see src/maplibreSetup.ts) and is an ES module.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 1600 },
})
