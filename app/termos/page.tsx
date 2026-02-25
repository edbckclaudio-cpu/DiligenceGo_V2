 'use client'
 
 import { useRouter } from 'next/navigation'
 import { Card, CardHeader, CardContent } from '../../components/ui/card'
 import { Button } from '../../components/ui/button'
 import { ArrowLeft } from 'lucide-react'
 
 export default function TermosPage() {
   const router = useRouter()
   return (
     <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
       <div className="flex items-center justify-between">
         <Button variant="outline" className="rounded-full" onClick={() => router.push('/')}>
           <ArrowLeft className="h-4 w-4" /> Voltar
         </Button>
       </div>
       <Card className="rounded-[32px] bg-slate-900 border-none shadow-2xl">
         <CardHeader>Termos de Uso</CardHeader>
         <CardContent>
          <div className="space-y-4 text-sm text-slate-100">
            <div className="space-y-2">
              <div className="font-semibold">Objeto</div>
              <div>O DiligenceGo é uma ferramenta de consulta de dados públicos societários.</div>
            </div>
            <div className="space-y-2">
              <div className="font-semibold">Isenção de Responsabilidade</div>
              <div>O app não representa entidades governamentais e os dados são obtidos diretamente de fontes públicas (CVM/PNCP).</div>
            </div>
            <div className="space-y-2">
              <div className="font-semibold">Uso Aceitável</div>
              <div>O usuário se compromete a não utilizar as informações para fins ilícitos.</div>
            </div>
            <div className="space-y-2">
              <div className="font-semibold">Limitação de Danos</div>
              <div>O desenvolvedor não se responsabiliza por decisões de investimento baseadas nos dados consultados.</div>
            </div>
            <div className="space-y-2">
              <div className="font-semibold">Suporte</div>
              <div>Contato via licitmasa_suporte@proton.me.</div>
            </div>
          </div>
         </CardContent>
       </Card>
     </div>
   )
 }
