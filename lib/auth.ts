import { Capacitor } from '@capacitor/core'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import { getSupabase } from './supabase'

let webInitialized = false

/**
 * Executa login com Google e cria/recupera a sessao no Supabase.
 *
 * Estrategia:
 * - Web: usa `GoogleAuth.initialize()` + `signIn()` e troca o `idToken` por sessao no Supabase.
 * - Android nativo: tenta `GoogleAuth.signIn()`; em falha, cai para OAuth do Supabase com deep link.
 *
 * @returns Objeto com status do login:
 * - `ok: true` em sucesso
 * - `deferred: true` quando o fluxo nativo continua fora do app e depende do retorno por deep link
 * - `message` em falhas conhecidas
 */
export async function loginWithGoogle(): Promise<{ ok: boolean; message?: string; deferred?: boolean }> {
  function toMsg(err: any): string {
    const code = err?.code ?? err?.status ?? err?.statusCode
    const msg = err?.message || String(err || '')
    return code ? `Erro ${code}: ${msg}` : msg
  }
  function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`Timeout após ${ms}ms`)), ms)
      p.then(v => { clearTimeout(t); resolve(v) }).catch(e => { clearTimeout(t); reject(e) })
    })
  }
  try {
    const native = (Capacitor as any).isNativePlatform?.() ?? (Capacitor.getPlatform() !== 'web')
    const supabase = getSupabase()
    let result: any
    try {
      if (!native && !webInitialized) {
        const clientId =
          (typeof process !== 'undefined' && (process as any).env?.NEXT_PUBLIC_GOOGLE_CLIENT_ID) ||
          '1027488415010-flsh69tg5qfq9vk98tj6e2c6h2lrul80.apps.googleusercontent.com'
        await GoogleAuth.initialize({
          clientId,
          scopes: ['profile', 'email'],
          autoLoad: false
        } as any)
        webInitialized = true
      }
      if (native) {
        result = await withTimeout(GoogleAuth.signIn(), 8000)
      } else {
        result = await withTimeout(GoogleAuth.signIn(), 15000)
      }
    } catch (e: any) {
      if (native) {
        try {
          await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: 'com.diligencego.app://auth-callback',
              queryParams: { prompt: 'select_account' }
            }
          })
          return { ok: true, deferred: true }
        } catch (e2: any) {
          return { ok: false, message: toMsg(e2) }
        }
      }
      return { ok: false, message: toMsg(e) }
    }
    const idToken = result?.idToken || result?.authentication?.idToken
    if (!idToken) return { ok: false, message: 'ID Token não retornado pelo Google' }
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken
    })
    if (error) return { ok: false, message: error.message }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Falha no login com Google' }
  }
}
