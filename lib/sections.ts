type Row = Record<string, unknown>

/**
 * Seleciona apenas colunas cujo nome "pareca" relevante para uma familia de termos.
 * E uma heuristica usada por secoes mais abertas, como litigios e governanca.
 *
 * @param rows Linhas brutas do CSV.
 * @param keys Termos de busca.
 * @returns Subconjunto de objetos contendo apenas chaves relacionadas.
 */
function pick(rows: Row[], keys: string[]) {
  const lower = keys.map(k => k.toLowerCase())
  return rows.map(r => {
    const out: Row = {}
    for (const [k, v] of Object.entries(r)) {
      const kl = k.toLowerCase()
      if (lower.some(s => kl.includes(s))) out[k] = v
    }
    return out
  }).filter(r => Object.keys(r).length > 0)
}

/**
 * Monta um resumo executivo a partir das linhas filtradas do CNPJ.
 *
 * @param rows Linhas brutas da consulta.
 * @returns Empresa, setor e contagem heuristica de litigios/processos.
 */
export function buildResumo(rows: Row[]) {
  const allKeys = Array.from(new Set(rows.flatMap(r => Object.keys(r))))
  const nameKey =
    allKeys.find(k => k.toLowerCase() === 'nome_companhia') ||
    allKeys.find(k => k.toLowerCase().includes('denomin')) ||
    allKeys.find(k => k.toLowerCase().includes('nome'))
  const sectorKeyCandidates = ['setor', 'segmento', 'atividade', 'classe']
  const sectorKey = Object.keys(rows[0] || {}).find(k => sectorKeyCandidates.some(s => k.toLowerCase().includes(s)))
  let setor = ''
  if (sectorKey) {
    const found = rows.find(r => r[sectorKey!])
    setor = found ? String(found[sectorKey] ?? '') : ''
  }
  const totalLitigios = rows.reduce((count, r) => {
    const keys = Object.keys(r).map(k => k.toLowerCase())
    const match = keys.some(k => k.includes('litig') || k.includes('process'))
    return count + (match ? 1 : 0)
  }, 0)
  const empresa = (() => {
    if (!nameKey) return ''
    for (const r of rows) {
      const v = r[nameKey]
      if (v != null && String(v).trim() !== '') return String(v)
    }
    return ''
  })()
  return {
    empresa,
    setor,
    totalLitigios
  }
}

function parseNumberBR(s: unknown): number {
  let str = String(s ?? '').trim()
  if (!str) return 0
  str = str.replace(/[^\d.,-]/g, '')
  const lastDot = str.lastIndexOf('.')
  const lastComma = str.lastIndexOf(',')
  let decimal = ''
  if (lastDot >= 0 && lastComma >= 0) {
    decimal = lastDot > lastComma ? '.' : ','
  } else if (lastDot >= 0) {
    const decLen = str.length - lastDot - 1
    decimal = decLen === 2 ? '.' : ''
  } else if (lastComma >= 0) {
    const decLen = str.length - lastComma - 1
    decimal = decLen === 2 ? ',' : ''
  }
  let cleaned = str
  if (decimal) {
    const thousandSep = decimal === '.' ? ',' : '.'
    cleaned = cleaned.replace(new RegExp('\\' + thousandSep, 'g'), '')
    cleaned = cleaned.replace(decimal, '.')
  } else {
    cleaned = cleaned.replace(/[.,]/g, '')
  }
  const v = parseFloat(cleaned)
  return isNaN(v) ? 0 : v
}
function parseIntBR(s: unknown): number {
  const str = String(s ?? '').replace(/\./g, '').replace(/[^\d-]/g, '')
  const v = parseInt(str || '0', 10)
  return isNaN(v) ? 0 : v
}
function parseDateBR(s: unknown): number {
  const t = String(s ?? '').trim()
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t)
  if (m) {
    const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10))
    return d.getTime()
  }
  const d2 = new Date(t)
  return isNaN(d2.getTime()) ? 0 : d2.getTime()
}
function fmtBRL(n: number): string {
  return Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}
