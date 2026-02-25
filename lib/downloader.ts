import JSZip from 'jszip'
import { Http } from '@capacitor-community/http'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'

export type Progress = { loaded: number; total?: number; percent?: number }
function isNativeAndroid(): boolean {
  try {
    const p = Capacitor.getPlatform()
    const native = (Capacitor as any).isNativePlatform?.() ?? (p !== 'web')
    const hasHttp = (Capacitor as any).isPluginAvailable?.('Http') ?? true
    return native && p === 'android' && !!hasHttp
  } catch {
    return false
  }
}
export async function headZip(url: string): Promise<{ ok: boolean; status: number; length?: number }> {
  try {
    if (!isNativeAndroid()) {
      try {
        let res = await fetch(url, { method: 'HEAD' })
        let len = parseInt(res.headers.get('content-length') || '0', 10)
        if (!res.ok || !len) {
          res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } })
          const cr = res.headers.get('content-range') || ''
          const m = /\/(\d+)$/.exec(cr)
          len = m ? parseInt(m[1], 10) : len
        }
        return { ok: res.ok, status: res.status || 0, length: isNaN(len) ? undefined : len }
      } catch {
        const proxied = `https://cors.isomorphic-git.org/${url}`
        const res2 = await fetch(proxied, { method: 'GET', headers: { Range: 'bytes=0-0' } })
        const cr2 = res2.headers.get('content-range') || ''
        const m2 = /\/(\d+)$/.exec(cr2)
        const len2 = m2 ? parseInt(m2[1], 10) : undefined
        return { ok: res2.ok, status: res2.status || 0, length: len2 }
      }
    } else {
      let res = await Http.request({
        url,
        method: 'HEAD',
        connectTimeout: 120000,
        readTimeout: 120000
      })
      const lenHeader = (res.headers || {})['content-length'] || (res.headers || {})['Content-Length']
      let len = lenHeader ? parseInt(String(lenHeader), 10) : undefined
      if (!(((res.status ?? 0) >= 200 && (res.status ?? 0) < 300) && len)) {
        res = await Http.request({
          url,
          method: 'GET',
          headers: { Range: 'bytes=0-0' } as any,
          connectTimeout: 120000,
          readTimeout: 120000
        })
        const cr = ((res.headers || {})['content-range'] || (res.headers || {})['Content-Range']) as any
        if (cr && typeof cr === 'string') {
          const m = /\/(\d+)$/.exec(cr)
          len = m ? parseInt(m[1], 10) : len
        }
      }
      const ok = (res.status ?? 0) >= 200 && (res.status ?? 0) < 300
      return { ok, status: res.status ?? 0, length: len }
    }
  } catch (e: any) {
    const status = e?.status ?? 0
    return { ok: false, status }
  }
}
export async function checkCVMConnectivity(): Promise<{ ok: boolean; status: number }> {
  try {
    if (!isNativeAndroid()) {
      try {
        const res = await fetch('https://dados.cvm.gov.br/', { method: 'HEAD' })
        if (!res.ok) return { ok: false, status: res.status || 0 }
        console.log('[DiligenceGo] Conectividade CVM: OK.', res.status)
        return { ok: true, status: res.status || 200 }
      } catch {
        const res2 = await fetch('https://cors.isomorphic-git.org/https://dados.cvm.gov.br/', { method: 'GET', headers: { Range: 'bytes=0-0' } })
        return { ok: res2.ok, status: res2.status || 0 }
      }
    } else {
      const res = await Http.request({
        url: 'https://dados.cvm.gov.br/',
        method: 'HEAD',
        connectTimeout: 30000,
        readTimeout: 30000
      })
      console.log('[DiligenceGo] Conectividade CVM: OK.', res.status)
      return { ok: true, status: res.status ?? 200 }
    }
  } catch (e: any) {
    const status = e?.status ?? 0
    return { ok: false, status }
  }
}

