export interface Env {
  DB: D1Database
  R2: R2Bucket
  ASSETS?: Fetcher
  JWT_SECRET: string
}

export type StoreId = 'mty' | 'cdmx'
export type Role = 'owner' | 'seller'

export interface Session {
  userId: number
  store: StoreId
  role: Role
  name: string
}

/** Variables que Hono lleva en el contexto. */
export interface Vars {
  session: Session
}

export type AppEnv = { Bindings: Env; Variables: Vars }
