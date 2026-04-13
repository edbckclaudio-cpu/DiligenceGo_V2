# LOGIC.md

Manual de voo do DiligenceGo. Este arquivo existe para orientar futuros Builders sobre o motor de busca, a integracao com a CVM, o modelo premium e os cuidados necessarios para manter um app em producao com usuarios reais.

## 1. Visao de Arquitetura

O projeto segue uma separacao pragmatica entre UI e motor:

- UI: `app/`
  - renderiza estado
  - dispara acoes do usuario
  - aplica travas visuais e de navegacao
- Motor: `lib/`
  - autentica
  - consulta
  - faz cache
  - interpreta CSVs
  - calcula secoes de exibicao
  - integra billing e persistencia premium

Fluxo principal da Home:

1. Usuario informa CNPJ e ano.
2. `app/page.tsx` chama `runConsultation()` em `lib/engine.ts`.
3. `lib/engine.ts` tenta `loadResult()` no cache local.
4. Se nao houver cache valido, o motor baixa o ZIP da CVM via `lib/downloader.ts`.
5. Os CSVs sao percorridos por `forEachCsvBlob()`.
6. `lib/csv.ts` filtra cada CSV pelo CNPJ.
7. O resultado bruto e agrupado e salvo no cache.
8. `lib/sections.ts` transforma os dados filtrados em visoes de negocio:
   - Resumo
   - Capital Social
   - Grupo Economico
   - Governanca
   - Remuneracao

## 2. Integracao CVM

### Fonte de dados

O app consome arquivos ZIP da CVM, especialmente:

- FRE:
  - `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/FRE/DADOS/fre_cia_aberta_<ano>.zip`
- DFP:
  - `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_<ano>.zip`

Uso atual:

- FRE:
  - consulta principal por CNPJ
  - abastece capital social, participacoes societarias, governanca, litigios e varias secoes auxiliares
- DFP:
  - usado no atalho/lista de CNPJs por ano para descobrir o CNPJ da companhia pelo nome

### Como o motor extrai informacao

O projeto nao depende de um schema unico e fixo. Em vez disso, usa heuristicas por nome de arquivo e por nome de coluna:

- `lib/sections.ts` normaliza nomes de colunas
- procura chaves equivalentes (`CNPJ_Companhia`, `CNPJ_Emissor`, `Nome`, `Razao_Social`, `Data_Referencia` etc.)
- escolhe a melhor coluna disponivel para cada secao

Esse desenho e importante porque os CSVs da CVM podem variar por ano e por tipo de formulario.

### Exemplo pratico: companhias como Alpargatas

Para companhias listadas como Alpargatas, o fluxo de sucesso costuma ser:

1. Buscar o CNPJ pela lista de companhias da CVM (DFP) quando o usuario nao sabe o CNPJ.
2. Consultar o FRE do ano escolhido.
3. Filtrar todos os CSVs pelo CNPJ.
4. Montar as secoes:
   - Capital Social a partir de arquivos com `capital_social`
   - Grupo Economico a partir de `participacao_sociedade`
   - Governanca a partir de `responsavel`, `administrador`, `conselho`, `diretoria`, `acionista`
   - Remuneracao a partir de arquivos contendo `remuneracao`

Se a companhia existe na base e os CSVs daquele ano contem as colunas mapeadas, a UI renderiza as abas automaticamente.

## 3. Cache e Performance

### Cache de consultas

O cache local vive em `lib/cache.ts` e usa IndexedDB:

- banco: `diligencego`
- store: `results`
- chave: `CNPJ:ANO`

O pipeline em `lib/engine.ts` faz:

1. `clearOld(7)` para remover entradas antigas
2. `loadResult(key)` antes de baixar novamente
3. `saveResult(key, data)` ao concluir a consulta

### Beneficios

- evita baixar o mesmo ZIP repetidamente
- reduz latencia percebida
- protege a CVM de chamadas desnecessarias
- melhora a experiencia em redes moveis

### Diagnostico

`runConsultation()` retorna `diag`, que informa:

- bytes baixados
- quantidade de CSVs processados
- quantidade de linhas do CNPJ
- origem (`web-proxy`, `web-direct`, `android-file`, `android-request`)
- se veio do cache
- metadados de HEAD e erros

## 4. Seguranca e Blindagem

### Anti-screenshot

No Android, a `MainActivity` ativa:

- `WindowManager.LayoutParams.FLAG_SECURE`

Isso bloqueia:

- screenshot
- gravacao de tela
- preview do app em alguns contextos do sistema

Essa protecao e relevante porque o app expoe dados premium e consolidacoes de inteligencia.

### Login Google + Supabase

O login esta em `lib/auth.ts`.

Fluxo:

1. Detecta se esta no web ou no Android nativo.
2. Em web:
   - inicializa `GoogleAuth`
   - faz `signIn()`
   - troca `idToken` por sessao via `supabase.auth.signInWithIdToken()`
3. Em Android:
   - tenta `GoogleAuth.signIn()`
   - se falhar, cai para `supabase.auth.signInWithOAuth()`
   - usa deep link `com.diligencego.app://auth-callback`

Builder note:

- o modulo de autenticacao deve continuar em `lib/auth.ts`
- evite colocar logica de OAuth diretamente em componentes

### Billing blindado

O billing vive em `lib/billing.ts`.

Ponto critico:

- existe um comentario de protecao no fluxo de inicializacao:
  - `// CRITICAL: CORE ENGINE & BILLING - DO NOT MODIFY FLOW`

Regras do fluxo:

1. esperar o store existir
2. ouvir `deviceready`
3. aguardar 5s
4. registrar o produto uma unica vez
5. inicializar o store uma unica vez
6. chamar `store.update()` somente dentro do `store.ready()`

Essa ordem existe porque chamadas prematuras ou repetidas ao `store.update()` causaram travamentos reais em producao.

## 5. Modelo de Negocio

### Estado premium real

O app usa `Supabase` como fonte da verdade para premium:

- tabela `profiles.subscription_status`
- metadado do usuario `is_premium`

Quando uma compra e aprovada no billing:

- o `billing.ts` atualiza `profiles.subscription_status = 'premium'`
- tambem persiste `is_premium: true` nos metadados do usuario

Na Home, a UI consulta esse estado para liberar:

- compartilhamento
- abas premium
- coroa visual

### Abas premium

Estado atual do codigo:

- `Governanca`: bloqueada na UI quando `!isPremium`
- `Remuneracao`: bloqueada na UI quando `!isPremium`

Observacao importante:

- apesar de pedidos anteriores mencionarem "Grupo Economico" como premium em alguns ciclos, o bloqueio atualmente implementado no codigo da Home esta concentrado em Governanca e Remuneracao.
- sempre documente e evolua com base no codigo atual, nao em memorias de versoes antigas.

### 3 buscas gratuitas

Estado atual do repositorio:

- nao existe, neste momento, uma implementacao completa e ativa de contador de 3 buscas gratuitas.
- existe apenas um vestigio de freemium em `app/login/page.tsx` (`localStorage.setItem('DG_PREMIUM', 'freemium')`), mas ele nao governa a Home nem substitui a regra principal de premium via Supabase.

Se o time decidir reintroduzir o contador, a recomendacao e:

1. armazenar contagem por usuario autenticado no Supabase
2. decrementar somente em consulta concluida com sucesso
3. manter `profiles.subscription_status` como verdade para premium
4. nao misturar contador em localStorage como regra principal

## 6. Home e Navegabilidade

### Atalho CVM

O atalho "Ver CNPJs listadas na CVM" existe para reduzir friccao quando o usuario nao conhece o CNPJ da empresa.

Fluxo:

1. abrir seletor de ano
2. baixar o DFP do ano
3. listar CNPJs e nomes
4. permitir filtro por nome
5. preencher a consulta a partir da selecao do usuario

Esse fluxo e particularmente util para companhias amplamente conhecidas no mercado, como Alpargatas, em que o usuario reconhece o nome antes do CNPJ.

## 7. Regras para Futuras Alteracoes

### Nunca faca sem revisar

- fluxo de inicializacao do billing
- listeners de `deviceready` e `store.ready()`
- persistencia premium no Supabase
- protecao `FLAG_SECURE`
- camada de cache de consulta

### Preferencias arquiteturais

- UI deve consumir servicos de `lib/`
- regras de negocio devem ficar fora de componentes sempre que possivel
- logs de producao devem ser minimos; diagnosticos detalhados devem ir para o Painel Secreto

### Checklist antes de publicar

1. `npm run typecheck`
2. `npm run build`
3. `npx cap sync android`
4. `./gradlew.bat bundleRelease`
5. validar `versionCode` e `versionName`
6. validar assinatura do bundle
7. testar login, consulta CVM, abas premium e compra

