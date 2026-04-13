import { fetchZip, forEachCsvBlob, headZip } from './downloader'
import { parseAndFilterByCNPJ } from './csv'
import { saveResult, loadResult, clearOld, deleteResult } from './cache'

export type ConsultDiag = {
  bytes?: number
  csvCount?: number
  rowsCount?: number
  lastError?: string
  startedAt?: number
  endedAt?: number
  usedCache?: boolean
  cacheEmpty?: boolean
  headStatus?: number
  headLen?: number
  source?: string
  capitalSocialRows?: number
  participacaoSociedadeRows?: number
}

type ProgressCB = (p: { percent?: number; loaded?: number }) => void
type StatusCB = (s: string) => void

/**
 * Executa a consulta principal do app para um CNPJ/ano.
 *
 * Pipeline:
 * 1. Limpa cache antigo
 * 2. Tenta servir do cache local
 * 3. Faz HEAD e download do ZIP FRE da CVM
 * 4. Percorre CSVs e filtra pelo CNPJ
 * 5. Persiste o resultado no cache
 *
 * @param cnpj CNPJ normalizado com 14 digitos.
 * @param year Ano-base da consulta.
 * @param opts Callbacks opcionais para progresso e status da UI.
 * @returns Resultado bruto (`items`), agrupado por arquivo (`grouped`) e diagnosticos (`diag`).
 */
export async function runConsultation(cnpj: string, year: number, opts?: { onProgress?: ProgressCB; onStatus?: StatusCB }) {
  const diag: ConsultDiag = { startedAt: Date.now(), bytes: 0, csvCount: 0, rowsCount: 0 }
  const key = `${cnpj}:${year}`
  await clearOld(7)
  const cached = await loadResult(key)
  if (cached && Array.isArray(cached.data) && cached.data.length > 0 && Array.isArray(cached.grouped) && cached.grouped.length > 0) {
    diag.usedCache = true
    diag.endedAt = Date.now()
    return { items: cached.data, grouped: cached.grouped, diag }
  } else if (cached && (!cached.grouped || cached.grouped.length === 0)) {
    try { await deleteResult(key) } catch {}
    diag.cacheEmpty = true
  }
  if (!cnpj || cnpj.length !== 14) throw new Error('CNPJ inválido')
  const freUrl = `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/FRE/DADOS/fre_cia_aberta_${year}.zip`.trim()
  try {
    try {
      const h = await headZip(freUrl)
      diag.headStatus = h.status
      diag.headLen = h.length
    } catch {}
    if (opts?.onStatus) opts.onStatus('Baixando ZIP...')
    const r = await fetchZip(freUrl, p => {
      if (opts?.onProgress) opts.onProgress({ percent: p.percent, loaded: p.loaded })
    })
    diag.bytes = r.size
    diag.source = r.source
    if (opts?.onStatus) opts.onStatus('Descompactando...')
    const collected: Record<string, unknown>[] = []
    const groupedAcc: { file: string; rows: Record<string, unknown>[] }[] = []
    await forEachCsvBlob(r.buffer, async (name, b) => {
      if (opts?.onStatus) opts.onStatus('Filtrando Dados...')
      const rows = await parseAndFilterByCNPJ(b, cnpj)
      collected.push(...rows)
      groupedAcc.push({ file: name, rows })
      diag.csvCount = (diag.csvCount || 0) + 1
      diag.rowsCount = (diag.rowsCount || 0) + rows.length
      if (String(name).toLowerCase().includes('capital_social')) {
        diag.capitalSocialRows = (diag.capitalSocialRows || 0) + rows.length
      }
      if (String(name).toLowerCase().includes('participacao_sociedade')) {
        diag.participacaoSociedadeRows = (diag.participacaoSociedadeRows || 0) + rows.length
      }
    })
    if (!collected.length) throw new Error('Nenhum registro encontrado para o CNPJ informado.')
    await saveResult(key, { timestamp: Date.now(), cnpj, year, data: collected, grouped: groupedAcc })
    diag.endedAt = Date.now()
    return { items: collected, grouped: groupedAcc, diag }
  } catch (e: any) {
    diag.lastError = e?.message || 'Erro ao processar dados'
    diag.endedAt = Date.now()
    throw Object.assign(new Error(diag.lastError), { diag })
  }
}
