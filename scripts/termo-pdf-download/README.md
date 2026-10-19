# Termo de entrega — PDF binário autenticado (baseline 6493e1ee)

Candidata **não aplicada**: o runtime do repositório (HEAD) continua idêntico a `6493e1ee`. Nada de Edge, SQL,
frontend ou publicação foi implantado. Arquivos em `candidate/` espelham os caminhos finais.

## Preflight (achados)
- Edge local `entrega-termo-pdf` importa `esm.sh/@supabase/supabase-js@2.45.0` (auth-js 2.64.4), que **não tem
  `auth.getClaims`**. `deno check` da fonte local falha com `TS2339 getClaims`; em runtime isso vira TypeError → 500
  `erro_interno` em `generate` e `signed_url`. Não foi confirmado contra a LIVE (hash/fonte LIVE não capturados aqui).
- `signed_url` assina `entrega-termos` por 120 s com service role e o painel abre com `window.open`.
- Bucket `entrega-termos`: nenhuma policy de leitura ao usuário foi aberta nem é necessária.

## Mudança
- **Edge** (`npm:@supabase/supabase-js@2.110.8`, mesma versão do frontend): `getUser` (verificação viva no Auth) no
  lugar de `getClaims`. Nova `action:"download"` devolve `application/pdf`, com `Cache-Control: private, no-store`,
  depois de provar: perfil próprio ativo, sem senha provisória e com tenant (token do usuário); termo visível sob RLS;
  termo assinado, não cancelado, não substituído, com `pdf_path` e `pdf_hash`. Os bytes são lidos pelo serviço
  **somente depois** dessa prova. O hash SHA-256 precisa bater, e a prova completa é **refeita antes da resposta**
  (com path e hash iguais aos iniciais). Há prazo de 15 s, limite de 15 MiB, nenhum evento de comunicação e nenhuma URL.
- `action:"signed_url"` → **410** `signed_url_desativada`, sem tocar no Storage. Ação desconhecida → 400 (antes caía
  em `generate`). Sem `action` → `generate`. O `generate` idempotente fica igual (replay, hash, registro, evento existente).
- **Frontend**: `TermoEntregaPanel` passa a ter "Preparar termo assinado" e depois "Baixar termo assinado" (novo
  clique), usando o `useAuthenticatedAttachmentOpener` existente. O hook só ganhou um `load` opcional; sem ele, o
  comportamento dos demais consumidores é byte-equivalente. Recurso = snapshot (entrega, termo, versão, status,
  pdf_path, pdf_hash). Mudança de tenant/papéis/época/lease/logout ou do termo aborta o pedido e revoga o Blob.
  `downloadTermoPdf` só aceita UUID e Blob com magic `%PDF-`; erro neutro e releitura do termo.
  Sem `window.open`, sem URL assinada e sem fallback.

## Compatibilidade consciente
Clientes antigos (bundle atual) recebem 410 no download e veem o erro genérico; ninguém recebe URL portadora.
Ordem recomendada: **Edge primeiro, depois frontend**. A Edge antiga trataria `download` como `generate`: o PDF já
existe, então seria replay sem evento e o frontend novo falharia fechado (não é PDF).

## Pré-requisitos para implantar (dependem da revisão independente)
1. Capturar a fonte/hash da Edge LIVE `entrega-termo-pdf` e comparar com o `pre` do manifesto. Se divergir, parar.
2. Confirmar na produção, em modo somente leitura, as colunas `profiles.user_id/ativo/senha_provisoria/organization_id`
   e `entrega_termos.cancelado_em/substitui_termo_id/pdf_hash`. Confirmar também que o usuário lê o próprio perfil sob RLS.
3. Implantar a Edge, depois `python3 apply.py` (preflight) / `--apply` para o frontend, e então publicar.
4. Homologação real A/B: um termo assinado existente (não assinar termo real para testar), negação cross-tenant,
   papel retirado/lease vencida, termo cancelado/substituído. Nenhum evento de comunicação deve ser disparado.

## Evidências locais (cópia isolada em /tmp com a candidata aplicada; Auth/Edge/Storage simulados ≠ JWT/RLS real)
- `termoPdfEdge.test.ts` 16/16: happy path com hash, 410, ação inválida, 401, RLS cross-tenant, perfil
  inativo/provisório/sem tenant, cancelado, substituído, hash divergente, hash ausente, revogação/perfil/cancelamento/
  substituição/troca de PDF **durante** o download, replay `generate` sem evento.
- `termoPdfDownload.test.tsx` 12/12 (componente e hook reais): happy path em duas etapas, erro neutro, resposta não-PDF,
  tenant/papéis/época durante o preparo (abort + descarte tardio), lease vencida antes/depois, revogação do Blob por
  papel/logout/termo cancelado, `generate` preservado e nenhum `signed_url`/`window.open`.
- Suítes entregas + equipe-tecnica + clientes + authzV6.edges: 30 arquivos, 403/403.
- `tsgo` app EXIT 0, node EXIT 0; `deno check` da Edge candidata OK (a baseline falha em `getClaims`).
- `apply.py` → `rollback.py --apply` em cópia isolada: byte-exato a `6493e1ee`.

## Rollback
`python3 rollback.py [raiz]` (preflight) / `--apply`. Restaura os bytes de 6493e1 e remove os arquivos novos. Isso
reintroduz `signed_url` 120 s e o `getClaims` incompatível. Para a Edge, reimplantar a fonte `baseline/`.
