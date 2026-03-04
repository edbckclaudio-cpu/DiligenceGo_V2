import './globals.css?v=1'
import type { ReactNode } from 'react'
import AppUrlHandler from './AppUrlHandler'
import CordovaLoader from './CordovaLoader'

export const metadata = {
  title: 'DiligenceGo',
  description: 'Análise local de dados CVM por CNPJ'
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark bg-slate-950">
      <body className="min-h-screen bg-slate-950 text-white pt-safe pb-safe">
        <div className="flex flex-col min-h-screen">
          <CordovaLoader />
          <AppUrlHandler />
          <header className="border-b border-neutral-800">
            <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between">
              <span className="font-semibold">DiligenceGo</span>
            </div>
          </header>
          <main className="flex-1">
            {children}
          </main>
          <footer className="border-t border-neutral-800">
            <div className="mx-auto max-w-2xl px-4 py-4 text-[11px] leading-relaxed text-neutral-400 pb-safe">
              <p>O DiligenceGo é uma ferramenta independente e não possui vínculo com a Comissão de Valores Mobiliários (CVM). Os dados são extraídos do Portal de Dados Abertos oficial.</p>
              <p className="mt-1">Privacidade: processamento 100% local. O CNPJ consultado nunca é enviado a servidores externos.</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}
