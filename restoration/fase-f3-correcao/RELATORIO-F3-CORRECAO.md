# FASE F3 — CORREÇÃO DA AUDITORIA (NF-e modelo 55)

Ambiente: **staging `ikaauvsflpmamgxmkhoq`**. Produção `navfzbwgwzruipouyfnk` não foi acessada.
Nada foi publicado e nenhuma NF-e foi transmitida. Nenhum dado ou histórico foi apagado.

## Artefatos (sem drift entre `restoration/` e `supabase/migrations/`)

| Artefato | Migration aplicada |
| --- | --- |
| `restoration/fase-f3-correcao/migration.sql` | `20260817000000_fase_f3_correcao_auditoria.sql` |
| `restoration/fase-f3-correcao/migration-2-fontes.sql` | `20260817010000_fase_f3_correcao_fontes.sql` |
| `restoration/fase-f3-correcao/migration-3-fcpst.sql` | `20260817020000_fase_f3_correcao_fcpst.sql` |
| `restoration/fase-f3-correcao/migration-4-calcmode.sql` | `20260817030000_fase_f3_correcao_calcmode.sql` |
| `restoration/fase-f3-correcao/postcheck.sql` | 48 gates estruturais |
| `restoration/fase-f3-correcao/runtime-harness.sql` | 40 casos autenticados, transação revertida |
| `restoration/fase-f3-correcao/rollback.sql` | reversão controlada, não destrutiva |

Todas as migrations são incrementais e idempotentes. A migration F3 já aplicada
(`20260816000000`, `20260816010000`) **não foi editada**.

## Bloqueios da auditoria e como foram corrigidos

### 1. Idempotência e numeração
- `idempotency_key` deixou de ser única globalmente; unicidade agora é
  `(fiscal_invoice_id, idempotency_key)`. Chave reutilizada por outro documento
  levanta `FISCAL_IDEMPOTENCY_SCOPE_MISMATCH` — nunca devolve numeração alheia.
- `fiscal_invoice_id` passou a `NOT NULL`; uma única reserva ativa por documento.
- Lock determinístico: `SELECT ... FOR UPDATE` do documento antes de qualquer
  efeito, mais `pg_advisory_xact_lock` por emitente/série/ambiente.
- `tp_emis` explícito em documento e reserva, com `CHECK (tp_emis = 1)`:
  contingências (2/4/5/6/7/9) ficam bloqueadas até implementação específica.
- Reserva imutável e indeletável por trigger.
- Elegibilidade é reavaliada no momento da reserva (fail-closed).

### 2. Elegibilidade fiscal fail-closed
- Allowlist explícita de status de pedido (`fn_fiscal_billing_allowed_order_status`)
  e de entrega. Status desconhecido, novo, cancelado, reprovado, em cotação ou já
  faturado são **sempre** bloqueados.
- Bloqueios adicionais: aprovação comercial ausente, aprovação financeira exigida
  e não concedida, condição de pagamento não aceita, itens `quote_only`, snapshot
  de preço ausente, entrega não concluída/sem aceite, entrega sem vínculo a pedido,
  duplicidade de documento vigente para a mesma origem.
- A função é `STABLE`: avaliar elegibilidade não produz efeito colateral.
- Devedor B2B: `partner_orders.partner_id` é `NOT NULL` no schema real, então o
  devedor do pedido é estruturalmente resolvido; a via de bloqueio testável é a
  origem `ENTREGA` (sem vínculo a pedido ⇒ `FISCAL_DELIVERY_ORDER_LINK_MISSING`).

### 3. Motor tributário canônico
- Fim da fórmula genérica: `fn_fiscal_apply_tax` foi desativada
  (`FISCAL_ENGINE_DEPRECATED`) e substituída por `fn_fiscal_apply_tax_v2`, com
  fórmula própria por tributo.
- Base do item deixa de ser presumida: cada regra declara `base_components`
  (`PRODUTO`, `FRETE`, `SEGURO`, `OUTRAS_DESPESAS`, `DESCONTO`, `IPI`, `ICMS_ST`),
  validados por constraint. Regra sem componentes bloqueia o cálculo.
- ICMS-ST: `BC ST = base × (1 + MVA)`, `ST = BC ST × alíquota interna − ICMS próprio`;
  modalidade de BC ST restrita ao domínio oficial (apenas MVA implementada; PAUTA,
  PREÇO TABELADO e VALOR DA OPERAÇÃO bloqueiam explicitamente).
