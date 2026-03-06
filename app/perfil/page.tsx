'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { getSupabase } from '../../lib/supabase'
import { Crown } from 'lucide-react'
import { Loader2 } from 'lucide-react'
import { purchasePremium, getBillingProductId, retryBillingInit } from '../../lib/billing'
// @ts-ignore: optional at runtime
import { App } from '@capacitor/app'

type UserInfo = { id: string; email?: string | null; full_name?: string | null; avatar_url?: string | null }

export default function PerfilPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [syncing, setSyncing] = useState<boolean>(true)
  const [plan, setPlan] = useState<string>('')
  const [processing, setProcessing] = useState<boolean>(false)
  const [savedOnce, setSavedOnce] = useState<boolean>(false)
  const [secretCount, setSecretCount] = useState(0)
  const [secretOpen, setSecretOpen] = useState(false)
  const secretTimerRef = useRef<any>(null)
  const [secretDiag, setSecretDiag] = useState<{ adapters?: string; ready?: string; storeError?: string } | null>(null)
  const [diag, setDiag] = useState<{ dev: boolean; cap: boolean; platform: string; store: boolean; reg: boolean; cdv: boolean; cdvStore: boolean; init: boolean; pid: string; prod: boolean; offer: boolean; ready: boolean; adapters: string; registered: string; registeredIDs?: string; products: string; appVersion?: string; appBuild?: string; storeVersion?: string; storeError?: string; storeErrorCode?: string; storeErrorName?: string; dgProducts?: string; dgApproved?: string; dgRejected?: string; retryLast?: string; retryCount?: string; adapterState?: string; adapterStateNum?: string; licenseCheck?: string; adapterDump?: string }>({
    dev: false,
    cap: false,
    platform: '',
    store: false,
    reg: false,
    cdv: false,
    cdvStore: false,
    init: false,
    pid: '',
    prod: false,
    offer: false,
    ready: false,
    adapters: '',
    registered: '',
    products: '',
    appVersion: undefined,
    appBuild: undefined,
    storeError: undefined,
    storeErrorCode: undefined,
    storeErrorName: undefined,
    dgProducts: undefined,
    dgApproved: undefined,
    dgRejected: undefined,
    retryLast: undefined,
    retryCount: undefined,
    adapterState: undefined,
    licenseCheck: undefined,
    adapterDump: undefined
  })
  const [logs, setLogs] = useState<string[]>([])
  const [logLevel, setLogLevel] = useState<'ALL' | 'DEBUG' | 'WARN' | 'ERROR'>('ALL')
  const filteredLogs = (() => {
    try {
      return logs.filter((ln) => {
        if (logLevel === 'ALL') return true
        if (logLevel === 'ERROR') return ln.includes('[error]')
        if (logLevel === 'WARN') return ln.includes('[warn]')
        if (logLevel === 'DEBUG') return ln.includes('[log]') || ln.includes('when.') || ln.includes('store.')
        return true
      })
    } catch {
      return logs
    }
  })()

  useEffect(() => {
    ;(async () => {
      try {
        const supabase = getSupabase()
        const { data, error } = await supabase.auth.getUser()
        if (error) {
          setSyncing(false)
        } else {
          const md = data.user?.user_metadata || {}
          setUser({
            id: data.user?.id || '',
            email: data.user?.email,
            full_name: md.full_name || md.name || null,
            avatar_url: md.avatar_url || null
          })
          try {
            setSyncing(true)
            const { data: rows, error: selErr } = await supabase
              .from('profiles')
              .select('id, subscription_status')
              .eq('id', data.user?.id || '')
              .limit(1)
            if (!selErr && (!rows || rows.length === 0)) {
              await supabase.from('profiles').insert({ id: data.user?.id || '', subscription_status: 'free' })
              setPlan('free')
            } else if (rows && rows[0]) {
              setPlan(String(rows[0].subscription_status || ''))
            }
            if (!plan && md.subscription_status) setPlan(String(md.subscription_status))
          } catch (_) {
          } finally {
            setSyncing(false)
          }
        }
      } catch (e: any) {
        setSyncing(false)
      }
    })()
  }, [])

  function openSecretPanel() {
    try {
      const w: any = typeof window !== 'undefined' ? window : {}
      const st = w?.CdvPurchase?.store || w?.store || null
      let adapters = ''
      try {
        const arr = st?.adapters?.list || []
        adapters = arr.map((a: any) => {
          const plat = a?.platform || a?.id || '?'
          const r = a?.ready || a?._isReady || a?.initialized
          let err = a?.error?.message || a?.error || ''
          const code = a?.error?.code ?? a?.error?.billingResponseCode
          const codeStr = (code !== undefined && code !== null && code !== '') ? `Erro ${String(code)}` : ''
          const suffix = [codeStr, err ? String(err) : ''].filter(Boolean).join(' ')
          return `${plat}:${r ? 'ok' : 'não'}${suffix ? `(${suffix})` : ''}`
        }).join(', ')
      } catch {}
      let ready = ''
      try { ready = st?.isReady ? 'ok' : 'não' } catch {}
      let storeError = ''
      try { storeError = String((w as any)?.DGStoreError || '') } catch {}
      setSecretDiag({ adapters, ready, storeError })
    } catch { setSecretDiag(null) }
    setSecretOpen(true)
  }
  function onTitleTap() {
    try { if (secretTimerRef.current) clearTimeout(secretTimerRef.current) } catch {}
    setSecretCount(c => {
      const next = c + 1
      if (next >= 5) {
        openSecretPanel()
        return 0
      }
      secretTimerRef.current = setTimeout(() => setSecretCount(0), 800)
      return next
    })
  }
  useEffect(() => {
    const update = async () => {
      try {
        const w: any = typeof window !== 'undefined' ? window : {}
        const cap = !!w?.Capacitor?.isNativePlatform?.()
        const platform = w?.Capacitor?.getPlatform?.() || ''
        const st = w?.CdvPurchase?.store || w?.store || null
        const pid = getBillingProductId()
        const platformConst = w?.CdvPurchase?.Platform?.GOOGLE_PLAY
        const prod = st?.get?.(pid, platformConst)
        const offer = prod?.getOffer?.()
        try {
          if (((w as any)?.DGApproved || false) && !savedOnce && plan !== 'premium') {
            const supabase = getSupabase()
            try { await supabase.from('profiles').update({ subscription_status: 'premium', is_premium: true } as any).eq('id', user?.id || '') } catch {}
            try { await supabase.auth.updateUser({ data: { subscription_status: 'premium', is_premium: true } as any } as any) } catch {}
            setPlan('premium')
            setSavedOnce(true)
          }
        } catch {}
        let adapters = ''
            try {
          const arr = st?.adapters?.list || []
          adapters = arr.map((a: any) => {
            const plat = a?.platform || a?.id || '?'
            const r = a?.ready || a?._isReady || a?.initialized
                let err = a?.error?.message || a?.error || ''
                let code = a?.error?.code ?? a?.error?.billingResponseCode
                let codeStr = ''
                if (code !== undefined && code !== null && code !== '') codeStr = `Erro ${String(code)}`
                const suffix = [codeStr, err ? String(err) : ''].filter(Boolean).join(' ')
                return `${plat}:${r ? 'ok' : 'não'}${suffix ? `(${suffix})` : ''}`
          }).join(', ')
        } catch {}
        let registered = ''
        try {
          const regs = st?.registeredProducts?.byPlatform?.() || []
          registered = regs.map((r: any) => {
            const plat = r?.platform || '?'
            const ids = (r?.products || []).map((p: any) => p?.id).filter(Boolean).join('|')
            return `${plat}:${ids}`
          }).join('; ')
        } catch {}
        let adapterState = ''
        let adapterStateNum = ''
        try {
          const a = st?.getAdapter?.('android-playstore') || null
          const s = (a && (a.state ?? a._state)) ?? ''
          const map: any = { 0: 'UNINITIALIZED', 1: 'INITIALIZING', 2: 'READY', 3: 'FAILED' }
          adapterState = typeof s === 'number' ? `${map[s] || 'UNKNOWN'}(${s})` : String(s || '')
          adapterStateNum = typeof s === 'number' ? String(s) : ''
        } catch {}
        let products = ''
        try {
          const prods = st?.products || []
          products = prods.map((p: any) => `${p?.id || '?'}@${p?.platform || ''}`).join(', ')
        } catch {}
        let storeVersion = ''
        try {
          storeVersion = String((st as any)?.version || (st as any)?.VERSION || (w?.CdvPurchase && (w?.CdvPurchase as any)?.version) || '')
        } catch {}
        let adapterDump = ''
        try {
          const arr = st?.adapters?.list || []
          const simp = arr.map((a: any) => ({
            id: a?.id ?? null,
            platform: a?.platform ?? null,
            state: a?.state ?? a?._state ?? null,
            ready: !!(a?.ready || a?._isReady || a?.initialized),
            error: a?.error ? { code: a?.error?.code ?? a?.error?.billingResponseCode ?? null, message: String(a?.error?.message || a?.error || '') } : null
          }))
          adapterDump = JSON.stringify(simp)
        } catch {}
        let storeError = ''
        try {
          const err = (w as any)?.DGStoreError
          storeError = err ? String(err?.message || err) : ''
        } catch {}
        let registeredIDs = ''
        try {
          const arr = (w as any)?.DGRegisteredIDs || []
          if (Array.isArray(arr)) registeredIDs = arr.join(',')
        } catch {}
        let dgProducts = ''
        try { dgProducts = String((w as any)?.DGProducts || '') } catch {}
        let dgApproved = ''
        try { dgApproved = (w as any)?.DGApproved ? 'true' : '' } catch {}
        let dgRejected = ''
        try { dgRejected = String((w as any)?.DGRejected || '') } catch {}
        let storeErrorCode = ''
        try { storeErrorCode = String((w as any)?.DGStoreErrorCode || '') } catch {}
        let storeErrorName = ''
        try { storeErrorName = String((w as any)?.DGStoreErrorName || '') } catch {}
        let licenseCheck = ''
        try { licenseCheck = String((w as any)?.DGLicenseCheck || '') } catch {}
        const prevKey = `${diag.storeErrorCode || ''}|${diag.storeErrorName || ''}|${diag.storeError || ''}`
        const nextKey = `${storeErrorCode || ''}|${storeErrorName || ''}|${storeError || ''}`
        if (nextKey && nextKey !== prevKey) {
          const ts = new Date().toISOString()
          const line = `${ts} - ${storeErrorCode ? `Erro ${storeErrorCode}${storeErrorName ? `: ${storeErrorName}` : ''}` : ''}${storeError ? ` - ${storeError}` : ''}`.trim()
          setLogs((l) => [line, ...l].slice(0, 20))
        }
        let retryLast = ''
        let retryCount = ''
        try {
          const rl = (w as any)?.DGRetryLast
          retryLast = rl ? new Date(rl).toISOString() : ''
          retryCount = String((w as any)?.DGRetryCount || '')
        } catch {}
        setDiag((d) => ({
          ...d,
          cap,
          platform: String(platform || ''),
          store: !!st,
          reg: !!st?.register,
          cdv: !!w?.CdvPurchase,
          cdvStore: !!w?.CdvPurchase?.store,
          init: !!st?.initialize,
          pid: String(pid || ''),
          prod: !!prod,
          offer: !!offer,
          ready: !!st?.isReady,
          adapters,
          registered,
          adapterState,
          adapterStateNum,
          adapterDump,
          products,
          storeVersion,
          storeError,
          storeErrorCode,
          storeErrorName,
          registeredIDs,
          licenseCheck,
          dgProducts,
          dgApproved,
          dgRejected,
          retryLast,
          retryCount
        }))
        try {
          const winLogs = Array.isArray(w?.DGLogLines) ? w.DGLogLines.slice(-50) : []
          if (winLogs && winLogs.length) setLogs(winLogs.slice().reverse())
        } catch {}
      } catch {}
    }
    const onDev = () => setDiag((d) => ({ ...d, dev: true }))
    try {
      document.addEventListener('deviceready', () => {
        try { (window as any).DGDeviceReadyAt = Date.now() } catch {}
        onDev()
      }, { once: true } as any)
    } catch {}
    ;(async () => {
      try {
        const info = await (App as any)?.getInfo?.()
        if (info) {
          setDiag(d => ({ ...d, appVersion: String(info.version || ''), appBuild: String(info.build || '') }))
        }
      } catch {}
    })()
    const id = setInterval(update, 500)
    const retry = setInterval(() => {
      try {
        const w: any = typeof window !== 'undefined' ? window : {}
        if (w?.Capacitor?.isNativePlatform?.() && w?.Capacitor?.getPlatform?.() === 'android') {
          retryBillingInit()
        }
      } catch {}
    }, 10000)
    update()
    return () => {
      try {
        clearInterval(id)
        clearInterval(retry)
        document.removeEventListener('deviceready', onDev as any)
      } catch {}
    }
  }, [])

  async function buyPremium() {
    try {
      if (!user?.id) return
      setLoading(true)
      const res = await purchasePremium()
      if (!res.ok) {
        try {
          if (res.message) alert(res.message)
          else alert('Compra indisponível. Use o app instalado via Google Play.')
        } catch {}
        return
      }
      setProcessing(true)
      const supabase = getSupabase()
      let saved = false
      try {
        const { data: rows } = await supabase.from('profiles').select('id').eq('id', user.id).limit(1)
        if (!rows || rows.length === 0) {
          const { error: insErr } = await supabase.from('profiles').insert({ id: user.id, subscription_status: 'premium' })
          saved = !insErr
        } else {
          const { error: upErr } = await supabase.from('profiles').update({ subscription_status: 'premium' }).eq('id', user.id)
          saved = !upErr
        }
      } catch {}
      if (!saved) {
        try {
          await supabase.auth.updateUser({ data: { subscription_status: 'premium' } as any } as any)
        } catch {}
      }
      setPlan('premium')
      setTimeout(() => {
        try {
          const r = window.location?.origin || '/'
          window.location.href = r + '/'
        } catch {
          router.push('/')
        }
      }, 300)
    } finally {
      setLoading(false)
      setProcessing(false)
    }
  }

  async function signOut() {
    try {
      const supabase = getSupabase()
      await supabase.auth.signOut()
      router.push('/')
    } catch (e: any) {
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6 space-y-4">
      <Card className="rounded-[28px] overflow-hidden border border-neutral-800 bg-slate-950 shadow-2xl">
        <div className="h-28 w-full bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600" />
        <CardContent className="-mt-10">
          <div className="text-base font-semibold text-slate-200 mb-1" onClick={onTitleTap} onTouchStart={onTitleTap}>Perfil</div>
          {syncing ? (
            <div className="flex items-center gap-2 text-slate-300 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Sincronizando…
            </div>
          ) : !user ? (
            <div className="text-sm text-slate-300">Carregando…</div>
          ) : (
            <div className="space-y-1">
              <div className="text-lg font-semibold text-white tracking-tight">{user.full_name || 'Usuário'}</div>
              <div className="text-xs text-slate-300">{user.email || '—'}</div>
            </div>
          )}
          <div className="mt-4 rounded-2xl bg-slate-900/60 border border-neutral-800 p-4">
            <div className="text-[11px] text-slate-500 break-all">ID: {user?.id || '—'}</div>
          </div>
          {/* removed diagnostic and log UI for production */}
          {processing ? (
            <div className="mt-4 rounded-xl bg-yellow-500/10 border border-yellow-600 p-3 text-yellow-400 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processando sua compra…
              </div>
              <Button variant="outline" className="rounded-xl" disabled>
                Aguarde
              </Button>
            </div>
          ) : (plan === 'premium' || diag.dgApproved === 'true') ? (
            <div className="mt-4 rounded-xl bg-emerald-500/10 border border-emerald-600 p-3 text-emerald-400 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="h-4 w-4" />
                Premium Ativo
              </div>
              <Button variant="outline" className="rounded-xl" onClick={() => router.push('/')}>
                Voltar
              </Button>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black font-semibold shadow-lg shadow-emerald-500/20"
                onClick={buyPremium}
                disabled={loading || syncing || !user || processing || (typeof window !== 'undefined' && ((window as any)?.store?.get?.(getBillingProductId())?.owned || (window as any)?.CdvPurchase?.store?.get?.(getBillingProductId())?.owned) || (diag.dgApproved === 'true'))}
              >
                <Crown className="h-4 w-4 mr-2" />
                Assinar Premium
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="w-full rounded-xl" onClick={() => router.push('/')} disabled={processing}>
                  Voltar
                </Button>
                <Button variant="outline" className="w-full rounded-xl" onClick={signOut} disabled={processing}>
                  Sair
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {secretOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-end" onClick={() => setSecretOpen(false)}>
          <div className="w-full rounded-t-[32px] bg-slate-900 border border-neutral-800 p-4 space-y-3 pb-safe" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <div className="text-base font-semibold text-slate-50">Diagnóstico Secreto</div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => retryBillingInit()}>Re-Init</Button>
                <Button variant="outline" onClick={() => setSecretOpen(false)}>Fechar</Button>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 break-all">adapters: {secretDiag?.adapters || '—'}</div>
            <div className="text-[11px] text-slate-400">store.isReady: {secretDiag?.ready || '—'}</div>
            <div className="text-[11px] text-slate-400 break-all">store.error: {secretDiag?.storeError || '—'}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="text-[11px] text-slate-400">adapter.state.num: {diag.adapterStateNum || '—'}</div>
              <div className="text-[11px] text-slate-400">adapter.state: {diag.adapterState || '—'}</div>
            </div>
            <div className="text-[11px] text-slate-400">store.version: {diag.storeVersion || '—'}</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="text-[11px] text-slate-400">store.error.code: {diag.storeErrorCode || '—'}</div>
              <div className="text-[11px] text-slate-400">store.error.name: {diag.storeErrorName || '—'}</div>
              <div className="text-[11px] text-slate-400 break-all">store.error.msg: {diag.storeError || '—'}</div>
            </div>
            <div className="text-[11px] text-slate-400 break-all">registered: {diag.registered || '—'}</div>
            <div className="text-[11px] text-slate-400 break-all">registered.ids: {diag.registeredIDs || '—'}</div>
            <div className="mt-2 rounded-xl bg-slate-900/60 border border-neutral-800 p-3 max-h-40 overflow-auto">
              <div className="text-[11px] text-slate-500 mb-1 flex items-center gap-2">
                <div className="mr-2">logs:</div>
                <Button variant="outline" className="h-6 px-2 text-[10px]" onClick={() => setLogLevel('ALL')}>All</Button>
                <Button variant="outline" className="h-6 px-2 text-[10px]" onClick={() => setLogLevel('DEBUG')}>Debug</Button>
                <Button variant="outline" className="h-6 px-2 text-[10px]" onClick={() => setLogLevel('WARN')}>Warn</Button>
                <Button variant="outline" className="h-6 px-2 text-[10px]" onClick={() => setLogLevel('ERROR')}>Error</Button>
                <div className="flex-1" />
                <Button variant="outline" className="h-6 px-2 text-[10px]" onClick={() => {
                  try {
                    const txt = filteredLogs.join('\n')
                    if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(txt)
                    else {
                      const ta = document.createElement('textarea')
                      ta.value = txt
                      document.body.appendChild(ta)
                      ta.select()
                      document.execCommand('copy')
                      document.body.removeChild(ta)
                    }
                  } catch {}
                }}>Copiar</Button>
              </div>
              <div className="space-y-1">
                {filteredLogs.map((ln, i) => (
                  <div key={i} className="text-[10px] text-slate-400 break-all">{ln}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