export async function fetchZip(url: string, onProgress?: (p: Progress) => void): Promise<{ buffer: ArrayBuffer; size: number; source: string }> {
  let sub: any
  try {
    if (!isNativeAndroid()) {
      console.log('[DiligenceGo] Usando Fetch (Web)')
      const headers = { 'Accept': 'application/zip,application/octet-stream' }
      // Proxy primeiro
      try {
        const proxied = `https://cors.isomorphic-git.org/${url}`
        const resProxy = await fetch(proxied, { credentials: 'omit', headers })
        if (resProxy.ok) {
          const buf = await resProxy.arrayBuffer()
          return { buffer: buf, size: buf.byteLength, source: 'web-proxy' }
        }
      } catch {}
      // Direto
      try {
        const res = await fetch(url, { credentials: 'omit', headers })
        if (!res.ok) {
          const status = res.status || 0
          if (status === 404) throw new Error('404 — arquivo não encontrado para o ano informado')
          throw Object.assign(new Error('Falha ao baixar ZIP'), { status })
        }
        const buf = await res.arrayBuffer()
        return { buffer: buf, size: buf.byteLength, source: 'web-direct' }
      } catch (err: any) {
        const status = err?.status ?? 0
        if (!status) throw new Error('CORS/Conexão bloqueada no modo web')
        throw Object.assign(new Error('Falha ao baixar ZIP'), { status })
      }
    }
    // ANDROID / NATIVO
    console.log('[DiligenceGo] Usando HTTP Nativo')
    if (onProgress) {
      sub = await Http.addListener('progress', (ev: any) => {
        if (ev?.type === 'download') {
          const total = ev.total ?? ev.contentLength
          const loaded = ev.bytes ?? ev.loaded ?? 0
          const percent = total ? Math.round((loaded / total) * 100) : undefined
          onProgress({ loaded, total, percent })
        }
      })
    }
    const name = `fre_${Date.now()}.zip`
    console.log('[DiligenceGo] URL final para download:', url)
    try {
      await Http.downloadFile({
        url,
        filePath: name,
        fileDirectory: 'CACHE' as any,
        progress: true,
        connectTimeout: 120000,
        readTimeout: 120000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
          'Accept': 'application/zip,application/octet-stream'
        } as any
      })
    } catch (primaryErr: any) {
      try {
        const res: any = await Http.request({
          url,
          method: 'GET',
          connectTimeout: 120000,
          readTimeout: 120000,
          responseType: 'arraybuffer' as any,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
            'Accept': 'application/zip,application/octet-stream'
          } as any,
          params: {} as any
        } as any)
        const ok = (res?.status ?? 0) >= 200 && (res?.status ?? 0) < 300
        if (!ok) throw Object.assign(new Error('Falha ao baixar ZIP'), { status: res?.status ?? 0 })
        const data = res?.data
        if (data instanceof ArrayBuffer) {
          return { buffer: data as ArrayBuffer, size: (data as ArrayBuffer).byteLength, source: 'android-request' }
        }
        if (typeof data === 'string') {
          const dataUrl = `data:application/zip;base64,${data}`
          const resp = await fetch(dataUrl)
          const buf = await resp.arrayBuffer()
          return { buffer: buf, size: buf.byteLength, source: 'android-request' }
        }
        throw new Error('Resposta inválida do HTTP nativo')
      } catch (fallbackErr: any) {
        throw fallbackErr
      }
    }
    const uri = await Filesystem.getUri({ path: name, directory: Directory.Cache } as any)
    const src = (Capacitor as any).convertFileSrc ? (Capacitor as any).convertFileSrc(uri.uri) : uri.uri
    const fetched = await fetch(src)
    const buffer = await fetched.arrayBuffer()
    return { buffer, size: buffer.byteLength, source: 'android-file' }
  } catch (e: any) {
    const msg = String(e?.message || '')
    const status = e?.status
    console.error('Falha no download do ZIP', { url, status: status ?? 0, message: msg })
    if (status === 404) throw new Error('404 — arquivo não encontrado para o ano informado')
    if (msg.toLowerCase().includes('timeout')) throw new Error('Timeout — rede lenta ou instável')
    if (!status || status === 0) {
      if (msg.toLowerCase().includes('cors') || msg.toLowerCase().includes('blocked')) {
        throw new Error('CORS — execute via APK para evitar bloqueio do navegador')
      }
      throw new Error('Erro de Conexão/DNS')
    }
    throw new Error(`Falha ao baixar ZIP (código: ${status})`)
  } finally {
    if (sub?.remove) await sub.remove()
  }
}

export async function forEachCsvBlob(zipBuffer: ArrayBuffer, handler: (name: string, blob: Blob) => Promise<void>): Promise<void> {
  const zip = await JSZip.loadAsync(zipBuffer)
  const entries = Object.values(zip.files).filter(f => !f.dir && f.name.toLowerCase().endsWith('.csv'))
  for (const f of entries) {
    const blob = await f.async('blob')
    await handler(f.name, blob)
  }
}
