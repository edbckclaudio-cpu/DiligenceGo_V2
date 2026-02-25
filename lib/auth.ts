import { Capacitor } from '@capacitor/core'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import { getSupabase } from './supabase'
 
export async function loginWithGoogle(): Promise<{ ok: boolean; message?: string }> {
   try {
     const native = (Capacitor as any).isNativePlatform?.() ?? (Capacitor.getPlatform() !== 'web')
     if (native) {
      const supabase = getSupabase()
      const result = await GoogleAuth.signIn()
      const idToken = (result as any)?.idToken || (result as any)?.authentication?.idToken
      if (!idToken) return { ok: false, message: 'ID Token não retornado pelo Google' }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken
      })
      if (error) return { ok: false, message: error.message }
      return { ok: true }
     } else {
      const supabase = getSupabase()
      const result = await GoogleAuth.signIn()
      const idToken = (result as any)?.idToken || (result as any)?.authentication?.idToken
      if (!idToken) return { ok: false, message: 'ID Token não retornado pelo Google' }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken
      })
       if (error) return { ok: false, message: error.message }
       return { ok: true }
     }
   } catch (e: any) {
     return { ok: false, message: e?.message || 'Falha no login com Google' }
   }
 }
