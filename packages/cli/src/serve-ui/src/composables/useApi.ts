const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    let message = `API ${res.status}`
    try {
      const body = JSON.parse(text)
      if (body?.error) message = body.error
    } catch {
      if (text) message = text
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export function useApi() {
  return {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
    del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  }
}