- FCP próprio sobre a base efetiva; FCP-ST exige BC ST previamente apurada.
  FCP-ST virou tributo de primeira classe (domínio, ordem canônica e total `vFCPST`).
- DIFAL: `(alíquota interna − interestadual) × base`, com partilha destino/origem
  e FCP destacado; alíquota interna menor que a interestadual é bloqueada.
- Ordem canônica de apuração: ICMS → IPI → ICMS-ST → FCP/FCP-ST → DIFAL → PIS/COFINS.
- Modos documentados alinhados ao domínio real: `EXEMPT_DOCUMENTED`,
  `NOT_TAXED_DOCUMENTED`, `SUSPENDED_DOCUMENTED` preservam base e exigem motivo e
  base legal; `DEFERRED_DOCUMENTED` exige percentual e explicita o valor diferido.
- Ambiguidade nunca é resolvida em silêncio: regras e políticas com a mesma
  precedência efetiva levantam `FISCAL_TAX_RULE_AMBIGUOUS` /
  `FISCAL_OPERATION_POLICY_AMBIGUOUS` (o índice `fop_active_uq` já impede duas
  políticas vigentes no mesmo escopo).
- Coerência CRT: 1/2 exigem CSOSN, 3/4 exigem CST; PIS/COFINS/IPI/FCP/DIFAL nunca
  usam CSOSN. IBS/CBS/IS permanecem scaffolding não publicável.
- Snapshot por item grava CFOP, natureza, política (id/versão/base legal/fonte),
  CRT, componentes, ordem de apuração, regra, versão, fonte, bases e valores,
  com arredondamento `HALF_UP_2`.

### 4. Prontidão real
- `fn_fiscal_scenario_coverage` mede cobertura efetiva por cenário real
  (destinatário pronto × UF destino × consumidor final × indIEDest × canal × NCM),
  tentando resolver política e todos os tributos exigidos pelo emitente.
- Cobertura incompleta ou inexistente gera pendência `BLOCK` e derruba a prontidão
  global. O painel expõe as lacunas com escopo e código acionável.
- Teto `READY_HOMOLOGATION`: sem `sefaz_homologation_at` registrado, produção é
  rebaixada e a pendência `SEFAZ_HOMOLOGATION_NOT_RECORDED` é emitida.
  A evidência de homologação rejeita segredos por constraint.
- Microrganismos sem dossiê aprovado e validação contábil continuam contados como
  pendência — nenhum dado fiscal é inventado.

### 5. UI e documentação
- `src/hooks/useFiscalNfeReadiness.ts` e `src/components/fiscal/ProntidaoNfeSecao.tsx`
  consomem `rpc_fiscal_nfe_readiness_v1` e exibem status do emitente, cobertura de
  cenários, teto de homologação e pendências acionáveis por seção, integrados em
  `src/pages/fiscal/FiscalProntidao.tsx`.
- Este relatório documenta a arquitetura fiscal, as fórmulas e os pontos de bloqueio.

### 6. Segurança
- `REVOKE ALL ... FROM PUBLIC, anon` em todas as 10 relações fiscais e nas funções
  fiscais F3; `GRANT` mínimo a `authenticated` e `service_role`.
- RLS habilitada em todas as relações fiscais, com política de leitura restrita à
  competência fiscal interna (`fn_fiscal_can_read_internal`); operação exige
  `fn_fiscal_can_operate`.
- Trilha de auditoria em regras, políticas e reservas, verificada livre de segredos.
- Todas as funções `SECURITY DEFINER` fiscais com `search_path` fixo.

## Verificação executada

| Verificação | Resultado |
| --- | --- |
| `postcheck.sql` (estrutural) | **48/48 PASS** |
| `runtime-harness.sql` (autenticado, revertido) | **40/40 PASS** |
| Ledger de migrations | 638 local / 638 remoto — sem drift |
| Produção `navfzbwgwzruipouyfnk` | não acessada |

## Ressalvas

- Emissão real permanece bloqueada: máximo `READY_HOMOLOGATION` até a homologação
  SEFAZ ser registrada com evidência.
- Modalidades de BC ST diferentes de MVA e contingências de `tpEmis` não estão
  implementadas — bloqueiam de forma explícita, sem aproximação.
- IBS/CBS/IS seguem como scaffolding não publicável.

**Status: APTO EM STAGING para auditoria da correção F3.**
