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

1. `rpc_realizar_checkout_visita` contém defeito funcional **pré-existente e independente**:
   o predicado `WHERE client_uuid = p_client_uuid::text` compara com a coluna `uuid`, produzindo
   `42883 operator does not exist: uuid = text`. A função falha **fechada** (nada é lido ou
   escrito), portanto não é exposição de segurança e não foi alterada nesta rodada, que se limita
   ao mínimo necessário para as exposições comprovadas. Deve ser tratada em correção funcional
   própria.
2. `rpc_programar_os_v1` mantém `search_path = 'public', pg_temp`. Com `pg_temp` em última posição
   não há sombreamento de objetos de `public`; mantido como está por estar fora do escopo de
   correção da L6.
3. Advisors gerenciados do Supabase (baseline 390 segurança / 508 performance) não puderam ser
   reexecutados contra a homologação nesta rodada sem apontar ferramenta para outro projeto, o que
   é proibido. Em substituição, a comparação foi feita no catálogo vivo da homologação
   (SECDEF `authenticated`/`anon` 375/2, zero SECDEF sem `search_path`, crons 1,2,5,8,9,18), todos
   idênticos ao baseline pós-L5 — nenhuma categoria nova foi introduzida pelo forward.
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

Situação: **L6 concluída**. L7, H9-E e promoção **não iniciados**. Produção permanece **NO-GO**.
