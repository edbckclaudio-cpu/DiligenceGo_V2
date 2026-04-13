import Papa from 'papaparse'

export type Row = Record<string, unknown>

/**
 * Faz parse de um CSV da CVM e retorna apenas as linhas do CNPJ informado.
 *
 * @param blob Blob do arquivo CSV.
 * @param cnpj CNPJ normalizado com 14 digitos.
 * @returns Lista de linhas (objetos chave/valor) filtradas pelo CNPJ.
 */
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

/**
 * Extrai pares nome/CNPJ de um CSV da CVM.
 * Usado no fluxo de descoberta de CNPJ pelo nome da companhia.
 *
 * @param blob Blob do CSV.
 * @returns Lista de pares `{ cnpj, nome }`.
 */
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
