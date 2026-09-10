import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { clearCache, get, post } from './api'

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

  const value = useMemo(() => ({ me, loading, refresh, logout }), [me, loading, refresh, logout])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(Ctx)
  if (!value) throw new Error('useSession fuera de SessionProvider')
  return value
}
