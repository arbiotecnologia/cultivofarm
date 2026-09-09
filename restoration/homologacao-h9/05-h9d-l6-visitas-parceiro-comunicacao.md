# H9-D-L6 — Auditoria profunda de 30 assinaturas SECURITY DEFINER

Ambiente único de execução: **staging/homologação `ikaauvsflpmamgxmkhoq`**.
Produção `navfzbwgwzruipouyfnk`: não foi acessada, consultada, testada, alterada nem promovida.
Sandbox `yzszlzjpovmcteuxjznj`: não utilizado. `.env` e `src/integrations/supabase/client.ts`
permaneceram apontando exclusivamente para a homologação; `types.ts` não foi regenerado.

## Estado do ledger

| Item | Antes | Depois |
| --- | --- | --- |
| Versões no ledger | 672 | **673** |
| Última migration | 20261016000000 | **20261017000000** (ocorrência única) |
| SECDEF executáveis por `authenticated` / `anon` | 375 / 2 | 375 / 2 |
| SECDEF sem `search_path` fixo | 0 | 0 |
| Crons ativos | 1,2,5,8,9,18 | 1,2,5,8,9,18 |

As 59 migrations repo-only da H7P continuam em quarentena e ausentes do ledger.

## Método

Leitura integral de `pg_get_functiondef` das 30 assinaturas canônicas e de todos os helpers
transitivos no catálogo vivo (`_assert_visita_editavel`, `_visita_lock_and_check`,
`can_manage_technical_visit`, `can_view_technical_visit`, `is_active_visit_participant`,
`can_user_access_produto_etiqueta`, `is_delivery_staff`, `is_operational_staff`,
`get_user_partner_id`, `has_active_user_cliente_access`, `is_technical_visit_editable_status`).
ACL, owner, `proconfig`, volatilidade e OID lidos do catálogo. Callsites mapeados em `src/` e
`supabase/functions/`. Provas dinâmicas executadas na homologação com identidade `authenticated`
sem papel, comparando recurso real alheio contra UUID inexistente, sempre em transação revertida.
Regex serviu apenas como triagem — nenhuma classificação foi promovida por nome.

## Resultado das 30 decisões

- **26 AUTH_COMPROVADA**
- **4 EXPOSICAO_COMPROVADA_CORRIGIDA**: `rpc_realizar_checkin_visita`,
  `rpc_realizar_checkout_visita`, `rpc_upsert_diagnostico_visita`, `rpc_salvar_campo_visita`.

Detalhe por assinatura: `h9d-inventario/dossie-l6.json` e `h9d-inventario/decisoes-l6.json`.

### Exposição comprovada

As quatro funções alcançavam `_assert_visita_editavel` (ou liam `registros_consultor`) **antes**
de qualquer teste de escopo próprio. Para uma identidade sem escopo algum, o resultado era:

| Situação | Resposta anterior |
| --- | --- |
| UUID inexistente | `registro_nao_encontrado` (P0002) |
| Registro alheio em status editável | `sem_permissao` / `forbidden_visita` (42501) |
| Registro alheio já fechado | `visita_nao_editavel` (42501) |

Isto é um oráculo de existência (enumeração de `registros_consultor`) que ainda vazava o estado
do ciclo de vida de visitas de terceiros.

### Correção mínima aplicada

Forward único **20261017000000** (`h9dl6_authz_scoped_visit_writes_no_oracle_v1`):

1. Novo helper `public._visita_scope_ok(uuid,uuid)` — SECDEF, `search_path=public`, `EXECUTE`
   apenas para `service_role` (revogação explícita de PUBLIC, `anon` e `authenticated`, porque o
   schema `public` tem default privileges que concedem EXECUTE a esses papéis). O helper é a
   **união exata** dos caminhos legítimos já aceitos pelas quatro RPCs.
2. Gate `_visita_scope_ok` inserido imediatamente antes da primeira leitura da visita, reutilizando
   os códigos de erro que cada função já emitia (`forbidden_visita_nao_atribuido` no check-in e no
   checkout, `forbidden_visita` no diagnóstico, `sem_permissao` no campo).
3. `rpc_salvar_campo_visita` passa a autorizar antes de revelar inexistência; apenas quem já tem
   escopo global (administrador) continua recebendo `registro_nao_encontrado`.

Assinaturas, retornos, callsites, idempotência por `client_uuid` e regras de negócio preservados.