function fmtInt(n: number): string {
  return Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(n)
}
function fmtDateBR(s: unknown): string {
  const t = String(s ?? '')
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  const m2 = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t)
  if (m2) return `${m2[1]}/${m2[2]}/${m2[3]}`
  const d = new Date(t)
  if (!isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yy = d.getFullYear()
    return `${dd}/${mm}/${yy}`
  }
  return t
}

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
}
function findKey(keys: string[], candidates: string[], includesLogic?: (n: string) => boolean) {
  const nk = keys.map(k => ({ k, n: norm(k) }))
  for (const c of candidates) {
    const cn = norm(c)
    const hit = nk.find(x => x.n === cn)
    if (hit) return hit.k
  }
  if (includesLogic) {
    const hit = nk.find(x => includesLogic(x.n))
    if (hit) return hit.k
  }
  return undefined
}

/**
 * Consolida a visao mais recente de capital social para o CNPJ consultado.
 *
 * @param grouped Dados agrupados por arquivo CSV.
 * @param cnpj CNPJ normalizado.
 * @returns Ultimo snapshot conhecido de capital social ou `null`.
 */
export function buildCapitalSocial(grouped: { file: string; rows: Row[] }[], cnpj: string) {
  const entry = grouped.find(g => g.file.toLowerCase().includes('capital_social'))
  if (!entry) return null
  const keys = Array.from(new Set(entry.rows.flatMap(r => Object.keys(r))))
  const cnpjKey =
    findKey(keys, ['CNPJ', 'CNPJ_Companhia'], n => n.includes('cnpj')) || 'CNPJ_Companhia'
  const dateKey =
    findKey(keys, ['Data_Autorizacao_Aprovacao'], n => n.includes('data_autorizacao_aprovacao')) ||
    findKey(keys, ['Data_Referencia', 'Dt_Referencia'], n => n.includes('data_referencia') || n.includes('dt_referencia')) ||
    findKey(keys, ['Data'], n => n.startsWith('data'))
  const valorKey =
    findKey(keys, ['Valor_Capital', 'Vl_Capital'], n => n.includes('valor') && n.includes('capital')) ||
    findKey(keys, ['Capital_Social'], n => n.includes('capital_social'))
  const onKey =
    findKey(keys, ['Quantidade_Acoes_Ordinarias'], n => n.includes('quantidade_acoes_ordinarias') || (n.includes('ordinarias') && n.includes('quantidade'))) ||
    findKey(keys, ['Acoes_ON', 'Qtd_ON'], n => n.includes('acoes_on') || n.includes('qtd_on'))
  const pnKey =
    findKey(keys, ['Quantidade_Acoes_Preferenciais'], n => n.includes('quantidade_acoes_preferenciais') || (n.includes('preferenciais') && n.includes('quantidade'))) ||
    findKey(keys, ['Acoes_PN', 'Qtd_PN'], n => n.includes('acoes_pn') || n.includes('qtd_pn'))
  const totalKey =
    findKey(keys, ['Quantidade_Total_Acoes'], n => (n.includes('total') && n.includes('acoes')) || n.includes('acoes_total'))
  const rows = entry.rows.filter(r => String(r[cnpjKey] || '').replace(/\D/g, '') === cnpj)
  if (!rows.length) return null
  const getVal = (row: Row, k?: string) => (k ? row[k] : undefined)
  const sorted = rows.slice().sort((a, b) => parseDateBR(getVal(a, dateKey)) - parseDateBR(getVal(b, dateKey)))
  const latest = sorted[sorted.length - 1]
  const ref = dateKey ? fmtDateBR(getVal(latest, dateKey)) : ''
  const valor = fmtBRL(parseNumberBR(getVal(latest, valorKey)))
  const on = fmtInt(parseIntBR(getVal(latest, onKey)))
  const pn = fmtInt(parseIntBR(getVal(latest, pnKey)))
  const total = fmtInt(parseIntBR(getVal(latest, totalKey)))
  return { ref, valor, on, pn, total }
}

/**
 * Monta cartoes detalhados de capital social, separados por tipo de capital.
 *
 * @param grouped Dados agrupados por arquivo.
 * @param cnpj CNPJ normalizado.
 * @returns Lista ordenada de snapshots detalhados.
 */
