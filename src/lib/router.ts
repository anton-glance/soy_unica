import { useCallback, useEffect, useState } from 'react'

/**
 * Router mínimo sobre la History API. La aplicación tiene pocas rutas y no
 * queremos una dependencia más.
 */
export function navigate(to: string, replace = false): void {
  if (replace) window.history.replaceState({}, '', to)
  else window.history.pushState({}, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname)
  useEffect(() => {
    const onChange = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onChange)
    return () => window.removeEventListener('popstate', onChange)
  }, [])
  return path
}

export function useNavigate(): (to: string, replace?: boolean) => void {
  return useCallback((to: string, replace = false) => navigate(to, replace), [])
}

/** `/print/:folio/medidas` → { folio } */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = path.split('/').filter(Boolean)
  if (patternParts.length !== pathParts.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i] as string
    const value = pathParts[i] as string
    if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(value)
    else if (p !== value) return null
  }
  return params
}
