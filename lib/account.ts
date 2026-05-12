 import { getSupabase } from './supabase'
 
type DeleteAccountResult = {
  ok: boolean
  message?: string
  code?: 'auth_required' | 'rpc_error' | 'unknown'
}

/**
 * Exclui os dados do usuario autenticado por meio de uma RPC no Supabase e encerra a sessao.
 *
 * @returns Resultado simples para a UI (`ok` / `message`).
 */
export async function deleteCurrentUserData(): Promise<DeleteAccountResult> {
   try {
     const supabase = getSupabase()
    const { data: sessionRes } = await supabase.auth.getSession()
    let session = sessionRes?.session ?? null

    // Em alguns cenarios mobile a UI ainda parece autenticada, mas o access token
    // local expirou. Antes de abortar, tentamos renovar a sessao.
    if (!session) {
      const { data: refreshRes } = await supabase.auth.refreshSession()
      session = refreshRes?.session ?? null
    }

    const userId = session?.user?.id
    if (!userId) {
      return {
        ok: false,
        code: 'auth_required',
        message: 'Sua sessão expirou. Faça login novamente para excluir a conta.'
      }
    }
 
    const { error: rpcErr } = await supabase.rpc('delete_user_data', { user_id: userId })
    if (rpcErr) {
      const msg = String(rpcErr.message || '')
      if (msg.toLowerCase().includes('auth session missing')) {
        return {
          ok: false,
          code: 'auth_required',
          message: 'Sua sessão expirou. Faça login novamente para excluir a conta.'
        }
      }
      return { ok: false, code: 'rpc_error', message: rpcErr.message }
    }
 
     await supabase.auth.signOut()
     return { ok: true }
   } catch (e: any) {
    const msg = String(e?.message || 'Falha ao excluir dados')
    if (msg.toLowerCase().includes('auth session missing')) {
      return {
        ok: false,
        code: 'auth_required',
        message: 'Sua sessão expirou. Faça login novamente para excluir a conta.'
      }
    }
    return { ok: false, code: 'unknown', message: msg }
   }
 }
