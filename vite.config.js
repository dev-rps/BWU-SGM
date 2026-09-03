import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

function maplibreWorkerPlugin() {
  const getWorkerContent = () => {
    const workerFile = path.resolve('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs')
    return fs.existsSync(workerFile) ? fs.readFileSync(workerFile) : null
  }

  return {
    name: 'maplibre-worker-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/assets/maplibre-gl-worker.mjs')) {
          const content = getWorkerContent()
          if (content) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
            res.end(content)
            return
          }
        }

        if (req.url?.startsWith('/api/overpass') && req.method === 'POST') {
          let rawBody = ''
          req.on('data', chunk => { rawBody += chunk })
          req.on('end', async () => {
            try {
              let query = ''
              try {
                const parsed = JSON.parse(rawBody || '{}')
                query = parsed.query
              } catch {
                query = rawBody
              }

              if (!query) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'Missing query in request body' }))
                return
              }

              const overpassRes = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'User-Agent': 'SafetyGuardian/1.0',
                },
                body: `data=${encodeURIComponent(query)}`,
              })

              const text = await overpassRes.text()
              res.statusCode = overpassRes.status
              res.setHeader('Content-Type', 'application/json')
              res.end(text)
            } catch (err) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: err.message }))
            }
          })
          return
        }

        next()
      })
    },
    generateBundle() {
      const content = getWorkerContent()
      if (content) {
        this.emitFile({
          type: 'asset',
          fileName: 'assets/maplibre-gl-worker.mjs',
          source: content,
        })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), maplibreWorkerPlugin()],
  server: {
    port: 5173,
    open: true,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    }
  },
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  build: {
    sourcemap: false,
  }
})
