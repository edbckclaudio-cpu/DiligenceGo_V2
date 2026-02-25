import { createClient } from '@supabase/supabase-js'
 
 function getEnv(name: string, fallback = ''): string {
   if (typeof process !== 'undefined') {
     const v = (process.env as any)?.[name]
     if (v) return String(v)
   }
   try {
     const v = localStorage.getItem(name) || ''
     if (v) return v
   } catch {}
   return fallback
 }
 
 export function getSupabase() {
   const url = getEnv('NEXT_PUBLIC_SUPABASE_URL')
   const anon = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
   if (!url || !anon) throw new Error('Supabase não configurado')
   return createClient(url, anon)
 }
 
 export default getSupabase
