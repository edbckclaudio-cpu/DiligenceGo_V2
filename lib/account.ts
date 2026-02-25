 import { getSupabase } from './supabase'
 
 export async function deleteCurrentUserData(): Promise<{ ok: boolean; message?: string }> {
   try {
     const supabase = getSupabase()
     const { data: userRes, error: userErr } = await supabase.auth.getUser()
     if (userErr) return { ok: false, message: userErr.message }
     const user = userRes?.user
     if (!user?.id) return { ok: false, message: 'Usuário não autenticado' }
 
     const { error: rpcErr } = await supabase.rpc('delete_user_data', { user_id: user.id })
     if (rpcErr) return { ok: false, message: rpcErr.message }
 
     await supabase.auth.signOut()
     return { ok: true }
   } catch (e: any) {
     return { ok: false, message: e?.message || 'Falha ao excluir dados' }
   }
 }