export function buildCapitalSocialDetailed(grouped: { file: string; rows: Row[] }[], cnpj: string) {
  const entry = grouped.find(g => g.file.toLowerCase().includes('capital_social'))
  if (!entry) return []
  const keys = Array.from(new Set(entry.rows.flatMap(r => Object.keys(r))))
  const cnpjKey =
    findKey(keys, ['CNPJ', 'CNPJ_Companhia'], n => n.includes('cnpj')) || 'CNPJ_Companhia'
  const tipoKey =
    findKey(keys, ['Tipo_Capital'], n => n.includes('tipo_capital')) || findKey(keys, ['Tp_Capital'], n => n.includes('tp_capital'))
  const dateKey =
    findKey(keys, ['Data_Autorizacao_Aprovacao'], n => n.includes('data_autorizacao_aprovacao')) ||
    findKey(keys, ['Data_Referencia', 'Dt_Referencia'], n => n.includes('data_referencia') || n.includes('dt_referencia')) ||
    findKey(keys, ['Data'], n => n.startsWith('data'))
  const valorKey =
    findKey(keys, ['Valor_Capital', 'Vl_Capital'], n => n.includes('valor') && n.includes('capital')) ||
    findKey(keys, ['Capital_Social'], n => n.includes('capital_social'))
  const onKey =
    findKey(keys, ['Quantidade_Acoes_Ordinarias'], n => n.includes('quantidade_acoes_ordinarias') || (n.includes('ordinarias') && n.includes('quantidade'))) ||
    findKey(keys, ['Acoes_ON', 'Qtd_ON'], n => n.includes('acoes_on') || n.includes('qtd_on'))
  const pnKey =
    findKey(keys, ['Quantidade_Acoes_Preferenciais'], n => n.includes('quantidade_acoes_preferenciais') || (n.includes('preferenciais') && n.includes('quantidade'))) ||
    findKey(keys, ['Acoes_PN', 'Qtd_PN'], n => n.includes('acoes_pn') || n.includes('qtd_pn'))
  const totalKey =
    findKey(keys, ['Quantidade_Total_Acoes'], n => (n.includes('total') && n.includes('acoes')) || n.includes('acoes_total'))
  const rows = entry.rows.filter(r => String(r[cnpjKey] || '').replace(/\D/g, '') === cnpj)
  if (!rows.length) return []
  const groups = new Map<string, Row[]>()
  for (const r of rows) {
    const tipo = String(tipoKey ? r[tipoKey] ?? '' : '').trim() || 'Capital'
    const arr = groups.get(tipo) || []
    arr.push(r)
    groups.set(tipo, arr)
  }
  const out: { tipo: string; ref: string; valor: string; on: string; pn: string; total: string }[] = []
  for (const [tipo, list] of groups.entries()) {
    const sorted = list.slice().sort((a, b) => parseDateBR(a[dateKey as any]) - parseDateBR(b[dateKey as any]))
    const latest = sorted[sorted.length - 1]
    const ref = dateKey ? fmtDateBR(latest[dateKey as any]) : ''
    const valor = fmtBRL(parseNumberBR(latest[valorKey as any]))
    const on = fmtInt(parseIntBR(latest[onKey as any]))
    const pn = fmtInt(parseIntBR(latest[pnKey as any]))
    const total = fmtInt(parseIntBR(latest[totalKey as any]))
    out.push({ tipo, ref, valor, on, pn, total })
  }
  return out.sort((a, b) => parseDateBR(a.ref) - parseDateBR(b.ref))
}

/**
 * Consolida participacoes societarias para compor a aba de Grupo Economico.
 *
 * @param grouped Dados agrupados por arquivo.
 * @param cnpj CNPJ normalizado.
 * @returns Lista de investidas ordenada pela participacao percentual.
 */
