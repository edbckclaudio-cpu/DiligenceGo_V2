import Papa from 'papaparse'

export type Row = Record<string, unknown>

export async function parseAndFilterByCNPJ(blob: Blob, cnpj: string): Promise<Row[]> {
  return new Promise<Row[]>((resolve) => {
    const results: Row[] = []
    const file = new File([blob], 'data.csv', { type: 'text/csv' })
    Papa.parse(file, {
      header: true,
      delimiter: ';',
      encoding: 'ISO-8859-1',
      worker: true,
      step: (row) => {
        const data = row.data as Row
        const keys = Object.keys(data)
        const key = keys.find(k => k.toLowerCase().includes('cnpj'))
        if (key && String(data[key]).replace(/\D/g, '') === cnpj) {
          results.push(data)
        }
      },
      complete: () => resolve(results)
    })
  })
}

export async function parseNamesAndCNPJs(blob: Blob): Promise<{ cnpj: string; nome: string }[]> {
  return new Promise<{ cnpj: string; nome: string }[]>((resolve) => {
    const results: { cnpj: string; nome: string }[] = []
    const file = new File([blob], 'data.csv', { type: 'text/csv' })
    Papa.parse(file, {
      header: true,
      delimiter: ';',
      encoding: 'ISO-8859-1',
      worker: true,
      step: (row) => {
        const data = row.data as Row
        const keys = Object.keys(data)
        const cnpjKey = keys.find(k => k.toLowerCase().includes('cnpj'))
        if (!cnpjKey) return
        const rawCnpj = String(data[cnpjKey] ?? '').replace(/\D/g, '')
        if (rawCnpj.length !== 14) return
        const lower = keys.map(k => k.toLowerCase())
        const nomeKey =
          keys[lower.indexOf('nome_companhia')] ??
          keys[lower.indexOf('nome_empresarial')] ??
          keys.find(k => k.toLowerCase().includes('denom')) ??
          keys[lower.indexOf('denom_social')] ??
          keys[lower.indexOf('razao_social')] ??
          keys.find(k => k.toLowerCase().includes('nome'))
        const nome = nomeKey ? String(data[nomeKey] ?? '').trim() : ''
        results.push({ cnpj: rawCnpj, nome })
      },
      complete: () => resolve(results)
    })
  })
}
