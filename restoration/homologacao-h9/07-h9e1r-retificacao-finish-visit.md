# H9-E1R — Retificação do encerramento de visita técnica

Ambiente: **homologação `ikaauvsflpmamgxmkhoq`**.
Produção `navfzbwgwzruipouyfnk` e Sandbox `yzszlzjpovmcteuxjznj`: **não acessados**.
Ledger: **677 → 678**, migration `20261022000000`, ocorrência única.
Objeto único: `public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid)`
— OID `24597`, owner `postgres`, `SECURITY DEFINER`, `search_path=public`,
ACL `postgres=X, authenticated=X, service_role=X` (sem `PUBLIC`, sem `anon`).

## 1. Diagnóstico e causa-raiz

A evidência independente que invalidou o GO anterior foi **confirmada no banco vivo**, não
apenas no texto. Três defeitos:

| # | Defeito | Causa-raiz |
|---|---------|-----------|
| D1 | Oráculo de existência | O corpo autenticava `auth.uid()` e em seguida executava `SELECT * FROM public.registros_consultor` **antes** de qualquer prova de escopo. UUID inexistente caía no ramo `registro_not_found` (`22023`); registro real alheio caía em `not_visit_owner` (`42501`). Duas superfícies observáveis distintas permitiam enumerar registros de terceiros. |
| D2 | Semântica de check-out | O encerramento inseria `tipo_checkin='inicio_visita'`. `can_checkout_technical_visit`, `has_completed_visit_presence`, `rpc_realizar_checkout_visita` e os consumidores do app (`lib/offlineCheckinQueue.ts`, `components/visita/PresencaCheckoutButton.tsx`, `components/visita/roteiro/useRoteiroEventos.ts`) detectam ciclo fechado **apenas** por `tipo_checkin='checkout'`. O ciclo ficava aberto após finalizar. |
| D3 | Idempotência ausente | `p_client_uuid` era gravado sem tratamento. Duplo clique colidia com o índice único parcial `visitas_checkin_client_uuid_uq` (`23505`) ou, após a finalização, devolvia `visit_not_in_progress`. Corrida não era serializada. |

**Causa-raiz da falha de auditoria:** o lote H9-D-L1 classificou a assinatura como
`AUTH_COMPROVADA` com a justificativa de que "a guarda precede qualquer leitura". A leitura do
corpo real desmente a justificativa. O falso positivo está retificado, não removido.

## 2. Correção aplicada

Forward: `restoration/homologacao-h9/h9e-forwards/20261022000000_h9e1r_finish_visit_scope_checkout_idempotency_v1.sql`
Rollback: `restoration/homologacao-h9/h9e-rollbacks/20261022000000_h9e1r_finish_visit_scope_checkout_idempotency_v1_rollback.sql`

1. **Autorização antes da leitura.** Após validar `auth.uid()`, resolve
   `public.has_role(uid,'administrador')` e exige
   `public._visita_scope_ok(v_uid, p_registro_id)` — helper existente, `SECURITY DEFINER`,
   `search_path=public`, executável apenas por `postgres`/`service_role`, fail-closed em `NULL`
   via `COALESCE(...,false)`. É o **mesmo modelo já adotado por
   `rpc_realizar_checkout_visita`**; não há fluxo paralelo nem permissão nova.
   Registro inexistente, registro alheio e `p_registro_id NULL` convergem para
   `42501 / not_visit_owner`.
2. **Check-out canônico.** A inserção passa a usar `'checkout'::public.tipo_checkin`.
3. **Idempotência e concorrência**, sempre **depois** do gate de escopo: busca por
   `client_uuid`, conflito fail-closed `22023 idempotency_conflict`,
   `SELECT ... FOR UPDATE` no registro e captura de `unique_violation` que converge para o
   vencedor da corrida.

**Preservados:** nome, assinatura, `RETURNS TABLE(registro_id, checkout_id, finalized_at)`,
owner, ACL, `SECURITY DEFINER`, `search_path` fixo, exigência de status `em_andamento`,
exigência de ao menos um diagnóstico, exigência de `problema_principal` (trigger),
auditoria em `visitas_logs`, OID `24597`.

Fingerprints (`md5(pg_get_functiondef)`): **pré `1a23e69ad1909af5b6021d81fb9ed918` →
pós `20515c14cf017e68bebc8f99ba3cd00a`**. O rollback restaura o fingerprint pré **byte a byte**
(verificado em ensaio) e **não foi executado** fora do ensaio.

SHA-256 — forward `fa75cd1a98ad9004bcbb3b98125e6087d55766030f4148cbb70672c9455066ce`;
rollback `2d83629bdd56da20a4c95dc2efd83791406456e108ccfc0d0e93c52eb65ad1e9`.

## 3. Provas (transação integralmente revertida)

Script: `restoration/homologacao-h9/h9e-provas/h9e1r-prova-finish-visit.sql`.
Ensaio: fingerprint pré → forward → provas → rollback → fingerprint pré restaurado.
Identidades reais: dono `77905960…`, administrador `b5c2ebd4…`, sem escopo `7c04c4d1…`.