export function buildGrupoEconomico(grouped: { file: string; rows: Row[] }[], cnpj: string) {
  const entry = grouped.find(g => g.file.toLowerCase().includes('participacao_sociedade'))
  if (!entry) return []
  const keys = Array.from(new Set(entry.rows.flatMap(r => Object.keys(r))))
  const cnpjCompKey =
    findKey(keys, ['CNPJ_Companhia'], n => n.includes('cnpj_companhia')) ||
    findKey(keys, ['CNPJ_Emissor'], n => n.includes('cnpj_emissor')) ||
    findKey(keys, ['CNPJ_Comp'], n => n.includes('cnpj_comp'))
  const investidaCnpjKey =
    findKey(keys, ['CNPJ'], n => n === 'cnpj') ||
    findKey(keys, ['CNPJ_Investida'], n => n.includes('cnpj_investida'))
  const razaoKey =
    findKey(keys, ['Razao_Social', 'Razao_Social_Investida'], n => n.includes('razao_social')) ||
    findKey(keys, ['Nome_Empresarial'], n => n.includes('nome_empresarial'))
  const partKey =
    findKey(keys, ['Participacao_Emissor'], n => n.includes('participacao_emissor')) ||
    findKey(keys, ['Participacao'], n => n.includes('participacao'))
  const tipoSocKey =
    findKey(keys, ['Tipo_Sociedade'], n => n.includes('tipo_sociedade')) ||
    findKey(keys, ['Tp_Sociedade'], n => n.includes('tp_sociedade'))
  const municipioKey =
    findKey(keys, ['Municipio'], n => n.includes('municipio')) ||
    findKey(keys, ['Mun_Sede'], n => n.includes('mun_sede'))
  const ufKey =
    findKey(keys, ['UF_Sede', 'UF'], n => n.includes('uf') && (n.includes('sede') || n === 'uf'))
  const rows = entry.rows.filter(r => String(r[cnpjCompKey as any] || '').replace(/\D/g, '') === cnpj)
  const out = rows.map(r => {
    const nome = String(razaoKey ? r[razaoKey as any] ?? '' : '').trim()
    const indireta = /\(participa[cç]ao indireta\)/i.test(nome)
    const part = String(partKey ? r[partKey as any] ?? '' : '').trim()
    const partNum = parseFloat(String(part).replace(',', '.').replace(/[^\d.-]/g, '')) || 0
    const partFmt = Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(partNum) + '%'
    return {
      nome,
      partFmt,
      partNum,
      cnpjInvestida: String(investidaCnpjKey ? r[investidaCnpjKey as any] ?? '' : '').replace(/\D/g, ''),
      municipio: String(municipioKey ? r[municipioKey as any] ?? '' : '').trim(),
      uf: String(ufKey ? r[ufKey as any] ?? '' : '').trim(),
      tipo: String(tipoSocKey ? r[tipoSocKey as any] ?? '' : '').trim(),
      indireta
    }
  }).sort((a, b) => b.partNum - a.partNum)
  return out
}

/**
 * Recorta campos ligados a governanca a partir do resultado bruto.
 *
 * @param rows Linhas brutas da consulta.
 * @returns Linhas reduzidas contendo termos ligados a governanca.
 */
export function buildGovernanca(rows: Row[]) {
  const gov = pick(rows, ['diretor', 'administrador', 'conselho', 'acionista', 'participa', 'percent'])
  return gov
}

/**
 * Monta os cartoes de governanca exibidos na aba Premium.
 *
 * @param grouped Dados agrupados por CSV.
 * @param cnpj CNPJ normalizado.
 * @returns Lista de cartoes por categoria (responsaveis, administradores, conselho etc.).
 */