### Provas na homologação (identidade `authenticated` sem papel, transação revertida)

| Função | Registro real alheio | UUID inexistente |
| --- | --- | --- |
| `rpc_salvar_campo_visita` | 42501 `sem_permissao` | 42501 `sem_permissao` |
| `rpc_upsert_diagnostico_visita` | 42501 `forbidden_visita` | 42501 `forbidden_visita` |
| `rpc_realizar_checkin_visita` | 42501 `forbidden_visita_nao_atribuido` | 42501 `forbidden_visita_nao_atribuido` |
| `rpc_realizar_checkout_visita` | resposta idêntica | resposta idêntica |

Indistinguíveis em todos os casos. Resíduo zero: todas as provas mutantes rodaram em transação
revertida e o ledger permaneceu com ocorrência única de 20261017000000.

Ensaio de rollback + reaplicação executado em transação revertida, sem efeito no estado final.

## Pendências e riscos

1. `rpc_realizar_checkout_visita` continha defeito funcional **pré-existente e independente**:
   o predicado `WHERE client_uuid = p_client_uuid::text` comparava com a coluna `uuid`, produzindo
   `42883 operator does not exist: uuid = text`. A função falhava **fechada** (nada era lido ou
   escrito), portanto não era exposição de segurança e ficou fora do escopo corretivo da L6.
   **Resolvido na H9-D-L6R** pelo forward `20261018000000`: comparação tipada `client_uuid =
   p_client_uuid`, com assinatura, retorno, gate de escopo, auditoria, idempotência e transições
   preservados. Fingerprint vivo do checkout: `759eabc40273aa815319239cf23777a5` →
   `2b2cc2d7d51a37a515ef79823c28f690`.
2. `rpc_programar_os_v1` mantém `search_path = 'public', pg_temp`. Com `pg_temp` em última posição
   não há sombreamento de objetos de `public`; mantido como está por estar fora do escopo de
   correção da L6.
3. Advisors gerenciados do Supabase **não foram medidos por mim** nesta rodada: a ferramenta
   disponível poderia atingir outro projeto, o que é proibido. Registro, como referência
   fornecida externamente pelo solicitante (não como medição própria): segurança **390**, exatamente
   o baseline; performance **507**, com redução de 1 `unused_index` (188 contra 189) e demais
   categorias 172/146/1 — não é regressão. Em substituição, verifiquei o catálogo vivo da
   homologação (SECDEF `authenticated`/`anon` 375/2, zero SECDEF sem `search_path`,
   crons 1,2,5,8,9,18), idêntico ao baseline pós-L5.
4. Resta **1 assinatura PENDENTE_EVIDENCIA**: `start_technical_visit_secure(...)`, reservada para
   a H9-D-L7.

## Inventário derivado (376 linhas)

| Classificação | Antes (L5) | Depois (L6) |
| --- | --- | --- |
| AUTH_COMPROVADA | 231 | **257** |
| EXPOSICAO_COMPROVADA_CORRIGIDA | 26 | **30** |
| NAO_APLICAVEL | 4 | 4 |
| PENDENTE_EVIDENCIA | 31 | **1** |
| Herdadas H9-C (fora do escopo) | 84 | 84 |

Escopo profundo permanece em 292 e o universo bruto em 376.

## Gates

`src/test/security/h9dl6-scoped-visit-writes.static.test.ts` cobre a lista exata das 30
assinaturas, dossiê ↔ inventário, fingerprints vivos, hash forward/rollback no manifesto,
autorização escopada antes de leitura, `search_path` fixo, ausência de GRANT a PUBLIC/anon e
ausência de mensagens que sirvam de oráculo.

O gate foi ampliado na L6R para exigir a sequência `20261017000000` histórica + `20261018000000`
retificadora, a **ausência** de REVOKE explícito de `anon`/`authenticated` na 170, a **presença**
desse REVOKE na 180, a comparação UUID tipada no checkout, o rollback seguro quanto a ACL e o
ledger/manifesto/guard em **674** com hashes reais.

## H9-D-L6R — retificação de rastreabilidade, guard e defeito funcional

### Incidente de rastreabilidade (declarado, não escondido)

Após a aplicação e o registro **único** da versão `20261017000000`, o arquivo do forward foi
emendado com `REVOKE ALL ... FROM anon` / `FROM authenticated` sobre
`public._visita_scope_ok(uuid,uuid)` e o SQL foi **reexecutado sob a mesma versão**, sem novo
registro no ledger. Isso violou a imutabilidade da migration aplicada. A L6R:

- reconstituiu `20261017000000` no conteúdo histórico da **primeira** aplicação (apenas
  `REVOKE ... FROM PUBLIC` + `GRANT service_role`), com SHA recalculado
  `631cca50e9485023b52468b6fdfdcf82c099f8b4cb87af28bd2d0d88b22e63b3` e o incidente documentado na
  entrada 170 do manifesto;
- regularizou a revogação explícita de forma versionada e reversível pelo forward
  `20261018000000_h9dl6r_acl_and_checkout_uuid_fix_v1`
  (SHA `1a78989816193a10ec09a2ef374bbe12dbd1d5d4471fbc454bdcd82c030a863b`; rollback
  `2589aef21cd81009f3b6a83a6bafee4a3861bb65b05c7761da7c3ffe63445048`).

A versão 170 **não** foi reaplicada e **não** houve segunda inserção no ledger.

### Aplicação

Preflight em transação revertida, depois aplicação **única** no staging: ledger **673 → 674**,
ocorrência da versão 180 = 1, última migration `20261018000000`. Ensaio de rollback + reaplicação
feito somente dentro de transação revertida (checkout `759eabc4…` no rollback, `2b2cc2d7…` na
reaplicação, ACL do helper inalterada, ledger permaneceu 674).

### Estado vivo após a 180

| Objeto | Fingerprint | ACL |
| --- | --- | --- |
| `_visita_scope_ok(uuid,uuid)` | `d8c3d611108200df201ffda45e558797` | postgres, service_role |
| `rpc_realizar_checkin_visita` | `3aa7f5ef96de3e4c4e3b1d5aa73ca16c` | postgres, authenticated, service_role |
| `rpc_realizar_checkout_visita` | `2b2cc2d7d51a37a515ef79823c28f690` | postgres, authenticated, service_role |
| `rpc_salvar_campo_visita` | `dc1ff655ba3bf156d38817fbf0c073dd` | postgres, authenticated, service_role |
| `rpc_upsert_diagnostico_visita` | `a20fa0ebeeac12595aa065b0d067bf02` | postgres, authenticated, service_role |

### Provas dinâmicas (staging, transação revertida)

- Identidade sem escopo, recurso real alheio × UUID inexistente: **indistinguíveis** —
  `sem_permissao` (42501) em campo, `forbidden_visita` (42501) em diagnóstico e
  `forbidden_visita_nao_atribuido` (42501) em check-in e checkout.
- Chamada direta do helper por `authenticated`: `permission denied`; executável por `service_role`.
- Checkout legítimo (cenário sintético em transação revertida): retorno `jsonb` com `id`,
  `data_hora_checkin` e `idempotent=false`, **sem `42883`**.
- Resíduo zero após rollback (`residuo_reg=0`, `residuo_obs=0`).

### Rastreabilidade documental

`h9c-applied-forwards.json` em **14 entradas / ledger 674** (170 histórica com o incidente, 180
retificadora, hashes reais, `applied_at=2026-09-09`); `h7p-repo-only-manifest.json` e
`h7p-guard-repo-only.sh` em **674**, com as **59 migrations repo-only intactas e em quarentena**.

Situação: **L6 e L6R concluídas**. L7, H9-E e promoção **não iniciados**. Produção permanece
**NO-GO**.

---

## H9-D-L7 — fechamento da última assinatura pendente (20261019000000, ledger 674 → 675)

**Ambiente exclusivo:** homologação `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk`
não foi acessada, consultada, testada, alterada nem promovida. Sandbox não utilizado.

**Escopo exato (1 assinatura):**
`public.start_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,text,uuid)`
— OID 24596, overload único, `SECURITY DEFINER`, owner `postgres`, `VOLATILE`,
`search_path=public`, ACL `postgres/authenticated/service_role`.

### Exposições comprovadas (antes da correção)

| Prova (sub arbitrário `0000…00aa`) | Resultado |
| --- | --- |
| Registro real alheio | `not_visit_owner` (42501) |
| UUID inexistente | `registro_not_found` (22023) → **oráculo de existência** |
| `client_uuid` real de terceiro | retornou `checkin_id 01a72cfc-5870-4148-9c70-dabc79e90120`, `is_new=false` → **BOLA/IDOR** antes de qualquer autorização |
| `anon` | `permission denied for function` |

