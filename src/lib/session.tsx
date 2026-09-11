import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { clearCache, get, post } from './api'
import { navigate } from './router'

export interface Me {
  userId: number
  store: 'mty' | 'cdmx'
  role: 'owner' | 'seller'
  name: string
  store_name: string
  kiosk_show_prices: boolean
}

interface SessionValue {
  me: Me | null
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
  /**
   * Devuelve a la persona a la pantalla de sucursal y rol. Se llama cuando el
   * servidor deja de reconocer la sesión, para que nunca quede una pantalla
   * sin salida.
   */
  signOutToEntry: (reason?: string) => Promise<void>
}

const Ctx = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await get<Me>('/auth/me')
      setMe(data)
    } catch {
      setMe(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    await post('/auth/logout').catch(() => undefined)
    clearCache()
    localStorage.removeItem('su:session')
    setMe(null)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const signOutToEntry = useCallback(async (reason?: string) => {
    await logout()
    if (reason) sessionStorage.setItem('su:entryNotice', reason)
    navigate('/', true)
  }, [logout])

  const value = useMemo(
    () => ({ me, loading, refresh, logout, signOutToEntry }),
    [me, loading, refresh, logout, signOutToEntry],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(Ctx)
  if (!value) throw new Error('useSession fuera de SessionProvider')
  return value
}
