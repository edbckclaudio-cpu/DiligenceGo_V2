 'use client'
 
 import { useRouter } from 'next/navigation'
 import { Card, CardHeader, CardContent } from '../../components/ui/card'
 import { Button } from '../../components/ui/button'
 import { ArrowLeft } from 'lucide-react'
 
 export default function PrivacidadePage() {
   const router = useRouter()
   return (
     <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
       <div className="flex items-center justify-between">
         <Button variant="outline" className="rounded-full" onClick={() => router.push('/')}>
           <ArrowLeft className="h-4 w-4" /> Voltar
         </Button>
       </div>
       <Card className="rounded-[32px] bg-slate-900 border-none shadow-2xl">
         <CardHeader>Política de Privacidade</CardHeader>
         <CardContent>
          <div className="space-y-4 text-sm text-slate-100">
            <div className="text-xs text-slate-400">Última atualização: 25 de fevereiro de 2026</div>
            <div className="space-y-2">
              <div className="font-semibold">1. Informações Gerais</div>
              <div>O aplicativo DiligenceGo foi desenvolvido para facilitar a consulta de dados públicos societários. Esta política explica como lidamos com as informações.</div>
            </div>
            <div className="space-y-2">
              <div className="font-semibold">2. Coleta de Dados</div>
              <div>O DiligenceGo não coleta dados pessoais sensíveis sem o seu consentimento. O app realiza consultas a bases de dados públicas (como CVM e PNCP) e processa essas informações localmente ou via serviços de nuvem seguros para exibição ao usuário.</div>
            </div>
            <div className="space-y-2">
              <div className="font-semibold">3. Isenção de Responsabilidade Governamental</div>
              <div>O DiligenceGo é uma ferramenta independente e não possui vínculo oficial, patrocínio ou autorização de entidades governamentais. Os dados apresentados são de domínio público, obtidos legalmente através de fontes oficiais de transparência.</div>
            </div>
            <div className="space-y-2">
              <div className="font-semibold">4. Segurança</div>
              <div>Empregamos medidas de segurança padrão da indústria para proteger qualquer informação processada, utilizando infraestrutura escalável e segura.</div>
            </div>
            <div className="space-y-2">
              <div className="font-semibold">5. Contato e Suporte</div>
              <div>Para dúvidas sobre esta política ou suporte técnico, entre em contato através do e-mail: licitmasa_suporte@proton.me</div>
            </div>
            <div className="space-y-2">
              <div className="font-semibold">6. Exclusão de Conta e Dados</div>
              <div>
                Para solicitar a exclusão definitiva da conta e dos dados, acesse a página dedicada:
                {' '}
                <a
                  href="/privacy.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-blue-300 underline underline-offset-4"
                >
                  /privacy.html
                </a>
              </div>
            </div>
            <div className="text-xs text-slate-400">© 2026 DiligenceGo - Inteligência Societária</div>
          </div>
         </CardContent>
       </Card>
     </div>
   )
 }
