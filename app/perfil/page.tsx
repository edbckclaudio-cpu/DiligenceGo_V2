'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { getSupabase } from '../../lib/supabase'
import { Crown } from 'lucide-react'
import { Loader2 } from 'lucide-react'
import { purchasePremium } from '../../lib/billing'

type UserInfo = { id: string; email?: string | null; full_name?: string | null; avatar_url?: string | null }

export default function PerfilPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [syncing, setSyncing] = useState<boolean>(true)
  const [diag, setDiag] = useState<{ dev: boolean; cap: boolean; platform: string; store: boolean; reg: boolean }>({
    dev: false,
    cap: false,
    platform: '',
    store: false,
    reg: false
  })

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
            }
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

  useEffect(() => {
    const update = () => {
      try {
        const w: any = typeof window !== 'undefined' ? window : {}
        const cap = !!w?.Capacitor?.isNativePlatform?.()
        const platform = w?.Capacitor?.getPlatform?.() || ''
        const st = w?.store || null
        setDiag((d) => ({
          ...d,
          cap,
          platform: String(platform || ''),
          store: !!st,
          reg: !!st?.register
        }))
      } catch {}
    }
    const onDev = () => setDiag((d) => ({ ...d, dev: true }))
    try {
      document.addEventListener('deviceready', onDev, { once: true } as any)
    } catch {}
    const id = setInterval(update, 500)
    update()
    return () => {
      try {
        clearInterval(id)
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
          <div className="mt-2 rounded-xl bg-slate-900/60 border border-neutral-800 p-3">
            <div className="text-[10px] text-slate-400">deviceready: {diag.dev ? 'ok' : 'aguardando'}</div>
            <div className="text-[10px] text-slate-400">capacitor: {diag.cap ? 'ok' : 'não'}</div>
            <div className="text-[10px] text-slate-400">platform: {diag.platform || '—'}</div>
            <div className="text-[10px] text-slate-400">store: {diag.store ? 'ok' : 'não'}</div>
            <div className="text-[10px] text-slate-400">register: {diag.reg ? 'ok' : 'não'}</div>
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black font-semibold shadow-lg shadow-emerald-500/20"
              onClick={buyPremium}
              disabled={loading || syncing || !user}
            >
              <Crown className="h-4 w-4 mr-2" />
              Assinar Premium
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="w-full rounded-xl" onClick={() => router.push('/')}>
                Voltar
              </Button>
              <Button variant="outline" className="w-full rounded-xl" onClick={signOut}>
                Sair
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
