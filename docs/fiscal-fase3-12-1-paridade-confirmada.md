# Fase Fiscal 3.12.1 — Paridade Confirmada e Promoção Canônica Concluída

**Natureza:** puramente documental. Nenhum banco foi tocado por esta
fase; toda a execução SQL registrada abaixo foi feita externamente por
operador humano autorizado no SQL Editor. Nenhuma alteração de runtime,
UI, migrations adicionais, schema adicional, policies adicionais, flags,
provedor, certificado ou emissão fiscal foi feita. Todas as feature
flags fiscais permanecem `false` (validado pelos testes estáticos já
existentes).

## Escopo fixo (idêntico à Fase 3.12)

- 9 tabelas fiscais canônicas.
- 5 views de prontidão.
- 2 funções fiscais (`rpc_fiscal_event_manual`, `mask_sensitive_jsonb`).

## Sequência real executada

1. **Snapshot staging (`ikaa***hoq`) — antes**
   - 9 tabelas / 5 views / 2 funções presentes.
   - `missing` vazio.
   - 26 policies.
   - Fingerprint global: `51d96b09508c2471c3bf13fe42f5b156`.
2. **Snapshot produção — antes (somente `SELECT` de catálogo)**
   - Objetos presentes.
   - **18 policies** (divergência).
   - Fingerprint global: `f3e1a88e1c5901b6ee516787d55399d6`.
   - Divergências em `policies`, `object_grants` e `constraints`
     correspondem exatamente ao delta previsto pela migration canônica
     `20260722000000_fiscal_fase3_0_1_integridade.sql`.
3. **Preflight somente-leitura em produção** — todos os predicados de
   compatibilidade satisfeitos:
   - `migration_registered=false`
   - `orphan_products=0`
   - `orphan_customers=0`
   - `events_without_invoice=0`
   - `duplicate_active_service_ids=0`
   - `duplicate_active_source_refs=0`
   - `invalid_service_identity=0`
   - `oversized_event_notes=0`
   - Veredito: `COMPATIBLE_FOR_CANONICAL_MIGRATION`.
4. **Aplicação transacional em produção**
   - Arquivo canônico executado: `supabase/migrations/20260722000000_fiscal_fase3_0_1_integridade.sql`.
   - Único statement transacional; registro em
     `supabase_migrations.schema_migrations` incluído na mesma
     transação.
   - Resultado SQL: `Success. No rows returned.`
   - Nenhuma linha de negócio foi lida, inserida, atualizada ou
     apagada; a migration é estruturalmente idempotente (guards
     `IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `CREATE OR REPLACE`,
     `pg_constraint` lookup antes de `ADD CONSTRAINT`).
5. **Snapshot produção — depois**
   - 26 policies.
   - `missing` vazio.
   - Todos os fingerprints por categoria idênticos ao staging.
   - Fingerprint global: `51d96b09508c2471c3bf13fe42f5b156`.
   - `diffParitySnapshots(staging, prod).globalEqual === true`.

## Histórico registrado

- `supabase_migrations.schema_migrations` inclui agora a versão
  `20260722000000` para produção. Reaplicação está bloqueada pela
  própria CLI/registro; a migration permanece idempotente caso um novo
  ambiente vazio precise reconstruí-la.
- Fingerprint canônico compartilhado entre staging e produção:
  `51d96b09508c2471c3bf13fe42f5b156`. Qualquer alteração futura em
  policies/grants/views/funções fiscais **deve** invalidar este valor
  intencionalmente e ser tratada como nova fase.

## Limites explícitos (o que **não** aconteceu)

- Nenhuma linha de `fiscal_invoices`, `fiscal_invoice_items`,
  `fiscal_events`, `fiscal_idempotency_keys`, `fiscal_audit_log`,
  perfis fiscais ou `company_fiscal_settings` foi criada, alterada ou
  apagada em produção.
- Nenhum provedor de emissão foi contratado, configurado ou acionado.
- Nenhum certificado A1/A3 foi provisionado.
- Nenhuma feature flag fiscal foi mudada — todas continuam `false`.
- Nenhuma rota nova foi exposta; nenhum item de menu foi habilitado.
- Nenhuma edge function foi implantada em runtime.
- Nenhuma UI foi alterada.
- Nenhum backfill de dados históricos foi executado.

## Próximo gate objetivamente executável

Após 3.12.1, o único gate que continua **imediatamente executável sem
projeto limpo adicional e sem credenciais externas** é:

- **Rerun da certificação runtime (harness 3.11.4/3.11.5) já em
  produção**, somente-leitura sobre catálogos + isolamento
  `pg_temp`, para confirmar que a matriz 677/677 mantém APTO agora
  que o fingerprint de policies é idêntico ao staging. Este rerun
  **não** foi autorizado e não deve ser iniciado sem prompt
  específico do responsável, porque envolve criação/limpeza de
  fixtures sintéticas em `auth.users` no projeto principal.

Todos os demais gates continuam bloqueados por dados/decisões
humanas externas, já mapeados em
`docs/fiscal-fase3-11-5-gates-restantes.md` (categorias C, D, E) e
não são desbloqueáveis por esta fase:

- **C.** Backfill de dados históricos: exige janela e autorização
  explícita; não há autorização.
- **D.** Regeneração oficial de `src/integrations/supabase/types.ts`
  via Supabase CLI humana: fora do escopo do agente.
- **E.** Provedor de emissão, certificado digital, dados fiscais
  reais da empresa, homologação SEFAZ/prefeitura, webhooks/secrets,
  aprovação humana de flags, revisão jurídica/contábil: dependem de
  decisão humana e contratos externos.

**Bloqueio objetivo:** sem autorização humana explícita para (i) o
rerun do harness em produção ou (ii) qualquer item C/D/E, nenhuma
fase seguinte pode ser iniciada.

## Não iniciar automaticamente

Este documento encerra a Fase 3.12.1. Nenhuma fase seguinte é iniciada
sem prompt específico do responsável.
