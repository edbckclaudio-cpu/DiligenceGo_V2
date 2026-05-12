import Papa from 'papaparse'
import { Capacitor } from '@capacitor/core'
import { fetchZip, forEachCsvBlob } from './downloader'

type Row = Record<string, unknown>

export type PeopleDiligenceMatch = {
  ano: number
  empresa: string
  cnpj: string
  cargo: string
  nome: string
  cpf?: string
  orgao?: string
  fonte: string
}

export type PeopleDiligenceResult = {
  items: PeopleDiligenceMatch[]
  processedYears: number[]
  warning?: string
}

type SearchParams = {
  name: string
  cpf?: string
  years: number[]
}

type SearchOptions = {
  onProgress?: (progress: { percent?: number; loaded?: number }) => void
  onStatus?: (status: string) => void
}

function normText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanDigits(value: string): string {
  return value.replace(/\D/g, '')
}

function formatCPF(value: string): string {
  const digits = cleanDigits(value).slice(0, 11)
  const parts = [
    digits.slice(0, 3),
    digits.slice(3, 6),
    digits.slice(6, 9),
    digits.slice(9, 11)
  ]
  let out = ''
  if (parts[0]) out += parts[0]
  if (parts[1]) out += '.' + parts[1]
  if (parts[2]) out += '.' + parts[2]
  if (parts[3]) out += '-' + parts[3]
  return out
}

function formatCNPJ(value: string): string {
  const digits = cleanDigits(value).slice(0, 14)
  const parts = [
    digits.slice(0, 2),
    digits.slice(2, 5),
    digits.slice(5, 8),
    digits.slice(8, 12),
    digits.slice(12, 14)
  ]
  let out = ''
  if (parts[0]) out += parts[0]
  if (parts[1]) out += '.' + parts[1]
  if (parts[2]) out += '.' + parts[2]
  if (parts[3]) out += '/' + parts[3]
  if (parts[4]) out += '-' + parts[4]
  return out
}

function normKey(value: string): string {
  return normText(value).replace(/[^a-z0-9]+/g, '_')
}

function findKey(keys: string[], candidates: string[], includesLogic?: (normalized: string) => boolean) {
  const indexed = keys.map(k => ({ original: k, normalized: normKey(k) }))
  for (const candidate of candidates) {
    const exact = indexed.find(entry => entry.normalized === normKey(candidate))
    if (exact) return exact.original
  }
  if (includesLogic) {
    const fuzzy = indexed.find(entry => includesLogic(entry.normalized))
    if (fuzzy) return fuzzy.original
  }
  return undefined
}

function sourceName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

function isGovernanceFile(fileName: string): boolean {
  const name = fileName.toLowerCase()
  if (!name.endsWith('.csv')) return false
  if (name.includes('remuneracao')) return false
  return (
    name.includes('administrador') ||
    name.includes('administradores') ||
    name.includes('conselho') ||
    name.includes('diretoria') ||
    name.includes('diretor') ||
    name.includes('responsavel')
  )
}

function matchesPersonName(candidate: string, query: string): boolean {
  const normCandidate = normText(candidate)
  const normQuery = normText(query)
  if (!normQuery) return true
  if (!normCandidate) return false
  if (normCandidate.includes(normQuery)) return true
  const tokens = normQuery.split(' ').filter(token => token.length >= 2)
  if (!tokens.length) return normCandidate.includes(normQuery)
  return tokens.every(token => normCandidate.includes(token))
}

function shouldAbortOlderYear(firstYear: number, firstYearElapsedMs: number): boolean {
  if (firstYearElapsedMs < 12000) return false
  try {
    const deviceMemory = Number((globalThis.navigator as any)?.deviceMemory || 0)
    if (deviceMemory && deviceMemory <= 4) return true
  } catch {}
  try {
    const platform = Capacitor.getPlatform()
    const native = (Capacitor as any).isNativePlatform?.() ?? (platform !== 'web')
    if (native && platform === 'android' && firstYear >= 2025) return true
  } catch {}
  return false
}

