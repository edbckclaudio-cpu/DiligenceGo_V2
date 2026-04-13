import { Share } from '@capacitor/share'
import { Filesystem, Directory } from '@capacitor/filesystem'

/**
 * Converte um array de objetos em CSV separado por `;`, com BOM UTF-8.
 *
 * @param rows Linhas a serem exportadas.
 * @returns Conteudo CSV textual.
 */
function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '\uFEFF'
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(';'),
    ...rows.map(r => headers.map(h => {
      const v = r[h]
      if (v == null) return ''
      const s = String(v).replace(/"/g, '""')
      if (s.includes(';') || s.includes('\n') || s.includes('"')) return `"${s}"`
      return s
    }).join(';'))
  ]
  return '\uFEFF' + lines.join('\n')
}

/**
 * Gera um CSV em cache local e abre a folha de compartilhamento nativa.
 *
 * @param filename Nome do arquivo CSV.
 * @param rows Linhas a serem serializadas.
 */
export async function shareCsv(filename: string, rows: Record<string, unknown>[]): Promise<void> {
  const csv = toCsv(rows)
  const encoder = new TextEncoder()
  const buf = encoder.encode(csv)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < buf.length; i += chunkSize) {
    const slice = buf.subarray(i, i + chunkSize)
    binary += String.fromCharCode.apply(null, Array.from(slice))
  }
  const base64 = btoa(binary)
  await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  })
  const uri = await Filesystem.getUri({
    path: filename,
    directory: Directory.Cache
  })
  await Share.share({
    title: filename,
    text: '',
    files: [uri.uri]
  })
}

/**
 * Compartilha texto simples via folha de compartilhamento nativa do dispositivo.
 *
 * @param title Titulo exibido pelo sistema, quando suportado.
 * @param text Conteudo textual a ser compartilhado.
 */
export async function shareText(title: string, text: string): Promise<void> {
  await Share.share({
    title,
    text
  })
}