export function buildGovernancaCards(grouped: { file: string; rows: Row[] }[], cnpj: string) {
  const categories = [
    { id: 'responsavel', titulo: 'Responsáveis', match: (f: string) => f.includes('responsavel') },
    { id: 'administrador', titulo: 'Administradores', match: (f: string) => f.includes('administrador') || f.includes('administradores') },
    { id: 'conselho', titulo: 'Conselho de Administração', match: (f: string) => f.includes('conselho') },
    { id: 'diretoria', titulo: 'Diretoria', match: (f: string) => f.includes('diretoria') || f.includes('diretor') },
    { id: 'acionista', titulo: 'Acionistas', match: (f: string) => f.includes('acionist') || f.includes('participacao_acionaria') }
  ]
  const out: { titulo: string; items: { nome?: string; cargo?: string; orgao?: string; percentual?: string; ref?: string }[] }[] = []
  for (const cat of categories) {
    const entry = grouped.find(g => cat.match(g.file.toLowerCase()))
    if (!entry) continue
    const keys = Array.from(new Set(entry.rows.flatMap(r => Object.keys(r))))
    const cnpjKey =
      findKey(keys, ['CNPJ_Companhia'], n => n.includes('cnpj_companhia')) ||
      findKey(keys, ['CNPJ_Emissor'], n => n.includes('cnpj_emissor')) ||
      findKey(keys, ['CNPJ'], n => n === 'cnpj')
    const nomeKey =
      findKey(keys, ['Nome', 'Nome_Responsavel', 'Razao_Social', 'Nome_Acionista'], n => n.includes('nome') && !n.includes('companhia')) ||
      findKey(keys, ['Denominacao'], n => n.includes('denominacao'))
    const cargoKey =
      findKey(keys, ['Cargo', 'Funcao', 'Cargo_Responsavel'], n => n.includes('cargo') || n.includes('funcao'))
    const orgaoKey =
      findKey(keys, ['Orgao', 'Órgão', 'Orgão'], n => n.includes('orgao') || n.includes('órg'))
    const percentKey =
      findKey(keys, ['Participacao', 'Participacao_Emissor', 'Percentual'], n => n.includes('participa') || n.includes('percent'))
    const dateKey =
      findKey(keys, ['Data_Referencia', 'Dt_Referencia'], n => n.includes('data_referencia') || n.includes('dt_referencia')) ||
      findKey(keys, ['Data'], n => n.startsWith('data'))
    const rows = entry.rows.filter(r => String(r[cnpjKey as any] || '').replace(/\D/g, '') === cnpj)
    const items = rows.map(r => {
      const nome = String(nomeKey ? r[nomeKey as any] ?? '' : '').trim()
      const cargo = String(cargoKey ? r[cargoKey as any] ?? '' : '').trim()
      const orgao = String(orgaoKey ? r[orgaoKey as any] ?? '' : '').trim()
      const pctRaw = String(percentKey ? r[percentKey as any] ?? '' : '').trim()
      const pctNum = parseFloat(pctRaw.replace(',', '.').replace(/[^\d.-]/g, ''))
      const percentual = pctRaw ? (isNaN(pctNum) ? pctRaw : Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(pctNum) + '%') : undefined
      const ref = dateKey ? fmtDateBR(r[dateKey as any]) : undefined
      return { nome, cargo, orgao, percentual, ref }
    }).filter(i => i.nome || i.cargo || i.orgao || i.percentual)
    if (items.length) out.push({ titulo: cat.titulo, items })
  }
  return out
}

/**
 * Recorta campos ligados a remuneracao a partir do resultado bruto.
 *
 * @param rows Linhas brutas.
 * @returns Linhas reduzidas com foco em remuneracao.
 */
export function buildRemuneracao(rows: Row[]) {
  const rem = pick(rows, ['remuner', 'fixo', 'bônus', 'bonus', 'órgão', 'orgao', 'conselho', 'diretoria'])
  return rem
}

/**
 * Monta os cartoes de remuneracao a partir de heuristicas de nome de arquivo e coluna.
 *
 * @param grouped Dados agrupados por CSV.
 * @param cnpj CNPJ normalizado.
 * @returns Lista de cartoes por categoria de remuneracao.
 */
