import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ekiwzydvpkgzgrjneaet.supabase.co'
const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVraXd6eWR2cGtnemdyam5lYWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMzMyODQsImV4cCI6MjA4NzYwOTI4NH0.SotQ4BMLuvvIF_SBVu7hHAQvrycJ9Uj8A5PlRFapABY'

let client: SupabaseClient | null = null

/**
 * Retorna a instancia singleton do cliente Supabase usada pelo app.
 *
 * @returns Cliente Supabase compartilhado por autenticacao e acesso a dados.
 */
export function getSupabase() {
  const url = SUPABASE_URL
  const anon = SUPABASE_ANON
  if (!url || !anon) throw new Error('Supabase não configurado')
  if (!client) {
    client = createClient(url, anon)
  }
  return client
}

export default getSupabase
