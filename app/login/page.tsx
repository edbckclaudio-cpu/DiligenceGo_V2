'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { loginWithGoogle } from '../../lib/auth'
// @ts-ignore: installed at runtime for native deep link handling
import { App } from '@capacitor/app'
import { getSupabase } from '../../lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [status, setStatus] = useState<string>('')
  const [logged, setLogged] = useState(false)
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  useEffect(() => {
    try {
      if (SUPABASE_URL) localStorage.setItem('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL)
      if (SUPABASE_ANON) localStorage.setItem('NEXT_PUBLIC_SUPABASE_ANON_KEY', SUPABASE_ANON)
    } catch {}
  }, [SUPABASE_URL, SUPABASE_ANON])

  useEffect(() => {
    let handle: any
    const supabase = getSupabase()
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user) {
        setLogged(true)
      }
    }).catch(() => {})
    const authSub = supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.user) {
        setStatus('Login realizado')
        setLogged(true)
        router.push('/perfil')
      }
    })
    App.addListener('appUrlOpen', async (ev: any) => {
      const url: string | undefined = ev?.url
      try {
        if (!url) return
        if (url.startsWith('com.diligencego.app://')) {
          const supabase = getSupabase()
          const u = new URL(url)
          const code = u.searchParams.get('code')
          const access_token = u.searchParams.get('access_token')
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code)
            if (error) setStatus('Falha: ' + (error.message || 'callback'))
            else {
              setStatus('Login realizado')
              setLogged(true)
              router.push('/perfil')
            }
          } else if (access_token) {
            const refresh_token = u.searchParams.get('refresh_token') || ''
            const { error } = await supabase.auth.setSession({ access_token, refresh_token })
            if (error) setStatus('Falha: ' + (error.message || 'callback'))
            else {
              setStatus('Login realizado')
              setLogged(true)
              router.push('/perfil')
            }
          }
        }
      } catch (e: any) {
        setStatus('Falha: ' + (e?.message || 'callback'))
      }
    }).then(h => { handle = h }).catch(() => {})
    let resumeHandle: any
    App.addListener('appStateChange', async (state: any) => {
      try {
        if (state?.isActive) {
          const { data } = await supabase.auth.getSession()
          if (data?.session?.user) {
            setStatus('Login realizado')
            setLogged(true)
            router.push('/perfil')
          }
        }
      } catch {}
    }).then(h => { resumeHandle = h }).catch(() => {})
    return () => { try { handle?.remove?.() } catch {} ; try { resumeHandle?.remove?.() } catch {} ; try { (authSub as any)?.data?.subscription?.unsubscribe?.() } catch {} }
  }, [router])

  async function doLogin() {
    setStatus('Entrando com Google…')
    try {
      const res = await loginWithGoogle()
      if (res?.deferred) {
        setStatus('Abrindo Google… conclua o login e aguarde o retorno ao app')
        try {
          const supabase = getSupabase()
          for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 1000))
            const { data } = await supabase.auth.getSession()
            if (data?.session?.user) {
              setStatus('Login realizado')
              setLogged(true)
              router.push('/perfil')
              return
            }
          }
          setStatus('Ainda aguardando retorno do Google…')
        } catch {}
        return
      }
      if (!res.ok) {
        const msg = res.message || 'Falha no login'
        alert(msg)
        setStatus('Falha: ' + msg)
        return
      }
      setStatus('Login realizado')
      setLogged(true)
    } catch (e: any) {
      const msg = e?.message || String(e || 'Falha desconhecida')
      alert(msg)
      setStatus('Falha: ' + msg)
    }
  }

  function activateFreemium() {
    try {
      localStorage.setItem('DG_PREMIUM', 'freemium')
    } catch {}
    setStatus('Plano Freemium ativado')
    router.push('/')
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6 space-y-4">
      <Card className="rounded-[32px] bg-slate-900 border-none shadow-2xl">
        <CardHeader>Entrar com Google</CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-slate-300">Use sua conta Google para entrar no DiligenceGo.</div>
          <Button className="bg-[#4169E1] hover:bg-blue-700 text-white rounded-xl" onClick={doLogin}>
            Login com Google
          </Button>
          {status ? <div className="text-xs text-slate-400">{status}</div> : null}
        </CardContent>
      </Card>
      <Card className="rounded-[32px] bg-slate-900 border-none shadow-2xl">
        <CardHeader>Assinatura</CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-slate-300">Após entrar, ative o plano Freemium.</div>
          <Button variant="outline" className="rounded-xl" onClick={activateFreemium} disabled={!logged}>
            Assinar plano Freemium
          </Button>
        </CardContent>
      </Card>
      <div className="flex">
        <Button variant="outline" className="rounded-full" onClick={() => router.push('/')}>
          Voltar
        </Button>
      </div>
    </div>
  )
}