export function buildRemuneracaoCards(grouped: { file: string; rows: Row[] }[], cnpj: string) {
  function extractCurrencyFromText(s: unknown): number | undefined {
    const t = String(s ?? '').trim()
    if (!t) return undefined
    const m = /R\$\s*([\d\.\,]+)/i.exec(t)
    if (m) return parseNumberBR(m[1])
    const m2 = /([\d\.\,]+)/.exec(t)
    if (m2) return parseNumberBR(m2[1])
    return undefined
  }
  function findCurrencyInRow(keys: string[], row: Row): number | undefined {
    for (const k of keys) {
      const kn = norm(k)
      if (kn.includes('remuner') || kn.includes('honor') || kn.includes('auditor')) {
        const v = row[k]
        const n = extractCurrencyFromText(v)
        if (typeof n === 'number' && !isNaN(n) && n > 0) return n
      }
    }
    return undefined
  }
  const categories = [
    { id: 'conselho', titulo: 'Conselho de Administração', match: (f: string) => f.includes('remuneracao') && f.includes('conselho') },
    { id: 'diretoria', titulo: 'Diretoria', match: (f: string) => f.includes('remuneracao') && (f.includes('diretoria') || f.includes('diretor')) },
    { id: 'administradores', titulo: 'Administradores', match: (f: string) => f.includes('remuneracao') && f.includes('administr') },
    { id: 'total_orgao', titulo: 'Total por Órgão', match: (f: string) => f.includes('remuneracao_total_orgao') || (f.includes('remuneracao') && f.includes('orgao') && f.includes('total')) },
    { id: 'variavel', titulo: 'Remuneração Variável', match: (f: string) => f.includes('remuneracao_variavel') || (f.includes('remuneracao') && f.includes('variavel')) },
    { id: 'estatisticas', titulo: 'Maior/Menor/Média', match: (f: string) => f.includes('remuneracao') && (f.includes('maior') || f.includes('menor') || f.includes('media') || f.includes('max') || f.includes('min')) },
    { id: 'auditor', titulo: 'Auditoria Independente', match: (f: string) => f.includes('auditor') },
    { id: 'geral', titulo: 'Remuneração Geral', match: (f: string) => f.includes('remuneracao') }
  ]
  const out: { titulo: string; items: { nome?: string; cargo?: string; orgao?: string; fixo?: string; bonus?: string; total?: string; maior?: string; menor?: string; medio?: string; ref?: string }[] }[] = []
  for (const cat of categories) {
    const entry = grouped.find(g => cat.match(g.file.toLowerCase()))
    if (!entry) continue
    const keys = Array.from(new Set(entry.rows.flatMap(r => Object.keys(r))))
    const cnpjKey =
      findKey(keys, ['CNPJ_Companhia'], n => n.includes('cnpj_companhia')) ||
      findKey(keys, ['CNPJ_Emissor'], n => n.includes('cnpj_emissor')) ||
      findKey(keys, ['CNPJ'], n => n === 'cnpj')
    const nomeKey =
      findKey(keys, ['Nome', 'Nome_Administrador', 'Nome_Diretor', 'Nome_Membro', 'Razao_Social_Auditor', 'Auditor'], n => n.includes('nome') && !n.includes('companhia')) ||
      findKey(keys, ['Razao_Social'], n => n.includes('razao_social')) ||
      findKey(keys, ['Denominacao'], n => n.includes('denominacao'))
    const cargoKey =
      findKey(keys, ['Cargo', 'Funcao'], n => n.includes('cargo') || n.includes('funcao'))
    const orgaoKey =
      findKey(keys, ['Orgao', 'Órgão', 'Orgão', 'Conselho', 'Diretoria'], n => n.includes('orgao') || n.includes('órg') || n.includes('conselho') || n.includes('diretoria'))
    const fixoKey =
      findKey(keys, ['Remuneracao_Fixa', 'Valor_Fixo', 'Remuneracao_Fixa_Conselho'], n => n.includes('remuneracao') && n.includes('fix')) ||
      findKey(keys, ['Remuneracao_Fixa_Diretoria'], n => n.includes('remuneracao_fixa_diretoria'))
    const bonusKey =
      findKey(keys, ['Bonus', 'Remuneracao_Variavel', 'Remuneracao_Bonus'], n => n.includes('bonus') || (n.includes('remuneracao') && n.includes('variavel')))
    const totalKey =
      findKey(keys, ['Remuneracao_Total', 'Total'], n => n.includes('total') && n.includes('remuneracao')) ||
      findKey(keys, ['Vl_Total'], n => n.includes('vl_total'))
    const maiorKey =
      findKey(keys, ['Valor_Maior_Remuneracao', 'Maior_Remuneracao'], n => n.includes('maior') && n.includes('remuneracao')) ||
      findKey(keys, ['Valor_Maximo'], n => n.includes('max'))
    const menorKey =
      findKey(keys, ['Valor_Menor_Remuneracao', 'Menor_Remuneracao'], n => n.includes('menor') && n.includes('remuneracao')) ||
      findKey(keys, ['Valor_Minimo'], n => n.includes('min'))
    const medioKey =
      findKey(keys, ['Valor_Medio_Remuneracao', 'Media_Remuneracao'], n => n.includes('medio') && n.includes('remuneracao')) ||
      findKey(keys, ['Valor_Medio'], n => n.includes('medio'))
    const dateKey =
      findKey(keys, ['Data_Referencia', 'Dt_Referencia'], n => n.includes('data_referencia') || n.includes('dt_referencia')) ||
      findKey(keys, ['Data'], n => n.startsWith('data'))
    const rows = entry.rows.filter(r => String(r[cnpjKey as any] || '').replace(/\D/g, '') === cnpj)
    const items = rows.map(r => {
      const nome = String(nomeKey ? r[nomeKey as any] ?? '' : '').trim()
      const cargo = String(cargoKey ? r[cargoKey as any] ?? '' : '').trim()
      let orgao = String(orgaoKey ? r[orgaoKey as any] ?? '' : '').trim()
      if (cat.id === 'auditor' && !orgao) orgao = 'Auditoria Independente'
      const fixo = fixoKey ? fmtBRL(parseNumberBR(r[fixoKey as any])) : undefined
      const bonus = bonusKey ? fmtBRL(parseNumberBR(r[bonusKey as any])) : undefined
      const total = totalKey ? fmtBRL(parseNumberBR(r[totalKey as any])) : undefined
      const maior = maiorKey ? fmtBRL(parseNumberBR(r[maiorKey as any])) : undefined
      const menor = menorKey ? fmtBRL(parseNumberBR(r[menorKey as any])) : undefined
      const medio = medioKey ? fmtBRL(parseNumberBR(r[medioKey as any])) : undefined
      const fallback = findCurrencyInRow(keys, r)
      const ref = dateKey ? fmtDateBR(r[dateKey as any]) : undefined
      const it: { nome?: string; cargo?: string; orgao?: string; fixo?: string; bonus?: string; total?: string; maior?: string; menor?: string; medio?: string; ref?: string } = { nome, cargo, orgao, fixo, bonus, total, maior, menor, medio, ref }
      if (!it.fixo && !it.bonus && !it.total && typeof fallback === 'number') it.total = fmtBRL(fallback)
      return it
    }).filter(i => i.nome || i.cargo || i.orgao || i.fixo || i.bonus || i.total || i.maior || i.menor || i.medio)
    if (items.length) out.push({ titulo: cat.titulo, items })
  }
  return out
}

