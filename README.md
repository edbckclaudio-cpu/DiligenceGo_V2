# DiligenceGo (DiligenceGo_V2)

App de Inteligencia para Diligencia Corporativa e Compliance, com foco em consulta rapida de dados publicos (CVM) por CNPJ, exibicao em abas e exportacao/compartilhamento para uso em reunioes.

## Status de Producao

- App ativo na Google Play Store: https://play.google.com/store/apps/details?id=com.diligencego.app
- Documentacao web (GitHub Pages do repositorio): https://edbckclaudio-cpu.github.io/DiligenceGo_V2/

## Stack Tecnica

- Frontend: Next.js (App Router) + React + Tailwind CSS
- Mobile: Capacitor (Android)
- Autenticacao e DB: Supabase (Auth + tabela `profiles`)
- Dados abertos: CVM (ZIPs com CSVs de formularios estruturados)
- Billing: cordova-plugin-purchase (CdvPurchase / Google Play Billing)

## Estrutura do Projeto (alto nivel)

- `app/`: rotas Next.js
  - `app/page.tsx`: Home (consulta CVM + UI principal + travas premium na interface)
  - `app/login/page.tsx`: login Google via Supabase
  - `app/perfil/page.tsx`: Perfil + assinaturas + "Painel Secreto" (diagnostico)
- `lib/`: motor de dados e integracoes
  - `lib/engine.ts`: pipeline de consulta (cache -> download -> parse -> persist)
  - `lib/downloader.ts`: download (web fetch / Android HTTP nativo) + unzip
  - `lib/csv.ts`: parse de CSV e filtro por CNPJ
  - `lib/sections.ts`: transformacoes para abas (Resumo, Capital, Governanca, Remuneracao, Grupo Economico)
  - `lib/cache.ts`: cache local (IndexedDB) por chave `CNPJ:ANO`
  - `lib/auth.ts`: login com Google (web/nativo) + Supabase Auth
  - `lib/billing.ts`: integracao com billing (Google Play) + persistencia premium no Supabase

Para uma explicacao de arquitetura e logica de negocio, veja `LOGIC.md`.

## Regras de Negocio (resumo)

- O app consulta dados publicos por CNPJ e exibe em abas.
- Premium:
  - Abas Premium sao bloqueadas na UI quando `isPremium === false` (ex.: Governanca/Remuneracao).
  - Compartilhamento (Email/WhatsApp) tambem e bloqueado para nao-premium.
  - A condicao `isPremium` e derivada do Supabase (`profiles.subscription_status`) e metadados do usuario.
- Anti-screenshot:
  - No Android, o app ativa `FLAG_SECURE` na `MainActivity` para bloquear captura e gravacao de tela.

Observacao importante: este repositorio ja teve experimentos de "Freemium/3 buscas" em outros ciclos. O estado atual do codigo deve ser considerado a fonte da verdade.

## Configuracao e Instalacao

### Pre-requisitos

- Node.js LTS
- Android Studio + SDK (para build Android)
- Java (JDK) conforme exigido pelo Gradle/AGP do projeto

### Variaveis de ambiente

Este projeto usa `NEXT_PUBLIC_*` para configuracao no frontend.

Exemplos (ajuste para o seu ambiente):

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL="https://<seu-projeto>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<sua_anon_key>"

# Google OAuth (caso use login web)
NEXT_PUBLIC_GOOGLE_CLIENT_ID="<seu_client_id>"

# Produto do billing (Google Play)
NEXT_PUBLIC_BILLING_PRODUCT_ID="renovaauto"
```

Notas:

- `lib/supabase.ts` contem valores padrao/hardcoded e pode ser ajustado conforme estrategia do time.
- Em modo Android (Capacitor), o login pode usar deep link `com.diligencego.app://auth-callback`.

### Comandos principais

```bash
# instalar dependencias
npm ci --legacy-peer-deps

# checagem TypeScript
npm run typecheck

# build web (gera /out para o Capacitor)
npm run build

# sincronizar assets com Android
npx cap sync android

# gerar bundle AAB release (assinado, se signingConfig estiver configurado)
cd android
./gradlew.bat bundleRelease
```

### Onde o AAB e salvo

O arquivo gerado fica em:

`android/app/build/outputs/bundle/release/app-release.aab`

O nome do arquivo nao muda por versao; a versao fica dentro do bundle (versionCode/versionName).

## Dicas para "Builders"

- Evite mexer no fluxo de inicializacao do billing sem entender o motivo do delay e do `store.update()` ser chamado apenas no `store.ready()`.
- Priorize alteracoes no "motor" em `lib/` e mantenha a UI como consumidora (sem efeitos colaterais).

