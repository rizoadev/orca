/**
 * Local loopback HTTP server that serves a minimal HTML page containing a
 * YouTube iframe embed. The webview loads http://127.0.0.1:PORT/embed/VIDEO_ID
 * so the iframe's parent page has a real HTTP origin — YouTube rejects embeds
 * from null/data: origins with Error 153.
 */
import { createServer, type Server } from 'node:http'

let server: Server | null = null
let port = 0

function embedHtml(videoId: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;overflow:hidden}html,body{width:100%;height:100%;background:#000}</style></head><body><div style="left:0;width:100%;height:0;position:relative;padding-bottom:56.25%"><iframe src="https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&autoplay=1" style="top:0;left:0;width:100%;height:100%;position:absolute;border:0" allowfullscreen scrolling="no" allow="accelerometer *; clipboard-write *; encrypted-media *; gyroscope *; picture-in-picture *; web-share *" referrerpolicy="strict-origin"></iframe></div></body></html>`
}

export function ensureYouTubeEmbedServer(): Promise<number> {
  if (server && port) {
    return Promise.resolve(port)
  }
  return new Promise((resolve, reject) => {
    const s = createServer((req, res) => {
      const match = req.url?.match(/^\/embed\/([A-Za-z0-9_-]{11})$/)
      if (!match) {
        res.writeHead(404)
        res.end('not found')
        return
      }
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store'
      })
      res.end(embedHtml(match[1]!))
    })
    s.on('error', reject)
    // Why: port 0 lets the OS pick a free port; we return it to the renderer.
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address()
      port = typeof addr === 'object' && addr ? addr.port : 0
      server = s
      resolve(port)
    })
  })
}

export function stopYouTubeEmbedServer(): void {
  if (server) {
    server.close()
    server = null
    port = 0
  }
}