| Caso | Antes | Depois |
|------|-------|--------|
| 01 não autenticado | `28000 unauthenticated` | `28000 unauthenticated` |
| 02 UUID inexistente | **`22023 registro_not_found`** | **`42501 not_visit_owner`** |
| 03 registro alheio real | `42501 not_visit_owner` | `42501 not_visit_owner` |
| 04 dono legítimo | finaliza | finaliza |
| 05 duplo clique (mesmo `client_uuid`) | `22023 visit_not_in_progress:finalizado` | **mesmo `checkout_id`, sem novo evento** |
| 06 reuso conflitante do `client_uuid` | `22023 diagnostico_required` | **`22023 idempotency_conflict`** |
| 07 estado incompatível | `22023 visit_not_in_progress:rascunho` | idem |
| 08 sem diagnóstico | `22023 diagnostico_required` | idem |
| 09 sem `problema_principal` | `23514` (trigger) | idem |
| 10 administrador legítimo | finaliza | finaliza |
| 11 tipos gravados | `chegada_fazenda=2 inicio_visita=2` | **`checkout=2 chegada_fazenda=2`** |
| 12 check-out do encerramento | `checkout=0 inicio_visita=2` | **`checkout=2 inicio_visita=0`** |
| 13 consumidores de ciclo | `can_checkout=t`, `presenca_completa=f` (**ciclo aberto**) | **`can_checkout=f`, `presenca_completa=t` (ciclo fechado)** |
| 14 `anon` | `42501 permission denied` | `42501 permission denied` |

**02 e 03 passam a ser indistinguíveis** — mesmo SQLSTATE, mesma mensagem, mesma superfície.
**Resíduo zero** verificado após o ensaio e após a aplicação: nenhuma linha `H9E1R%` em
`registros_consultor`, `visitas_checkin` ou `technical_visit_assignments`.

Contrato de retorno inalterado: os casos 04, 05 e 10 consomem
`(registro_id, checkout_id, finalized_at)` sem adaptação.

## 4. Dados históricos

`public.visitas_checkin` contém **77 linhas, todas `chegada_talhao`**; **zero** linhas
`inicio_visita` e **zero** `checkout`. Nenhuma linha foi criada pela versão defeituosa da RPC.
Portanto: **nenhuma correção histórica aplicada** — não há reclassificação por heurística.

## 5. Rastreabilidade e artefatos

- `restoration/homologacao-h9/h9c-applied-forwards.json`: 18 entradas, ledger 678, hashes reais.
- `restoration/homologacao-h7/h7p-repo-only-manifest.json`: ledger 678, **59 migrations
  repo-only intactas em quarentena** (nenhuma aplicada).
- Inventário H9-D retificado em `secdef-authenticated-inventory-h9d.tsv` e
  `classificacao-h9d.tsv`: `AUTH_COMPROVADA` → `EXPOSICAO_COMPROVADA_CORRIGIDA`, com a
  descrição explícita do falso positivo. Evidência histórica preservada em `dossie-l1.json`.
- `resumo-h9d.json`: **376 = 84 herdadas + 292 do escopo profundo
  (256 AUTH_COMPROVADA + 32 CORRIGIDAS + 4 NAO_APLICAVEL + 0 PENDENTES)**, com o bloco
  `retificacoes` declarando origem e destino da mudança.
- Adendo no dossiê `06-h9e1-convergencia-fluxo-visita.md` corrigindo as conclusões falsas
  sem apagar o texto original.
- Gate estático novo: `src/test/security/h9e1r-finish-visit.static.test.ts`.

## 6. Riscos remanescentes

1. **Concorrência multiessão não medida (UNVERIFIED).** O duplo clique sequencial está provado.
   Duas sessões simultâneas exigiriam fixtures commitadas em homologação, o que violaria a
   exigência de resíduo zero. A serialização é sustentada pelo `SELECT ... FOR UPDATE` mais o
   índice único `visitas_checkin_client_uuid_uq` com tratamento de `unique_violation` — é
   raciocínio sobre o código, **não** medição.
2. `_visita_scope_ok` é mais amplo que a checagem anterior por `consultor_responsavel`:
   participantes ativos e `created_by` passam a encerrar a visita. É **convergência deliberada**
   com `rpc_realizar_checkout_visita`, que já concede esse acesso, mas amplia a superfície desta
   RPC específica em relação ao comportamento anterior.
3. Continua sem callsite direto de `start_/finish_technical_visit_secure` em `src/` ou Edge
   Functions; o app usa `rpc_realizar_checkin_visita` / `rpc_realizar_checkout_visita`. Ligar a
   UI ao fluxo seguro exige lote próprio.
4. `rpc_realizar_checkout_visita` ainda consulta `client_uuid` **antes** do gate de escopo
   (mesma classe de D1, em grau menor: o vazamento é sobre um `client_uuid` que o chamador já
   possui). Fora do escopo deste lote; registrado para o próximo.
5. `.env` volta a apontar para o Sandbox a cada regeneração da plataforma. Ocorreu **uma vez**
   neste lote, foi revertido antes de qualquer comando, e o Sandbox **não** foi acessado.
6. Advisors gerenciados seguem sem medição própria por mim — a ferramenta disponível pode
   atingir outro projeto. Valores de referência externos: segurança 390, performance 507.

## 7. Decisão

- **H9-E1R: GO em homologação** — migração aplicada exatamente uma vez, ledger 678,
  autorização antes da leitura comprovada, alheio e inexistente indistinguíveis, check-out
  canônico gravado, idempotência provada, inventário e dossiês retificados, sem regressão.
- **Promoção para produção: NO-GO** — riscos 1, 2 e 4 abertos e H9-E não concluída.
- Lote encerrado aqui. Nenhum lote seguinte iniciado.
