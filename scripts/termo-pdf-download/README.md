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
  (com path e hash iguais aos iniciais). Prazo real de 15 s para Auth, provas e bytes: o sinal é repassado ao transporte (PostgREST `abortSignal`, `fetch` do Storage autenticado) e toda espera é limitada por corrida com o sinal, então consulta/transporte pendurado não segura a resposta (504). Bytes lidos em stream com teto de 15 MiB (Content-Length acima → 413 sem ler; excedeu no meio → cancela). `pdf_path` precisa ser `<entrega>/<termo>/vN/termo-<uuid>.pdf` do próprio termo. Nenhum evento de comunicação e nenhuma URL.
- **Tenant explícito** (`provarTenant`, em toda prova e também no `generate`): o perfil ativo e o tenant canônico
  `h15_actor_organization()` (lido com o token do usuário) precisam coincidir. Além disso, a `entregas.organization_id`
  e o `clientes.organization_id` do termo precisam ser desse tenant, e a entrega tem de ter cliente. Isso é checado
  antes de qualquer status (outro tenant recebe só 403, sem saber se o termo foi cancelado) e refeito antes dos bytes;
  se o tenant mudar entre as duas provas, nega. Motivo: a policy `entrega_termos_select` libera staff sem comparar
  tenant. Ver `RLS-DEFECT-entrega_termos.md`: o defeito da REST **continua aberto** e não é fechado por esta Edge.
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
2. Confirmar em modo somente leitura que `h15_actor_organization()` retorna o tenant esperado com JWT real A e B
   (ACL atual: authenticated EXECUTE). Confirmar as colunas `entregas.organization_id/cliente_id` e
   `clientes.organization_id` (existem, conforme leitura de 19/10). Confirmar também as colunas `profiles.user_id/ativo/senha_provisoria/organization_id`
   e `entrega_termos.cancelado_em/substitui_termo_id/pdf_hash`. Confirmar também que o usuário lê o próprio perfil sob RLS.
3. Implantar a Edge, depois `python3 apply.py` (preflight) / `--apply` para o frontend, e então publicar.
4. Homologação real A/B: um termo assinado existente (não assinar termo real para testar), negação cross-tenant,
   papel retirado/lease vencida, termo cancelado/substituído. Nenhum evento de comunicação deve ser disparado.

## Evidências locais (cópia isolada em /tmp com a candidata aplicada; Auth/Edge/Storage simulados ≠ JWT/RLS real)
- `termoPdfEdge.test.ts` 25/25. Inclui staff A visível sob RLS contra termo B (entrega B, cliente B, entrega sem
  cliente, entrega inexistente, tenant canônico diferente do perfil ou ausente) → 403 sem Storage; cancelado de B → 403;
  tenant mudando durante o download → 403; `generate` de B → 403 sem upload/registro/evento. Também cobre: happy path com hash, 410, ação inválida, 401, RLS cross-tenant, perfil
  inativo/provisório/sem tenant, cancelado, substituído, hash divergente, hash ausente, revogação/perfil/cancelamento/
  substituição/troca de PDF **durante** o download, replay `generate` sem evento.
- `termoPdfDownload.test.tsx` 12/12 (componente e hook reais): happy path em duas etapas, erro neutro, resposta não-PDF,
  tenant/papéis/época durante o preparo (abort + descarte tardio), lease vencida antes/depois, revogação do Blob por
  papel/logout/termo cancelado, `generate` preservado e nenhum `signed_url`/`window.open`.
- Suítes entregas + equipe-tecnica + clientes + authzV6.edges: 30 arquivos, 412/412.
- `tsgo` app EXIT 0, node EXIT 0; `deno check` da Edge candidata OK (a baseline falha em `getClaims`).
- `apply.py` → `rollback.py --apply` em cópia isolada: byte-exato a `6493e1ee`.

## Rollback
`python3 rollback.py [raiz]` (preflight) / `--apply`. Restaura os bytes de 6493e1 e remove os arquivos novos. Isso
reintroduz `signed_url` 120 s e o `getClaims` incompatível. Para a Edge, reimplantar a fonte `baseline/`.

## Revisão 2 (prazo/stream reais)
- Edge: `deadline()` + `lerPdfLimitado()`; `admin.storage.download` (sem sinal) não é mais usado no download.
- Frontend `downloadTermoPdf`: `fetch` direto da Edge com token da sessão, sinal combinado (externo + 15 s),
  espera limitada em getSession/fetch/`reader.read`, teto no stream e `%PDF-`; sem `functions.invoke` (que lia o Blob inteiro).
- Testes: Edge 33/33 (Auth, consulta, Storage e stream pendurados que ignoram abort → 504; Content-Length/stream acima do teto
  → 413 com cancelamento; path de outro termo → 409). Frontend 17/17 (Edge que nunca responde, stream parado, tetos, abort externo).
  Suítes entregas+equipe-técnica+clientes 29 arquivos 420/420; tsgo app/node 0; `deno check` OK.
- Isolamento REST/RPC: candidata SQL separada em `scripts/entrega-termos-tenant/` (não aplicada).
