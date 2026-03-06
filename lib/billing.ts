import { getSupabase } from './supabase'
let initialized = false
let initializing: Promise<void> | null = null

function getStore(): any {
  if (typeof window === 'undefined') return null
  const w = window as any
  return w?.CdvPurchase?.store || w?.store || null
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

async function waitForStore(timeoutMs = 12000): Promise<any> {
  const tryGet = () => {
    const s = getStore()
    if (s && (typeof s.initialize === 'function' || typeof s.register === 'function')) return s
    return null
  }
  const existing = tryGet()
  if (existing) return existing
  return await new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      const s = tryGet()
      if (s) return resolve(s)
      if (Date.now() - start > timeoutMs) return reject(new Error('timeout'))
      setTimeout(tick, 150)
    }
    try {
      document.addEventListener('deviceready', tick, { once: true } as any)
    } catch {}
    try {
      document.addEventListener('DOMContentLoaded', tick, { once: true } as any)
    } catch {}
    setTimeout(tick, 0)
  })
}

async function ensureInit(productId: string): Promise<void> {
  const store = await waitForStore().catch(() => null)
  if (!store) throw new Error('Assinaturas só funcionam no app Android instalado pelo Google Play')
  if (initialized) return
  if (initializing) return initializing
  // CRITICAL: CORE BILLING LOGIC - DO NOT MODIFY INITIALIZATION FLOW.
  initializing = new Promise<void>((resolve, reject) => {
    try {
      const w = window as any
      const Cdv = w.CdvPurchase
      const platform = Cdv?.Platform?.GOOGLE_PLAY || 'android-playstore'
      const type = Cdv?.ProductType?.PAID_SUBSCRIPTION || store.PAID_SUBSCRIPTION || store.SUBSCRIPTION
      try {
        if (!w.DGLogHooked) {
          w.DGLogHooked = true
          const keep = 120
          const push = (msg: string) => {
            try {
              w.DGLogLines = Array.isArray(w.DGLogLines) ? w.DGLogLines : []
              const ts = new Date().toISOString()
              w.DGLogLines.push(`${ts} - ${msg}`)
              if (w.DGLogLines.length > keep) w.DGLogLines.splice(0, w.DGLogLines.length - keep)
            } catch {}
          }
          const origLog = console.log
          const origWarn = console.warn
          const origErr = console.error
          console.log = function (...args: any[]) {
            try { if (args.join(' ').toLowerCase().includes('purchase')) push('[log] ' + args.join(' ')) } catch {}
            try { return origLog.apply(console, args as any) } catch {}
          } as any
          console.warn = function (...args: any[]) {
            try { if (args.join(' ').toLowerCase().includes('purchase')) push('[warn] ' + args.join(' ')) } catch {}
            try { return origWarn.apply(console, args as any) } catch {}
          } as any
          console.error = function (...args: any[]) {
            try { if (args.join(' ').toLowerCase().includes('purchase')) push('[error] ' + args.join(' ')) } catch {}
            try { return origErr.apply(console, args as any) } catch {}
          } as any
        }
      } catch {}
      try {
        const werr: any = window as any
        if (typeof store.error === 'function' && !werr.DGErrorHooked) {
          werr.DGErrorHooked = true
          store.error((e: any) => {
            try {
              const w: any = window as any
              const raw = e
              const code = (raw && (raw.code ?? raw.billingResponseCode)) ?? null
              const msg = String(raw?.message || raw || '')
              let name = ''
              const cnum = typeof code === 'number' ? code : parseInt(String(code), 10)
              if (!isNaN(cnum)) {
                if (cnum === -2) name = 'FEATURE_NOT_SUPPORTED'
                else if (cnum === 3) name = 'BILLING_UNAVAILABLE'
                else if (cnum === 5) name = 'DEVELOPER_ERROR'
              }
              if (!name) {
                const up = msg.toUpperCase()
                if (up.includes('FEATURE_NOT_SUPPORTED')) name = 'FEATURE_NOT_SUPPORTED'
                else if (up.includes('BILLING_UNAVAILABLE')) name = 'BILLING_UNAVAILABLE'
                else if (up.includes('DEVELOPER_ERROR')) name = 'DEVELOPER_ERROR'
              }
              w.DGStoreError = msg
              w.DGStoreErrorCode = isNaN(cnum) ? String(code ?? '') : cnum
              w.DGStoreErrorName = name
              try {
                if (name === 'BILLING_UNAVAILABLE' || name === 'DEVELOPER_ERROR') w.DGLicenseCheck = `não (${name})`
                else if (name) w.DGLicenseCheck = `desconhecido (${name})`
              } catch {}
              try {
                const push = (line: string) => {
                  w.DGLogLines = Array.isArray(w.DGLogLines) ? w.DGLogLines : []
                  const ts = new Date().toISOString()
                  w.DGLogLines.push(`${ts} - ${line}`)
                  if (w.DGLogLines.length > 120) w.DGLogLines.splice(0, w.DGLogLines.length - 120)
                }
                const payload = (() => { try { return JSON.stringify(raw) } catch { return '' } })()
                push(`store.error code=${String(code)} name=${name || ''} msg=${msg} raw=${payload}`)
              } catch {}
            } catch {}
          })
        }
      } catch {}
      try {
        try {
          const lv = (Cdv?.LogLevel?.INFO ?? Cdv?.LogLevel?.DEBUG ?? Cdv?.LogLevel?.ERROR ?? Cdv?.LogLevel?.QUIET ?? Cdv?.LogLevel?.NONE ?? 0)
          ;(store as any).verbosity = lv
        } catch {}
        try {
          document.addEventListener('deviceready', () => {
            try { (window as any).DGDeviceReadyAt = Date.now() } catch {}
          }, { once: true } as any)
        } catch {}
        const at = (window as any)?.DGDeviceReadyAt || 0
        const delay = at ? Math.max(0, 5000 - (Date.now() - at)) : 5000
        setTimeout(() => {
          try {
            try {
              if (Cdv?.ProductType?.PAID_SUBSCRIPTION && Cdv?.Platform?.GOOGLE_PLAY) {
                store.register({ id: productId, type: Cdv.ProductType.PAID_SUBSCRIPTION, platform: Cdv.Platform.GOOGLE_PLAY })
              } else {
                store.register({ id: productId, type, platform })
              }
              try {
                const w: any = window as any
                w.DGRegisteredIDs = Array.isArray(w.DGRegisteredIDs) ? w.DGRegisteredIDs : []
                if (!w.DGRegisteredIDs.includes(productId)) w.DGRegisteredIDs.push(productId)
                w.DGLogLines = Array.isArray(w.DGLogLines) ? w.DGLogLines : []
                const ts = new Date().toISOString()
                w.DGLogLines.push(`${ts} - delayed.register id=${productId} platform=${Cdv?.Platform?.GOOGLE_PLAY ? 'GOOGLE_PLAY' : (platform || '')}`)
              } catch {}
            } catch {}
            const winit: any = window as any
            if (!winit.DGStoreInitialized) {
              if (Cdv?.Platform?.GOOGLE_PLAY) store.initialize([Cdv.Platform.GOOGLE_PLAY])
              else store.initialize(['android-playstore'])
              winit.DGStoreInitialized = true
              try { (window as any).DGInitAt = Date.now() } catch {}
            }
          } catch {}
        }, delay)
      } catch {}
      // removed automatic update here; will update once in ready()
      try {
        store.when().updated(() => {
          try { (window as any).DGProducts = (store?.products || []).map((p: any) => p?.id).filter(Boolean).join(',') } catch {}
          try {
            const w: any = window as any
            const push = (line: string) => {
              w.DGLogLines = Array.isArray(w.DGLogLines) ? w.DGLogLines : []
              const ts = new Date().toISOString()
              w.DGLogLines.push(`${ts} - ${line}`)
              if (w.DGLogLines.length > 120) w.DGLogLines.splice(0, w.DGLogLines.length - 120)
            }
            push(`when.updated products=${(store?.products || []).length}`)
          } catch {}
        })
        try {
          const wh = (store as any)?.when?.()
          if (wh?.error && typeof wh.error === 'function') {
            wh.error((e: any) => {
              try {
                const w: any = window as any
                const code = e?.code ?? e?.billingResponseCode ?? ''
                const name = e?.name ?? ''
                const msg = String(e?.message || e || '')
                const push = (line: string) => {
                  w.DGLogLines = Array.isArray(w.DGLogLines) ? w.DGLogLines : []
                  const ts = new Date().toISOString()
                  w.DGLogLines.push(`${ts} - ${line}`)
                  if (w.DGLogLines.length > 120) w.DGLogLines.splice(0, w.DGLogLines.length - 120)
                }
                push(`when.error code=${String(code)} name=${name || ''} msg=${msg}`)
              } catch {}
            })
          }
        } catch {}
        store.when().approved((t: any) => {
          try {
            const w: any = window as any
            const push = (line: string) => {
              w.DGLogLines = Array.isArray(w.DGLogLines) ? w.DGLogLines : []
              const ts = new Date().toISOString()
              w.DGLogLines.push(`${ts} - ${line}`)
              if (w.DGLogLines.length > 120) w.DGLogLines.splice(0, w.DGLogLines.length - 120)
            }
            push('when.approved')
          } catch {}
          try { t?.finish?.() } catch {}
        })
        store.when().approved(async (tx: any) => {
          try {
            try { tx?.finish?.() } catch {}
            try {
              const sb = getSupabase()
              const { data: u } = await sb.auth.getUser()
              const id = (u as any)?.user?.id || ''
              if (id) {
                try { await sb.from('profiles').update({ subscription_status: 'premium', is_premium: true } as any).eq('id', id) } catch {}
                try { await sb.auth.updateUser({ data: { subscription_status: 'premium', is_premium: true } as any } as any) } catch {}
              }
            } catch {}
            try { (window as any).DGApproved = true } catch {}
            try { (window as any).DGPremiumPersisted = Date.now() } catch {}
          } catch {}
        })
        store.when().rejected((e: any) => {
          try {
            const w: any = window as any
            w.DGRejected = String(e?.message || e || '')
            const push = (line: string) => {
              w.DGLogLines = Array.isArray(w.DGLogLines) ? w.DGLogLines : []
              const ts = new Date().toISOString()
              w.DGLogLines.push(`${ts} - ${line}`)
              if (w.DGLogLines.length > 120) w.DGLogLines.splice(0, w.DGLogLines.length - 120)
            }
            push(`when.rejected msg=${w.DGRejected}`)
          } catch {}
        })
      } catch {}
      let timeout = setTimeout(() => reject(new Error('Timeout init billing')), 15000)
      try {
        store.ready(() => {
          try { clearTimeout(timeout) } catch {}
          initialized = true
          resolve()
          try { store.update?.() } catch {}
          try { (window as any).DGLicenseCheck = 'provável ok' } catch {}
          try {
            const w: any = window as any
            w.DGStoreIsReady = true
            w.DGReadyAt = Date.now()
          } catch {}
        })
      } catch {}
      const waitReady = () => {
        try {
          const adapters = store?.adapters?.list || []
          const gp = adapters.find((a: any) => (a?.id || a?.platform) === 'android-playstore')
          if (gp && (gp.ready || gp._isReady || gp.initialized)) {
            try { clearTimeout(timeout) } catch {}
            initialized = true
            resolve()
            try { (window as any).DGLicenseCheck = 'provável ok' } catch {}
            return
          }
        } catch {}
        setTimeout(waitReady, 250)
      }
      waitReady()
      // safety settle
      setTimeout(() => { try { clearTimeout(timeout) } catch {}; if (!initialized) { initialized = true; resolve() } }, 3000)
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
      'renovaauto'
    let store: any = null
    try {
      store = await waitForStore()
    } catch {
      // fallthrough to message below
    }
    if (!store) {
      return { ok: false, message: 'Assinaturas só funcionam no app Android instalado pelo Google Play' }
    }
    await ensureInit(pid)
    const waitForProduct = async (): Promise<any | null> => {
      const w = window as any
      const Cdv = w?.CdvPurchase
      const platEnum = Cdv?.Platform?.GOOGLE_PLAY
      const waitAdapter = async () => {
        const start = Date.now()
        while (true) {
          try {
            const adapters = store?.adapters?.list || []
            const gp = adapters.find((a: any) => (a?.id || a?.platform) === 'android-playstore')
            if (gp && (gp.ready || gp._isReady || gp.initialized)) return true
          } catch {}
          if (Date.now() - start > 8000) return false
          await new Promise(r => setTimeout(r, 250))
        }
      }
      await waitAdapter()
      try { store.refresh?.() } catch {}
      try { store.update() } catch {}
      const tryGet = () => {
        try {
          let p = null
          try { p = store.get(pid, platEnum) } catch {}
          if (!p) { try { p = store.get(pid, 'android-playstore') } catch {} }
          if (!p) { try { p = store.get(pid) } catch {} }
          if (!p && Array.isArray(store.products)) {
            p = store.products.find((x: any) => x?.id === pid)
          }
          return p
        } catch { return null }
      }
      let product = tryGet()
      const start = Date.now()
      while (true) {
        if (product && typeof product.getOffer === 'function' && product.getOffer()) return product
        if (Date.now() - start > 30000) return null
        await new Promise(r => setTimeout(r, 300))
        product = tryGet()
      }
    }
    const product = await waitForProduct()
    if (!product) {
      return { ok: false, message: 'Produto indisponível no momento' }
    }
    try {
      if (product?.owned) {
        return { ok: false, message: 'Plano já ativo neste dispositivo' }
      }
    } catch {}
    return await new Promise((resolve) => {
      let settled = false
      const done = (ok: boolean, message?: string) => {
        if (settled) return
        settled = true
        resolve({ ok, message })
      }
      try {
        const w = window as any
        const Cdv = w?.CdvPurchase
        const platform = Cdv?.Platform?.GOOGLE_PLAY
        const approvedCb = async (tx: any) => {
          try {
            const has = Array.isArray(tx?.products) ? !!tx.products.find((p: any) => p?.id === pid) : false
            if (!has) return
            try { tx.finish?.() } catch {}
            try {
              const sb = getSupabase()
              const { data: u } = await sb.auth.getUser()
              const id = (u as any)?.user?.id || ''
              if (id) {
                try { await sb.from('profiles').update({ subscription_status: 'premium', is_premium: true } as any).eq('id', id) } catch {}
                try { await sb.auth.updateUser({ data: { subscription_status: 'premium', is_premium: true } as any } as any) } catch {}
              }
            } catch {}
            try { (window as any).DGApproved = true } catch {}
            done(true)
          } catch { done(true) }
        }
        const errorCb = () => done(false, 'Compra indisponível no momento')
        store.when().approved(approvedCb, 'dg_approved_' + pid)
        store.when().unverified(errorCb, 'dg_unverified_' + pid)
        store.when().finished(() => {})
        const offer = product.getOffer?.()
        if (!offer) return done(false, 'Produto indisponível no momento')
        offer.order()
        setTimeout(() => done(false, 'Tempo esgotado. Tente novamente.'), 60000)
      } catch {
        done(false, 'Compra indisponível no momento')
      }
    })
  } catch (e: any) {
    return { ok: false, message: 'Assinaturas só funcionam no app Android instalado pelo Google Play' }
  }
}

export function getBillingProductId(): string {
  const pid =
    ((typeof process !== 'undefined' && (process as any).env?.NEXT_PUBLIC_BILLING_PRODUCT_ID) as string) ||
    'renovaauto'
  return pid
}

export async function retryBillingInit(): Promise<void> {
  try {
    const pid = getBillingProductId()
    await ensureInit(pid)
  } catch {}
}
