'use client'

import { useMemo, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchZip, forEachCsvBlob, checkCVMConnectivity, headZip } from '../lib/downloader'
import { runConsultation } from '../lib/engine'
import { parseAndFilterByCNPJ, parseNamesAndCNPJs } from '../lib/csv'
import { saveResult, loadResult, clearOld } from '../lib/cache'
import { shareCsv, shareText } from '../lib/export'
import { Loader2, Mail, MessageCircle, Search, Download, Circle, Info, Menu } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Card, CardHeader, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { buildResumo, buildGovernanca, buildGovernancaCards, buildRemuneracao, buildRemuneracaoCards, buildLitigios, buildLitigiosDetailed, buildCapitalSocial, buildCapitalSocialDetailed, buildGrupoEconomico } from '../lib/sections'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'
import { Http } from '@capacitor-community/http'
import { Select, SelectTrigger, SelectContent, SelectItem } from '../components/ui/select'
import { useRef } from 'react'
import { Badge } from '../components/ui/badge'
import { ActionSheet } from '@capacitor/action-sheet'
import { loginWithGoogle } from '../lib/auth'
import { deleteCurrentUserData } from '../lib/account'

type SectionData = {
  titulo: string
  items: Record<string, unknown>[]
}

function cleanCNPJ(input: string) {
  return input.replace(/\D/g, '')
}

function currentYear() {
  return new Date().getFullYear()
}