Causa: a idempotência por `client_uuid` e a leitura de `registros_consultor` ocorriam **antes**
de qualquer verificação de escopo. Nenhum callsite de aplicação usa a função (busca recursiva em
`src/` e `supabase/functions/`), mas ela permanece alcançável por qualquer identidade
`authenticated` via API — daí a obrigatoriedade da correção.

### Correção mínima (forward reversível `20261019000000`)

- `public._visita_scope_ok(v_uid, p_registro_id)` exigido **antes de qualquer leitura**, com
  `COALESCE(...,false)` (fail-closed em NULL) e resposta única `not_visit_owner` (42501).
- Idempotência escopada: `WHERE client_uuid = p_client_uuid AND (admin OR consultor_id = auth.uid())`.
- Preservados: assinatura, tipo de retorno, ACL mínima (sem `PUBLIC`/`anon`), `search_path=public`,
  validação de status, transições, autoria e auditoria em `visitas_logs`.
- Fingerprint vivo: `pg_get_functiondef` `e627fdff91374ada08cdcd4fbf72c557` → `2b9d1fb6ae2851c154849e4179c48978`
  (`prosrc` `1f5e5484078b843ac68e810376d360e2`, 2.711 bytes).
- Rollback exato para o estado pré-L7 (com os defeitos documentados), sem afrouxar ACL e sem tocar no ledger.

### Incidente de preflight (declarado, não escondido)

O primeiro preflight envolveu os artefatos — que já contêm `BEGIN/COMMIT` próprios — em uma
transação externa. O `COMMIT` interno encerrou a transação, de modo que o par forward+rollback
ficou efetivado no staging antes do `ROLLBACK` final, que apenas emitiu
`there is no transaction in progress`. **O ledger não foi tocado (permaneceu 674) e nenhum dado foi
alterado.** O único efeito residual foi a normalização de `CRLF` para `LF` no corpo da função
(fingerprint `5cab21724fda5fde040c10748386c35d`). O rollback foi reconstruído preservando os bytes
`CRLF` originais e reaplicado, restaurando o fingerprint exato `e627fdff…`; só então foi executado
o preflight correto (sem `BEGIN/COMMIT` aninhados) e a aplicação única da `20261019000000`.

### Provas dinâmicas após a correção (staging, transação revertida)

- Registro real alheio, UUID inexistente, `NULL` e `client_uuid` alheio: **indistinguíveis** —
  `not_visit_owner` (42501) em todos os casos.
- `anon`: `permission denied for function start_technical_visit_secure`.
- Idempotência legítima preservada: o dono do check-in recebe o próprio `checkin_id` com `is_new=false`.
- Resíduo zero: `delta visitas_checkin = 0`, `delta visitas_logs = 0`.
- Preflight: forward → `2b9d1fb6…`; rollback → `e627fdff…` exato; ledger inalterado durante o ensaio.
- Defeito funcional **preexistente e fora do escopo L7**: a trigger `validate_registro_status_transition`
  rejeita `rascunho → em_andamento` no check-in inicial. Reproduzido **igualmente** com a definição
  pré-L7 na mesma transação revertida — portanto não é regressão desta fase; registrado como risco aberto.

### Fechamento do H9-D

| Métrica | Valor |
| --- | --- |
| Universo bruto | 376 |
| Herdadas H9-C (fora do escopo profundo) | 84 |
| Escopo profundo | 292 |
| `AUTH_COMPROVADA` | 257 |
| `EXPOSICAO_COMPROVADA_CORRIGIDA` | 31 |
| `NAO_APLICAVEL` | 4 |
| `PENDENTE_EVIDENCIA` | **0** |

`h9c-applied-forwards.json` em **15 entradas / ledger 675**; `h7p-repo-only-manifest.json` e
`h7p-guard-repo-only.sh` em **675**, com as **59 migrations repo-only intactas e em quarentena**.
As versões `20261017000000` e `20261018000000` permanecem fechadas, com ocorrência única e sem reaplicação.

**Advisors do staging (valores independentes informados pelo solicitante, não medidos nesta sessão —
a ferramenta gerenciada disponível poderia atingir outro projeto):** security 390; performance 507
(172 unindexed FK, 188 unused index, 146 multiple permissive, 1 duplicate).

**Decisão formal:** **H9-D CONCLUÍDA — GO em homologação**, sem assinaturas pendentes.
**Produção permanece NO-GO.** H9-E e promoção **não iniciados**.
