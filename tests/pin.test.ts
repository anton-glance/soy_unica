import { describe, expect, it } from 'vitest'
import { hashPin, randomSalt, timingSafeEqual, verifyPin } from '../worker/lib/crypto'
import { LOCKOUT_SECONDS, LOCKOUT_THRESHOLD, evaluateLockout } from '../worker/lib/auth'

const AT = (secondsAgo: number, now = Date.UTC(2026, 8, 10, 12, 0, 0)) =>
  new Date(now - secondsAgo * 1000).toISOString()
const NOW = new Date(Date.UTC(2026, 8, 10, 12, 0, 0))

describe('verificación del NIP', () => {
  it('acepta el NIP correcto y rechaza cualquier otro', async () => {
    const salt = randomSalt()
    const hash = await hashPin('4242', salt)
    expect(await verifyPin('4242', hash, salt)).toBe(true)
    expect(await verifyPin('4243', hash, salt)).toBe(false)
    expect(await verifyPin('424', hash, salt)).toBe(false)
    expect(await verifyPin('42424', hash, salt)).toBe(false)
  })

  it('usa una sal distinta por usuario, así dos NIP iguales no se ven iguales', async () => {
    const a = randomSalt()
    const b = randomSalt()
    expect(a).not.toBe(b)
    expect(await hashPin('1111', a)).not.toBe(await hashPin('1111', b))
  })

  it('nunca guarda el NIP en claro', async () => {
    const salt = randomSalt()
    const hash = await hashPin('1111', salt)
    expect(hash).not.toContain('1111')
    expect(hash.length).toBeGreaterThan(20)
  })

  it('compara en tiempo constante', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
  })
})

describe('bloqueo por intentos fallidos', () => {
  it('no bloquea con menos de cinco fallos', () => {
    const failures = [AT(10), AT(20), AT(30), AT(40)]
    expect(failures).toHaveLength(LOCKOUT_THRESHOLD - 1)
    expect(evaluateLockout(failures, NOW).locked).toBe(false)
  })

  it('bloquea 60 segundos al quinto fallo dentro de los 10 minutos', () => {
    const state = evaluateLockout([AT(1), AT(20), AT(30), AT(40), AT(50)], NOW)
    expect(state.locked).toBe(true)
    expect(state.retry_in_seconds).toBeLessThanOrEqual(LOCKOUT_SECONDS)
    expect(state.retry_in_seconds).toBeGreaterThan(0)
  })

  it('suelta el bloqueo pasados los 60 segundos del último fallo', () => {
    const state = evaluateLockout([AT(61), AT(120), AT(180), AT(240), AT(300)], NOW)
    expect(state.locked).toBe(false)
  })

  it('sólo cuenta los fallos de los últimos 10 minutos', () => {
    // Cinco fallos, pero cuatro quedaron fuera de la ventana.
    const state = evaluateLockout([AT(30), AT(700), AT(800), AT(900), AT(1000)], NOW)
    expect(state.failures).toBe(1)
    expect(state.locked).toBe(false)
  })

  it('ignora marcas de tiempo ilegibles en lugar de bloquear de más', () => {
    expect(evaluateLockout(['no es una fecha', AT(5)], NOW).failures).toBe(1)
  })
})
