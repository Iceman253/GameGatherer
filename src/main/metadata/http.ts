import { get as httpsGet, request as httpsRequest } from 'https'
import type { RequestOptions } from 'https'

export function fetchJson<T>(url: string, extraHeaders: Record<string, string> = {}, timeoutMs = 10000): Promise<T | null> {
  return new Promise((resolve) => {
    const req = httpsGet(
      url,
      { headers: { 'User-Agent': 'GameGatherer/1.0', ...extraHeaders }, timeout: timeoutMs },
      (res) => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume()
          resolve(null)
          return
        }
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => { body += chunk })
        res.on('end', () => {
          try { resolve(JSON.parse(body) as T) } catch { resolve(null) }
        })
      }
    )
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

export function postForm<T>(
  url: string,
  formData: Record<string, string>,
  extraHeaders: Record<string, string> = {},
  timeoutMs = 10000
): Promise<T | null> {
  return new Promise((resolve) => {
    const body = new URLSearchParams(formData).toString()
    const urlObj = new URL(url)
    const options: RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'GameGatherer/1.0',
        ...extraHeaders
      },
      timeout: timeoutMs
    }
    const req = httpsRequest(options, (res) => {
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        res.resume()
        resolve(null)
        return
      }
      let responseBody = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => { responseBody += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(responseBody) as T) } catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
    req.write(body)
    req.end()
  })
}
