 'use client'
 
 import { useRouter } from 'next/navigation'
 import { Card, CardHeader, CardContent } from '../../components/ui/card'
 import { Button } from '../../components/ui/button'
 import { ArrowLeft } from 'lucide-react'
 
 export default function PrivacidadePage() {
   const router = useRouter()
   const url = 'https://sites.google.com/view/diligencego-privacy'
   return (
     <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
       <div className="flex items-center justify-between">
         <Button variant="outline" className="rounded-full" onClick={() => router.push('/')}>
           <ArrowLeft className="h-4 w-4" /> Voltar
         </Button>
         <Button className="rounded-full bg-[#4169E1] text-white" onClick={() => { try { window.open(url, '_blank') } catch {} }}>
           Abrir no navegador
         </Button>
       </div>
       <Card className="rounded-[32px] bg-slate-900 border-none shadow-2xl">
         <CardHeader>Política de Privacidade</CardHeader>
         <CardContent>
           <div className="rounded-2xl overflow-hidden border border-neutral-800">
             <iframe src={url} title="Política de Privacidade" className="w-full h-[70vh] bg-white" />
           </div>
         </CardContent>
       </Card>
     </div>
   )
 }