/**
 * Recorta linhas relacionadas a litigios/processos.
 *
 * @param rows Linhas brutas.
 * @returns Linhas reduzidas contendo termos ligados a litigios.
 */
export function buildLitigios(rows: Row[]) {
  const lit = pick(rows, ['descri', 'valor', 'probabilidade', 'risco', 'causa'])
  return lit
}

/**
 * Converte linhas brutas em uma visao simplificada de litigios para exibicao.
 *
 * @param rows Linhas brutas.
 * @returns Lista de objetos com descricao, valor e probabilidade.
 */
export function buildLitigiosDetailed(rows: Row[]) {
  const out: { Descricao?: string; Valor?: string; Probabilidade?: string }[] = []
  for (const r of rows) {
    const keys = Object.keys(r)
    const descKey = keys.find(k => k.toLowerCase().includes('descri') || k.toLowerCase().includes('causa'))
    const valorKey = keys.find(k => k.toLowerCase().includes('valor') && !k.toLowerCase().includes('bonus') && !k.toLowerCase().includes('remuner'))
    const probKey = keys.find(k => k.toLowerCase().includes('probab') || k.toLowerCase().includes('risco'))
    const item: { Descricao?: string; Valor?: string; Probabilidade?: string } = {}
    if (descKey) item.Descricao = String(r[descKey] ?? '')
    if (valorKey) item.Valor = String(r[valorKey] ?? '')
    if (probKey) item.Probabilidade = String(r[probKey] ?? '')
    if (item.Descricao || item.Valor || item.Probabilidade) out.push(item)
  }
  return out
}
