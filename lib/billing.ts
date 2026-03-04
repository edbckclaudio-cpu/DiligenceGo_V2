let initialized = false
let initializing: Promise<void> | null = null

function getStore(): any {
  if (typeof window === 'undefined') return null
  return (window as any).store || null
}

function isAndroidNative(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as any
  try {
    const cap = w.Capacitor
    const native = !!cap?.isNativePlatform?.()
    const platform = cap?.getPlatform?.()
    return native && platform === 'android'
  } catch {
    return false
  }
}

async function ensureInit(productId: string): Promise<void> {
  const store = getStore()
  if (!isAndroidNative() || !store || typeof store.register !== 'function') {
    throw new Error('Assinaturas só funcionam no app Android instalado pelo Google Play')
  }
  if (initialized) return
  if (initializing) return initializing
  initializing = new Promise<void>((resolve, reject) => {
    try {
      const t = store.PAID_SUBSCRIPTION || store.SUBSCRIPTION
      store.register({ id: productId, type: t })
      store.refresh()
      const done = () => { initialized = true; resolve() }
      let timeout = setTimeout(() => reject(new Error('Timeout init billing')), 10000)
      const off = () => { try { clearTimeout(timeout) } catch {} }
      store.ready(done)
      store.error(() => {})
      setTimeout(() => { off(); if (!initialized) resolve() }, 1500)
    } catch (e) {
      reject(e as any)
    }
  })
  return initializing
}

export async function purchasePremium(productId?: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const pid =
      productId ||
      ((typeof process !== 'undefined' && (process as any).env?.NEXT_PUBLIC_BILLING_PRODUCT_ID) as string) ||
      'premium_4999'
    const store = getStore()
    if (!isAndroidNative() || !store) {
      return { ok: false, message: 'Assinaturas só funcionam no app Android instalado pelo Google Play' }
    }
    await ensureInit(pid)
    return await new Promise((resolve) => {
      let settled = false
      const done = (ok: boolean, message?: string) => {
        if (settled) return
        settled = true
        resolve({ ok, message })
      }
      try {
        store.when(pid).approved((p: any) => {
          try {
            p.finish()
          } catch {}
          done(true)
        })
        store.when(pid).cancelled(() => done(false, 'Cancelado pelo usuário'))
        store.when(pid).error(() => done(false, 'Compra indisponível no momento'))
        store.order(pid)
        setTimeout(() => done(false, 'Tempo esgotado. Tente novamente.'), 60000)
      } catch {
        done(false, 'Compra indisponível no momento')
      }
    })
  } catch (e: any) {
    return { ok: false, message: 'Assinaturas só funcionam no app Android instalado pelo Google Play' }
  }
}