async function parsePeopleCsv(
  blob: Blob,
  fileName: string,
  year: number,
  nameQuery: string,
  cpfQuery: string
): Promise<PeopleDiligenceMatch[]> {
  return new Promise<PeopleDiligenceMatch[]>((resolve) => {
    const results: PeopleDiligenceMatch[] = []
    const file = new File([blob], sourceName(fileName), { type: 'text/csv' })
    Papa.parse(file, {
      header: true,
      delimiter: ';',
      encoding: 'ISO-8859-1',
      worker: true,
      step: (row) => {
        const data = row.data as Row
        const keys = Object.keys(data)
        if (!keys.length) return
        const nomeKey =
          findKey(keys, ['Nome', 'Nome_Administrador', 'Nome_Diretor', 'Nome_Membro', 'Nome_Responsavel'], n => n.includes('nome') && !n.includes('companhia')) ||
          findKey(keys, ['Responsavel'], n => n.includes('responsavel'))
        const cpfKey =
          findKey(keys, ['CPF', 'Cpf', 'Nr_CPF', 'Numero_CPF'], n => n === 'cpf' || (n.includes('cpf') && !n.includes('cnpj')))
        const cargoKey =
          findKey(keys, ['Cargo', 'Funcao', 'Cargo_Responsavel'], n => n.includes('cargo') || n.includes('funcao'))
        const orgaoKey =
          findKey(keys, ['Orgao', 'Órgão', 'Orgão', 'Conselho', 'Diretoria'], n => n.includes('orgao') || n.includes('conselho') || n.includes('diretoria'))
        const empresaKey =
          findKey(keys, ['Nome_Companhia', 'Denominacao_Social', 'Denominacao', 'Razao_Social_Companhia'], n => (n.includes('nome') && n.includes('companhia')) || n.includes('denominacao')) ||
          findKey(keys, ['Companhia'], n => n.includes('companhia'))
        const cnpjKey =
          findKey(keys, ['CNPJ_Companhia', 'CNPJ_Emissor', 'CNPJ'], n => n.includes('cnpj'))
        const nome = String(nomeKey ? data[nomeKey] ?? '' : '').trim()
        if (!matchesPersonName(nome, nameQuery)) return
        const cpfRaw = String(cpfKey ? data[cpfKey] ?? '' : '').trim()
        const cpfDigits = cleanDigits(cpfRaw)
        if (cpfQuery) {
          if (cpfDigits.length !== 11 || cpfDigits !== cpfQuery) return
        }
        const empresa = String(empresaKey ? data[empresaKey] ?? '' : '').trim()
        const cnpj = String(cnpjKey ? data[cnpjKey] ?? '' : '').trim()
        const cargo = String(cargoKey ? data[cargoKey] ?? '' : '').trim()
        const orgao = String(orgaoKey ? data[orgaoKey] ?? '' : '').trim()
        const displayCargo = [cargo, orgao].filter(Boolean).join(' • ') || orgao || cargo || 'Vínculo de governança identificado'
        results.push({
          ano: year,
          empresa,
          cnpj: formatCNPJ(cnpj),
          cargo: displayCargo,
          nome,
          cpf: cpfDigits.length === 11 ? formatCPF(cpfDigits) : undefined,
          orgao: orgao || undefined,
          fonte: sourceName(fileName)
        })
      },
      complete: () => resolve(results),
      error: () => resolve(results)
    })
  })
}

function dedupeMatches(items: PeopleDiligenceMatch[]): PeopleDiligenceMatch[] {
  const map = new Map<string, PeopleDiligenceMatch>()
  for (const item of items) {
    const key = [
      item.ano,
      normText(item.nome),
      cleanDigits(item.cnpj),
      normText(item.cargo),
      normText(item.fonte)
    ].join('|')
    if (!map.has(key)) map.set(key, item)
  }
  return Array.from(map.values()).sort((a, b) => {
    if (b.ano !== a.ano) return b.ano - a.ano
    return a.empresa.localeCompare(b.empresa, 'pt-BR')
  })
}

export async function runPeopleDiligence(
  params: SearchParams,
  options: SearchOptions = {}
): Promise<PeopleDiligenceResult> {
  const years = Array.from(new Set(params.years)).sort((a, b) => b - a).slice(0, 2)
  const cpfQuery = cleanDigits(params.cpf || '').slice(0, 11)
  const results: PeopleDiligenceMatch[] = []
  const processedYears: number[] = []
  let warning = ''

  for (let index = 0; index < years.length; index += 1) {
    const year = years[index]
    options.onStatus?.(`Baixando base FRE ${year}...`)
    const yearStartedAt = Date.now()
    const freUrl = `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/FRE/DADOS/fre_cia_aberta_${year}.zip`.trim()
    const zip = await fetchZip(freUrl, progress => {
      const yearPercent = Math.max(0, Math.min(100, progress.percent ?? 0))
      const overallPercent = ((index + yearPercent / 100) / years.length) * 100
      options.onProgress?.({ percent: overallPercent, loaded: progress.loaded })
    })
    options.onStatus?.(`Analisando órgãos de governança da CVM em ${year}...`)
    await forEachCsvBlob(zip.buffer, async (fileName, blob) => {
      if (!isGovernanceFile(fileName)) return
      const found = await parsePeopleCsv(blob, fileName, year, params.name, cpfQuery)
      results.push(...found)
    })
    processedYears.push(year)
    options.onProgress?.({ percent: ((index + 1) / years.length) * 100, loaded: zip.size })
    const elapsed = Date.now() - yearStartedAt
    if (index === 0 && years.length > 1 && shouldAbortOlderYear(year, elapsed)) {
      warning = `Exibindo apenas ${year} devido às limitações de processamento do dispositivo. Para outros anos, consulte individualmente.`
      break
    }
  }

  options.onStatus?.('')
  options.onProgress?.({ percent: 100 })

  return {
    items: dedupeMatches(results),
    processedYears,
    warning
  }
}