export default function Home() {
  const router = useRouter()
  const [cnpjInput, setCnpjInput] = useState('')
  const [year, setYear] = useState<number>(currentYear())
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<SectionData[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPremium, setIsPremium] = useState(false)
  const [progress, setProgress] = useState<number>(0)
  const [status, setStatus] = useState<string>('')
  const [downloadMB, setDownloadMB] = useState<number>(0)
  const canceledRef = useRef(false)
  const runIdRef = useRef(0)
  const [connOk, setConnOk] = useState<boolean | null>(null)
  const [diag, setDiag] = useState<{ bytes?: number; csvCount?: number; rowsCount?: number; lastError?: string; startedAt?: number; endedAt?: number; usedCache?: boolean; cacheEmpty?: boolean; headStatus?: number; headLen?: number; source?: string }>({})
  const [grouped, setGrouped] = useState<{ file: string; rows: Record<string, unknown>[] }[]>([])
  const [showHelp, setShowHelp] = useState(false)
  const [aiActivity, setAiActivity] = useState<string>('')
  const [showCnpjsModal, setShowCnpjsModal] = useState(false)
  const [cnpjsYear, setCnpjsYear] = useState<number | null>(null)
  const [cnpjsProgress, setCnpjsProgress] = useState<number>(0)
  const [cnpjsList, setCnpjsList] = useState<{ cnpj: string; nome: string }[]>([])
  const [cnpjsFilter, setCnpjsFilter] = useState<string>('')
  const [selectedCnpj, setSelectedCnpj] = useState<string | null>(null)
  const [showDrawer, setShowDrawer] = useState(false)
  const [drawerItem, setDrawerItem] = useState<{ nome: string; partFmt: string; cnpjInvestida: string; municipio: string; uf: string; tipo: string; indireta: boolean } | null>(null)
  const [showMainMenu, setShowMainMenu] = useState(false)

  const key = useMemo(() => `${cleanCNPJ(cnpjInput)}:${year}`, [cnpjInput, year])

  const loadCnpjsForYear = async (y: number) => {
    try {
      setShowCnpjsModal(true)
      setCnpjsYear(y)
      setCnpjsProgress(5)
      const url = `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_${y}.zip`.trim()
      const buffer = await fetchZipDFP(url, p => setCnpjsProgress(Math.max(0, Math.min(100, p.percent ?? 0))))
      const map = new Map<string, string>()
      await forEachCsvBlob(buffer, async (_name, blob) => {
        const pairs = await parseNamesAndCNPJs(blob)
        for (const { cnpj, nome } of pairs) {
          const prev = map.get(cnpj)
          const next = (nome || '').trim()
          if (!prev || prev.trim() === '') {
            if (next) map.set(cnpj, next)
            else if (!map.has(cnpj)) map.set(cnpj, '')
          }
        }
      })
      const arr = Array.from(map.entries()).map(([cnpj, nome]) => ({ cnpj, nome })).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
      setCnpjsList(arr)
      setCnpjsFilter('')
      setSelectedCnpj(null)
      setCnpjsProgress(100)
    } catch (e) {
      alert('Falha ao carregar lista de CNPJs: ' + (e as any)?.message)
    } finally {
      setCnpjsProgress(0)
    }
  }

  async function fetchZipDFP(url: string, onProgress?: (p: { percent?: number; loaded?: number }) => void): Promise<ArrayBuffer> {
    try {
      const p = Capacitor.getPlatform()
      const native = (Capacitor as any).isNativePlatform?.() ?? (p !== 'web')
      const isAndroid = native && p === 'android'
      if (!isAndroid) {
        const res = await fetch(url)
        const buf = await res.arrayBuffer()
        return buf
      }
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
      if (!ok) throw Object.assign(new Error('Falha ao baixar ZIP DFP'), { status: res?.status ?? 0 })
      const data = res?.data
      if (data instanceof ArrayBuffer) return data as ArrayBuffer
      if (typeof data === 'string') {
        const dataUrl = `data:application/zip;base64,${data}`
        const resp = await fetch(dataUrl)
        const buf = await resp.arrayBuffer()
        return buf
      }
      throw new Error('Resposta inválida do HTTP nativo')
    } catch (err: any) {
      const status = err?.status ?? 0
      if (status === 404) throw new Error('404 — arquivo não encontrado para o ano informado')
      if ((err?.message || '').toLowerCase().includes('timeout')) throw new Error('Timeout — rede lenta ou instável')
      throw new Error('Falha ao baixar ZIP DFP')
    }
  }
  async function consultar() {
    console.log('[DiligenceGo] consultar: início')
    runIdRef.current += 1
    const runId = runIdRef.current
    canceledRef.current = false
    setLoading(true)
    const freUrl = `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/FRE/DADOS/fre_cia_aberta_${year}.zip`.trim()
    setError(null)
    setData([])
    setProgress(0)
    setStatus('Conectando...')
    setDownloadMB(0)
    setDiag(d => ({ ...d, startedAt: Date.now(), usedCache: false, cacheEmpty: false, bytes: 0, csvCount: 0, rowsCount: 0, lastError: undefined }))
    try {
      const cnpj = cleanCNPJ(cnpjInput)
      const res = await runConsultation(cnpj, year, {
        onProgress: (p) => {
          if (canceledRef.current) return
          const pct = p.percent ?? 0
          setProgress(pct)
          if (p.loaded) setDownloadMB(p.loaded / (1024 * 1024))
        },
        onStatus: (s) => setStatus(s)
      })
      setGrouped(res.grouped)
      setDiag(d => ({ ...d, ...res.diag }))
      setConnOk(true)
      try { localStorage.setItem('lastCNPJ', cnpj); localStorage.setItem('lastYear', String(year)) } catch {}
      if (runIdRef.current === runId && !canceledRef.current) {
        setData([{ titulo: 'Resultados', items: res.items }])
        try {
          const nomeKey = Object.keys(res.items[0] || {}).find(k => k.toLowerCase() === 'nome_companhia') ||
                          Object.keys(res.items[0] || {}).find(k => k.toLowerCase().includes('denomin')) ||
                          Object.keys(res.items[0] || {}).find(k => k.toLowerCase().includes('nome'))
          const nome = nomeKey ? String(res.items[0][nomeKey] ?? '') : ''
          if (!buildResumo(res.items).setor && nome) {
            const ai = await queryAIActivity(cnpj, nome)
            if (ai) setAiActivity(ai)
          }
        } catch {}
        try { await Haptics.impact({ style: ImpactStyle.Light }) } catch {}
        setStatus('')
        setProgress(0)
      }
    } catch (e: any) {
      const msg = e.message || 'Erro ao processar dados'
      console.error('[DiligenceGo] consultar: erro', msg)
      setError(msg)
      setDiag(d => ({ ...d, lastError: msg }))
    } finally {
      setLoading(false)
      setDiag(d => ({ ...d, endedAt: Date.now() }))
      if (error) {
        setStatus('')
        setProgress(0)
      }
    }
  }
  async function queryAIActivity(cnpj: string, nome: string): Promise<string> {
    try {
      try {
        const cached = localStorage.getItem(`AI_ACTIVITY_${cnpj}`) || ''
        if (cached) return cached
      } catch {}
      const openaiKey = localStorage.getItem('OPENAI_API_KEY') || ''
      const geminiKey = localStorage.getItem('GEMINI_API_KEY') || ''
      const xaiKey = localStorage.getItem('XAI_API_KEY') || ''
      const prompt = `Empresa: ${nome} (CNPJ ${cnpj}). Responda com a atividade principal e o código CNAE (apenas texto curto).`
      if (openaiKey) {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.2 })
        })
        const j = await res.json()
        const txt = j?.choices?.[0]?.message?.content?.trim?.() || ''
        if (txt) try { localStorage.setItem(`AI_ACTIVITY_${cnpj}`, txt) } catch {}
        return txt
      }
      if (geminiKey) {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }]}] })
        })
        const j = await res.json()
        const txt = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim?.() || ''
        if (txt) try { localStorage.setItem(`AI_ACTIVITY_${cnpj}`, txt) } catch {}
        return txt
      }
      if (xaiKey) {
        const res = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${xaiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'grok-2-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.2 })
        })
        const j = await res.json()
        const txt = j?.choices?.[0]?.message?.content?.trim?.() || ''
        if (txt) try { localStorage.setItem(`AI_ACTIVITY_${cnpj}`, txt) } catch {}
        return txt
      }
    } catch {}
    return ''
  }
  function formatCNPJ(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 14)
    const parts = [
      digits.slice(0, 2),
      digits.slice(2, 5),
      digits.slice(5, 8),
      digits.slice(8, 12),
      digits.slice(12, 14),
    ]
    let out = ''
    if (parts[0]) out += parts[0]
    if (parts[1]) out += '.' + parts[1]
    if (parts[2]) out += '.' + parts[2]
    if (parts[3]) out += '/' + parts[3]
    if (parts[4]) out += '-' + parts[4]
    return out
  }
  function cancelar() {
    canceledRef.current = true
    setStatus('Consulta Cancelada')
    setTimeout(() => setStatus(''), 2000)
  }
  useEffect(() => {
    try {
      const lastCnpj = localStorage.getItem('lastCNPJ') || ''
      const lastYear = localStorage.getItem('lastYear')
      if (lastYear) setYear(parseInt(lastYear, 10))
    } catch {}
    ;(async () => {
      const ping = await checkCVMConnectivity()
      setConnOk(ping.ok)
    })()
  }, [])
  function formatBRL(n: number) {
    return Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
  }
  function parseValorBRLish(s: string): number {
    const cleaned = s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
    const v = parseFloat(cleaned)
    return isNaN(v) ? 0 : v
  }
  function probVariant(p?: string): 'destructive' | 'secondary' | 'outline' | 'default' {
    const t = (p || '').toLowerCase()
    if (t.includes('prov')) return 'destructive'
    if (t.includes('poss')) return 'outline'
    if (t.includes('remot')) return 'secondary'
    return 'default'
  }

  async function enviar(tipo: 'csv' | 'texto') {
    if (!data.length) return
    const rows = data[0].items
    const name = `diligencego_${cleanCNPJ(cnpjInput)}_${year}.csv`
    const groupedText = grouped.map(g => {
      const headers = g.rows.length ? Object.keys(g.rows[0]) : []
      const lines = [
        `Arquivo: ${g.file}`,
        headers.join(';'),
        ...g.rows.map(r => headers.map(h => {
          const v = r[h]
          const s = v == null ? '' : String(v).replace(/"/g, '""')
          return s.includes(';') || s.includes('\n') || s.includes('"') ? `"${s}"` : s
        }).join(';'))
      ]
      return lines.join('\n')
    }).join('\n\n')
    if (tipo === 'csv') {
      await shareText(`DiligenceGo ${cleanCNPJ(cnpjInput)} ${year}`, groupedText)
    } else {
      await shareText(`DiligenceGo ${cleanCNPJ(cnpjInput)} ${year}`, groupedText)
    }
  }
  async function enviarGrupo(tipo: 'email' | 'whatsapp') {
    const list = buildGrupoEconomico(grouped, cleanCNPJ(cnpjInput))
    if (!list.length) return
    const lines = list.map(it => {
      const cnpjFmt = it.cnpjInvestida.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/, '$1.$2.$3/$4-$5')
      const loc = [it.municipio, it.uf].filter(Boolean).join(' - ')
      const det = [`CNPJ: ${cnpjFmt}`, `Localização: ${loc || '—'}`, `Tipo de Sociedade: ${it.tipo || '—'}`].join(' | ')
      return `${it.nome}${it.indireta ? ' • Indireta' : ''} — ${it.partFmt} • ${det}`
    })
    const text = [`Grupo Econômico ${formatCNPJ(cleanCNPJ(cnpjInput))}`, ...lines].join('\n')
    await shareText('Grupo Econômico', text)
  }
  async function enviarGovernanca(tipo: 'email' | 'whatsapp') {
    const cards = buildGovernancaCards(grouped, cleanCNPJ(cnpjInput))
    if (!cards.length) return
    const lines: string[] = []
    lines.push(`Governança ${formatCNPJ(cleanCNPJ(cnpjInput))}`)
    for (const c of cards) {
      lines.push(`\n${c.titulo}`)
      for (const it of c.items.slice(0, 200)) {
        const meta = [it.cargo, it.orgao, it.percentual].filter(Boolean).join(' • ') || '—'
        const ref = it.ref ? ` • Ref: ${it.ref}` : ''
        lines.push(`${it.nome || '—'} — ${meta}${ref}`)
      }
    }
    await shareText('Governança', lines.join('\n'))
  }
  async function enviarRemuneracao(tipo: 'email' | 'whatsapp') {
    const cards = buildRemuneracaoCards(grouped, cleanCNPJ(cnpjInput))
    if (!cards.length) return
    const lines: string[] = []
    lines.push(`Remuneração ${formatCNPJ(cleanCNPJ(cnpjInput))}`)
    for (const c of cards) {
      lines.push(`\n${c.titulo}`)
      for (const it of c.items.slice(0, 200)) {
        const base = [it.cargo, it.orgao].filter(Boolean).join(' • ') || '—'
        const fixo = it.fixo ? ` • Fixo: ${it.fixo}` : ''
        const bonus = it.bonus ? ` • Bônus: ${it.bonus}` : ''
        const total = it.total ? ` • Total: ${it.total}` : ''
        const extremos = (it.maior || it.menor || it.medio) ? ` • Maior: ${it.maior || '—'} • Menor: ${it.menor || '—'} • Médio: ${it.medio || '—'}` : ''
        lines.push(`${it.nome || '—'} — ${base}${fixo}${bonus}${total}${extremos}${it.ref ? ` • Ref: ${it.ref}` : ''}`)
      }
    }
    await shareText('Remuneração', lines.join('\n'))
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="space-y-3">
        <Card className="rounded-[32px] shadow-2xl border-none bg-slate-900">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                placeholder="00.000.000/0001-00"
                inputMode="numeric"
                type="tel"
                value={cnpjInput}
                onChange={e => setCnpjInput(formatCNPJ(e.target.value))}
              />
              <Button variant="outline" onClick={async () => {
                const years = [2021, 2022, 2023, 2024, 2025, 2026]
                const options = [{ title: 'CNPJs listadas na CVM', style: 'destructive' }, ...years.map(y => ({ title: String(y) }))] as any
                try {
                  const res = await ActionSheet.showActions({ title: 'Escolha o ano', message: 'Use esta opção para descobrir o CNPJ pelo nome', options })
                  if (res && typeof res.index === 'number') {
                    if (res.index === 0) {
                      const res2 = await ActionSheet.showActions({ title: 'Não sabe o CNPJ? Escolha o ano', options: years.map(y => ({ title: String(y) })) })
                      if (res2 && typeof res2.index === 'number' && res2.index >= 0) {
                        const chosen = years[res2.index]
                        await loadCnpjsForYear(chosen)
                        return
                      }
                    } else if (res.index > 0) {
                      setYear(years[res.index - 1])
                      return
                    }
                  }
                } catch {}
                const input = prompt('Digite o ano (2021–2026):', String(year))
                const val = parseInt(String(input || ''), 10)
                if ([2021, 2022, 2023, 2024, 2025, 2026].includes(val)) setYear(val)
              }}>
                Ano: {year}
              </Button>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <div className="text-xs">Conexão CVM:</div>
              <div className={`h-2 w-2 rounded-full ${connOk === null ? 'bg-neutral-300' : connOk ? 'bg-green-500' : 'bg-red-500'}`} />
            </div>
            <Button
              className="rounded-full h-14 w-full bg-gradient-to-b from-blue-600 to-blue-700 text-white text-lg font-bold shadow-2xl shadow-blue-500/50"
              onClick={consultar}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Search className="h-5 w-5" />
                  Consultar
                </>
              )}
            </Button>
            {loading && (
              <Button variant="outline" onClick={cancelar}>
                Cancelar download
              </Button>
            )}
            {(loading || error || !!data.length) && (
              <div className="mt-2 text-xs text-slate-400 relative">
                <div className="font-medium text-slate-200">Detalhes Técnicos</div>
                <div>Status: {status || (error ? 'Erro' : (!!data.length ? 'Concluído' : 'Aguardando'))}</div>
                <div>Linhas do CNPJ: {diag.rowsCount ?? 0}</div>
                <div className="mt-2 flex gap-2 items-center">
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-full" onClick={() => enviar('csv')} disabled={!grouped.length}>
                    <Mail className="h-4 w-4" /> Email
                  </Button>
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-full" onClick={() => enviar('texto')} disabled={!grouped.length}>
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </Button>
                  <button
                    className="ml-2 inline-flex items-center justify-center h-7 w-7 rounded-full bg-neutral-800 text-white"
                    onMouseDown={() => setShowHelp(true)}
                    onMouseUp={() => setShowHelp(false)}
                    onTouchStart={() => setShowHelp(true)}
                    onTouchEnd={() => setShowHelp(false)}
                  >
                    <Info className="h-4 w-4" />
                  </button>
                  {showHelp && (
                    <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl bg-slate-900 border border-neutral-800 p-3 shadow-2xl text-[12px]">
                      Esses botões compartilham a consulta completa filtrada pelo CNPJ, via Email ou WhatsApp. Feche removendo o dedo do ícone.
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <div className="fixed top-6 right-6 z-30">
          <Button className="rounded-full bg-slate-900 border border-neutral-800 text-white h-12 w-12 p-0" onClick={() => setShowMainMenu(true)}>
            <Menu className="h-6 w-6" />
          </Button>
        </div>
        {loading && (
          <div className="mt-2">
            <div className="h-2 w-full bg-neutral-100 rounded overflow-hidden">
              <div className="h-full bg-black transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-1 text-xs text-neutral-600">{Math.round(progress)}% {downloadMB ? `• ${downloadMB.toFixed(1)} MB` : ''}</div>
          </div>
        )}
        {error && <div className="text-red-600 text-sm">{error}</div>}
        {error && (
          <div className="mt-2 flex gap-2">
            <Button variant="outline" onClick={() => { setYear(2024); consultar() }}>
              Tentar 2024
            </Button>
            <Button variant="outline" onClick={() => consultar()}>
              Nova tentativa
            </Button>
          </div>
        )}
        {!!data.length && (
          <div className="space-y-4">
            <Tabs defaultValue="resumo">
              <TabsList className="flex-nowrap overflow-x-auto scrollbar-hide bg-transparent p-0 gap-2 -mx-4 px-4 [mask-image:linear-gradient(to_right,transparent_0,black_24px,black_calc(100%-24px),transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0,black_24px,black_calc(100%-24px),transparent_100%)]">
                <TabsTrigger value="resumo" className="rounded-full bg-slate-900 border border-neutral-800 px-4 py-2 text-sm data-[state=active]:bg-[#4169E1] data-[state=active]:text-white">Resumo</TabsTrigger>
                <TabsTrigger value="grupo" className="rounded-full bg-slate-900 border border-neutral-800 px-4 py-2 text-sm data-[state=active]:bg-[#4169E1] data-[state=active]:text-white">Grupo Econômico</TabsTrigger>
                <TabsTrigger value="governanca" className="rounded-full bg-slate-900 border border-neutral-800 px-4 py-2 text-sm data-[state=active]:bg-[#4169E1] data-[state=active]:text-white">Governança</TabsTrigger>
                <TabsTrigger value="remuneracao" className="rounded-full bg-slate-900 border border-neutral-800 px-4 py-2 text-sm data-[state=active]:bg-[#4169E1] data-[state=active]:text-white">Remuneração</TabsTrigger>
              </TabsList>
              <TabsContent value="resumo">
                <Card className="rounded-[32px] bg-slate-900 border-none shadow-2xl">
                  <CardHeader>Resumo</CardHeader>
                  <CardContent>
                    {(() => {
                      const r = buildResumo(data[0].items)
                      return (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Card className="rounded-[32px] bg-slate-900 border-none shadow-2xl">
                              <CardHeader>Identificação</CardHeader>
                              <CardContent>
                                <div className="text-sm">{r.empresa || '—'}</div>
                              </CardContent>
                            </Card>
                            <Card className="rounded-[32px] bg-slate-900 border-none shadow-2xl">
                              <CardHeader>Capital Social</CardHeader>
                              <CardContent>
                                {(() => {
                                  const list = buildCapitalSocialDetailed(grouped, cleanCNPJ(cnpjInput))
                                  if (!list.length) return <div className="text-sm">—</div>
                                  const refMax = list[list.length - 1]?.ref || ''
                                  return (
                                    <div className="space-y-2">
                                      <div className="text-xs text-slate-500">Ref: {refMax || '—'}</div>
                                      {list.map((cs, idx) => (
                                        <div key={idx} className="space-y-1 rounded-xl bg-slate-800/40 p-2">
                                          <div className="text-xs text-slate-400">{cs.tipo}</div>
                                          <div className="text-sm space-y-1">
                                            <div className="flex justify-between"><span>Valor do Capital</span><span>{cs.valor}</span></div>
                                            <div className="flex justify-between"><span>ON</span><span>{cs.on}</span></div>
                                            <div className="flex justify-between"><span>PN</span><span>{cs.pn}</span></div>
                                            <div className="flex justify-between"><span>Total Ações</span><span>{cs.total}</span></div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )
                                })()}
                              </CardContent>
                            </Card>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" onClick={() => enviar('csv')} disabled={!isPremium}>
                              <Mail className="h-4 w-4" /> E-mail
                            </Button>
                            <Button variant="outline" onClick={() => enviar('texto')} disabled={!isPremium}>
                              <MessageCircle className="h-4 w-4" /> WhatsApp
                            </Button>
                          </div>
                        </div>
                      )
                    })()}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="governanca">
                <Card className="rounded-[32px] bg-slate-900 border-none shadow-2xl">
                  <CardHeader>Governança</CardHeader>
                  <CardContent>
                    {(() => {
                      const cards = buildGovernancaCards(grouped, cleanCNPJ(cnpjInput))
                      if (cards.length === 0) return <div className="text-sm">Sem dados de governança.</div>
                      return (
                        <div className="space-y-3">
                          <div className="w-full overflow-x-auto flex flex-nowrap gap-3 tabs-mask py-1">
                            {cards.map((c, idx) => (
                              <Card key={idx} className="min-w-[280px] rounded-[32px] bg-slate-900 border-none shadow-2xl">
                                <CardHeader>{c.titulo}</CardHeader>
                                <CardContent>
                                  <ul className="space-y-2">
                                    {c.items.slice(0, 20).map((it, i) => (
                                      <li key={i} className="flex items-start gap-2">
                                        <Circle className="h-4 w-4 text-slate-400 mt-1" />
                                        <div className="text-sm text-slate-50">
                                          <div>{it.nome || '—'}</div>
                                          <div className="text-xs text-slate-400">
                                            {[it.cargo, it.orgao, it.percentual].filter(Boolean).join(' • ') || '—'}
                                          </div>
                                          {it.ref ? <div className="text-[11px] text-slate-500">Ref: {it.ref}</div> : null}
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Button className="bg-[#4169E1] hover:bg-blue-700 text-white rounded-xl" onClick={() => enviarGovernanca('email')}>
                              <Mail className="h-4 w-4" /> E-mail
                            </Button>
                            <Button className="bg-[#4169E1] hover:bg-blue-700 text-white rounded-xl" onClick={() => enviarGovernanca('whatsapp')}>
                              <MessageCircle className="h-4 w-4" /> WhatsApp
                            </Button>
                          </div>
                        </div>
                      )
                    })()}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="grupo">
                <Card className="rounded-[32px] bg-slate-900 border-none shadow-2xl">
                  <CardHeader>Grupo Econômico</CardHeader>
                  <CardContent>
                    {(() => {
                      const list = buildGrupoEconomico(grouped, cleanCNPJ(cnpjInput))
                      return list.length ? (
                        <div className="space-y-3">
                          <div className="space-y-2">
                            {list.map((it, idx) => (
                              <button
                                key={idx}
                                className="w-full text-left rounded-xl bg-slate-800/40 p-3"
                                onClick={() => { setDrawerItem(it); setShowDrawer(true) }}
                                onMouseDown={() => { setDrawerItem(it); setShowDrawer(true) }}
                              >
                                <div className="flex justify-between items-center">
                                  <div className="text-sm text-slate-50">{it.nome}</div>
                                  <div className="text-sm text-slate-200">{it.partFmt}</div>
                                </div>
                                {it.indireta && <Badge variant="secondary">Indireta</Badge>}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Button className="bg-[#4169E1] hover:bg-blue-700 text-white rounded-xl" onClick={() => enviarGrupo('email')}>
                              <Mail className="h-4 w-4" /> E-mail
                            </Button>
                            <Button className="bg-[#4169E1] hover:bg-blue-700 text-white rounded-xl" onClick={() => enviarGrupo('whatsapp')}>
                              <MessageCircle className="h-4 w-4" /> WhatsApp
                            </Button>
                          </div>
                        </div>
                      ) : <div className="text-sm">Sem dados de participações societárias.</div>
                    })()}
                  </CardContent>
                </Card>
                {showDrawer && drawerItem && (
                  <div className="fixed inset-0 bg-black/40 flex items-end">
                    <div className="w-full rounded-t-[32px] bg-slate-900 border border-neutral-800 p-4">
                      <div className="flex justify-between items-center">
                        <div className="text-base font-semibold text-slate-50">{drawerItem.nome}</div>
                        <Button variant="outline" onClick={() => setShowDrawer(false)}>Fechar</Button>
                      </div>
                      <div className="mt-3 space-y-2 text-sm text-slate-200">
                        <div className="flex justify-between"><span>Participação</span><span>{drawerItem.partFmt}</span></div>
                        <div className="flex justify-between"><span>CNPJ da Investida</span><span>{formatCNPJ(drawerItem.cnpjInvestida)}</span></div>
                        <div className="flex justify-between"><span>Localização</span><span>{[drawerItem.municipio, drawerItem.uf].filter(Boolean).join(' - ') || '—'}</span></div>
                        <div className="flex justify-between"><span>Tipo de Sociedade</span><span>{drawerItem.tipo || '—'}</span></div>
                        {drawerItem.indireta && <Badge variant="secondary">Indireta</Badge>}
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="remuneracao">
                <Card className="rounded-[32px] bg-slate-900 border-none shadow-2xl">
                  <CardHeader>Remuneração</CardHeader>
                  <CardContent>
                    {!isPremium ? (
                      <div className="text-sm">Requer Premium.</div>
                    ) : (() => {
                      const cards = buildRemuneracaoCards(grouped, cleanCNPJ(cnpjInput))
                      if (cards.length === 0) return <div className="text-sm">Sem dados de remuneração.</div>
                      return (
                        <div className="space-y-3">
                          <div className="w-full overflow-x-auto flex flex-nowrap gap-3 tabs-mask py-1">
                            {cards.map((c, idx) => (
                              <Card key={idx} className="min-w-[280px] rounded-[32px] bg-slate-900 border-none shadow-2xl">
                                <CardHeader>{c.titulo}</CardHeader>
                                <CardContent>
                                  <ul className="space-y-2">
                                    {c.items.slice(0, 20).map((it, i) => (
                                      <li key={i} className="flex items-start gap-2">
                                        <Circle className="h-4 w-4 text-slate-400 mt-1" />
                                        <div className="text-sm text-slate-50">
                                          <div>{it.nome || '—'}</div>
                                          <div className="text-xs text-slate-400">
                                            {[it.cargo, it.orgao].filter(Boolean).join(' • ') || '—'}
                                          </div>
                                          {(it.fixo || it.bonus || it.total) && (
                                            <div className="text-xs text-slate-300">
                                              {['Fixo: ' + (it.fixo || '—'), 'Bônus: ' + (it.bonus || '—'), 'Total: ' + (it.total || '—')].join(' • ')}
                                            </div>
                                          )}
                                          {(it.maior || it.menor || it.medio) && (
                                            <div className="text-xs text-slate-300">
                                              {['Maior: ' + (it.maior || '—'), 'Menor: ' + (it.menor || '—'), 'Médio: ' + (it.medio || '—')].join(' • ')}
                                            </div>
                                          )}
                                          {it.ref ? <div className="text-[11px] text-slate-500">Ref: {it.ref}</div> : null}
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Button className="bg-[#4169E1] hover:bg-blue-700 text-white rounded-xl" onClick={() => enviarRemuneracao('email')}>
                              <Mail className="h-4 w-4" /> E-mail
                            </Button>
                            <Button className="bg-[#4169E1] hover:bg-blue-700 text-white rounded-xl" onClick={() => enviarRemuneracao('whatsapp')}>
                              <MessageCircle className="h-4 w-4" /> WhatsApp
                            </Button>
                          </div>
                        </div>
                      )
                    })()}
                  </CardContent>
                </Card>
              </TabsContent>
              {/* Abas Litígios e Sancionador removidas por decisão de produto */}
            </Tabs>
            {!isPremium && (
              <div className="fixed bottom-6 left-6">
                <Button variant="outline" onClick={() => setIsPremium(true)}>
                  Ativar Premium (demo)
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      {showMainMenu && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-end">
          <div className="w-full rounded-t-[32px] bg-slate-900 border border-neutral-800 p-4 space-y-3">
            <div className="flex justify-between items-center">
              <div className="text-base font-semibold text-slate-50">Menu</div>
              <Button variant="outline" onClick={() => setShowMainMenu(false)}>Fechar</Button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Button className="bg-[#4169E1] hover:bg-blue-700 text-white rounded-xl" onClick={() => { if (isPremium) enviar('csv') }} disabled={!isPremium}>
                <Download className="h-4 w-4" /> Gerar Relatório Profissional
              </Button>
              <Button variant="outline" className="rounded-xl">Perfil</Button>
              <Button variant="outline" className="rounded-xl">Assinatura</Button>
              <Button variant="outline" className="rounded-xl" onClick={() => router.push('/termos')}>Termos de Uso</Button>
              <Button variant="outline" className="rounded-xl" onClick={() => router.push('/privacidade')}>Privacidade</Button>
              <Button variant="outline" className="rounded-xl" onClick={async () => {
                const ok = confirm('Deseja excluir sua conta e dados? Esta ação é irreversível.')
                if (!ok) return
                const res = await deleteCurrentUserData()
                if (!res.ok) alert('Falha na exclusão: ' + (res.message || ''))
                else {
                  alert('Conta e dados excluídos.')
                  setShowMainMenu(false)
                }
              }}>Exclusão de Conta</Button>
              <Button variant="outline" className="rounded-xl" onClick={async () => {
                const res = await loginWithGoogle()
                if (!res.ok) alert('Falha no login: ' + (res.message || ''))
                else setShowMainMenu(false)
              }}>Login com Google</Button>
            </div>
          </div>
        </div>
      )}
      {showCnpjsModal && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-end">
          <div className="w-full rounded-t-[32px] bg-slate-900 border border-neutral-800 p-4 space-y-3">
            <div className="flex justify-between items-center">
              <div className="text-base font-semibold text-slate-50">CNPJs listadas {cnpjsYear ? `(${cnpjsYear})` : ''}</div>
              <Button variant="outline" onClick={() => { setShowCnpjsModal(false); setSelectedCnpj(null) }}>Fechar</Button>
            </div>
            <div className="text-xs text-slate-400">Se não souber o CNPJ, escolha o ano e filtre pelo nome.</div>
            <div className="space-y-2">
              <Input placeholder="Filtrar pelo início do nome" value={cnpjsFilter} onChange={e => setCnpjsFilter(e.target.value)} />
              <div className="h-1 w-full bg-neutral-800 rounded overflow-hidden">
                <div className="h-full bg-[#4169E1]" style={{ width: `${cnpjsProgress}%` }} />
              </div>
            </div>
            <div className="max-h-[50vh] overflow-y-auto space-y-2">
              {(() => {
                const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                const f = norm(cnpjsFilter || '')
                const list = cnpjsList
                  .filter(it => !f || norm(it.nome).startsWith(f))
                  .slice(0, 500)
                return list.length ? (
                  <div className="space-y-1">
                    {list.map((it, idx) => (
                      <button
                        key={`${it.cnpj}:${idx}`}
                        className={`w-full text-left rounded-xl p-3 ${selectedCnpj === it.cnpj ? 'bg-slate-800' : 'bg-slate-800/40'}`}
                        onClick={() => setSelectedCnpj(it.cnpj)}
                      >
                        <div className="text-sm text-slate-50">{it.nome || '—'}</div>
                        <div className="text-xs text-slate-400">{formatCNPJ(it.cnpj)}</div>
                      </button>
                    ))}
                  </div>
                ) : <div className="text-sm">Nenhum resultado.</div>
              })()}
            </div>
            <div className="flex gap-2">
              <Button className="bg-[#4169E1] hover:bg-blue-700 text-white rounded-xl" disabled={!selectedCnpj} onClick={() => {
                if (selectedCnpj) {
                  setCnpjInput(formatCNPJ(selectedCnpj))
                  setShowCnpjsModal(false)
                  setSelectedCnpj(null)
                }
              }}>
                Colar na busca principal
              </Button>
              <Button variant="outline" onClick={() => { setShowCnpjsModal(false); setSelectedCnpj(null) }}>Fechar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
