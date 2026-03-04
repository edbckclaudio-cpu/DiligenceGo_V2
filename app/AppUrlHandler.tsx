'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
// @ts-ignore installed at runtime
import { App } from '@capacitor/app'
import { getSupabase } from '../lib/supabase'

export default function AppUrlHandler() {
  const router = useRouter()
  useEffect(() => {
    let handle: any
    const supabase = getSupabase()
    const authSub = supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.user) router.push('/perfil')
    })
    // Detecta retorno por deep link (qualquer host/caminho)
    App.addListener('appUrlOpen', async (ev: any) => {
      const url: string | undefined = ev?.url
      try {
        if (!url) return
        if (url.startsWith('com.diligencego.app://')) {
          const supabase = getSupabase()
          const u = new URL(url)
          const hash = (u.hash || '').replace(/^#/, '')
          const hp = new URLSearchParams(hash)
          const qp = u.searchParams
          const getParam = (k: string) => qp.get(k) || hp.get(k)
          const code = getParam('code')
          const access_token = getParam('access_token')
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code)
            if (!error) router.push('/perfil')
          } else if (access_token) {
            const refresh_token = getParam('refresh_token') || ''
            const { error } = await supabase.auth.setSession({ access_token, refresh_token })
            if (!error) router.push('/perfil')
          }
        }
      } catch (e: any) {
        /* swallow */
      }
    }).then(h => { handle = h }).catch(() => {})
    // Se o app voltar a ficar ativo, revalida sessão
    let resumeHandle: any
    App.addListener('appStateChange', async (state: any) => {
      try {
        if (state?.isActive) {
          const { data } = await supabase.auth.getSession()
          if (data?.session?.user) router.push('/perfil')
        }
      } catch {}
    }).then(h => { resumeHandle = h }).catch(() => {})
    return () => {
      try { handle?.remove?.() } catch {}
      try { resumeHandle?.remove?.() } catch {}
      try { (authSub as any)?.data?.subscription?.unsubscribe?.() } catch {}
    }
  }, [router])
  return null
}
