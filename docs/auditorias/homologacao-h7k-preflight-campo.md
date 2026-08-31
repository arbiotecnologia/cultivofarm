# H7k — Preflight fiscal por campo e integridade de itens

Ambiente: **staging `ikaauvsflpmamgxmkhoq`** (marcador `STAGING`, `tpAmb=2`,
`production_emission_allowed=false`). Produção `navfzbwgwzruipouyfnk` **não foi
acessada** em nenhum momento desta fase.

## 1. Inventário verificado

| Item | Resultado |
|---|---|
| Marcador de ambiente | `STAGING` / emissão em produção desabilitada |
| Emitente ativo | `nfe_environment_code = 2` (homologação) |
| Buckets `fiscal-*` | privados (`public = false`) |
| Gate de ambiente | `fn_fiscal_environment_gate_v1` fail-closed (recusa `tpAmb=1`) |
| Itens fiscais | 0 linhas com quantidade/valor inválidos antes das constraints |

## 2. Achados e correções

| ID | Achado | Severidade | Correção |
|---|---|---|---|
| H7K-001 | `rpc_fiscal_preflight_v1` devolvia apenas o status agregado da validação de homologação; o operador não sabia **qual campo** faltava | P1 | Preflight reescrito (`h7k-v1`): explode `missing[]` em achados estruturados com `section`, `field`, `itemSequence`, `message` e `action`, e agrega o mapa `fields` |
| H7K-002 | Pendências de emitente e destinatário existiam em funções canônicas, mas não entravam no preflight | P1 | Preflight passa a consumir `fn_fiscal_emitter_pendencies_row` e `fn_fiscal_recipient_pendencies_row`, separando `BLOCK` (bloqueio) de `WARN` (aviso) |
| H7K-003 | Sem checagem aritmética item a item nem constraint de sanidade nos itens | P1 | Constraints `h7k_fii_quantity_positive`, `h7k_fii_values_non_negative`, `h7k_fii_commercial_unit_present` (VALIDATE OK) + checagem `quantidade × unitário − desconto = líquido` com tolerância documentada de R$ 0,01 |
| H7K-004 | `fn_fiscal_assert_staging_marker` com `EXECUTE` para `authenticated` | P2 | `EXECUTE` revogado de `PUBLIC`/`anon`/`authenticated`; mantido para `postgres`/`service_role` |
| H7K-005 | Preflight existia no banco mas **não era consumido pela interface** | P1 | Nova seção `PreflightNfeSecao` no wizard de rascunho, com pendências por campo e ação corretiva |
| H7K-006 | Drift recorrente de binding (`.env` regenerado para o projeto sandbox) | P1 aberto | Restaurado o baseline autorizado `c75bb87f` antes de qualquer acesso; o gate `check-frontend-binding.sh` bloqueou a execução até a correção |

## 3. Semântica do resultado

`rpc_fiscal_preflight_v1` retorna:

- `status`: `READY` | `READY_WITH_PREREQUISITES` | `BLOCKED`
- `canTransmit`: só é `true` sem bloqueios **e** sem pré-requisitos externos
- `blockers[]` / `warnings[]`: `{ code, section, field, itemSequence, message, action }`
- `fields`: mapa `campo -> mensagens`, para destaque direto no formulário
- `itemsTotal`, `documentTotal`, `toleranceBRL`, `environment`, `evaluatedAt`

Pré-requisito externo tratado como aviso explícito, nunca como sucesso:
`EXTERNAL_PREREQUISITE_MISSING` quando não há certificado A1 de homologação
ativo. Nenhum valor tributário é inventado — campo ausente vira pendência.

## 4. Artefatos

- `restoration/homologacao-h7/93-h7k-preflight-apply.sql` — apply idempotente e transacional
- `restoration/homologacao-h7/94-h7k-postcheck.sql` — 8 postchecks estruturais
- `restoration/homologacao-h7/95-h7k-rollback.sql` — rollback do que é aditivo
- `restoration/homologacao-h7/96-h7k-preflight-harness.sql` — harness funcional com `ROLLBACK` final
- `src/hooks/useFiscalPreflight.ts`, `src/components/fiscal/documentos/PreflightNfeSecao.tsx`

## 5. Evidências

Postcheck estrutural (staging):

```
H7K-01 constraints itens                          | PASS
H7K-02 preflight versionado                       | PASS
H7K-03 preflight security definer + search_path   | PASS
H7K-04 preflight sem EXECUTE para anon            | PASS
H7K-05 marcador de ambiente sem EXECUTE publico   | PASS
H7K-06 producao fiscal bloqueada                  | PASS
H7K-07 emitente em homologacao (tpAmb=2)          | PASS
H7K-08 buckets fiscais privados                   | PASS
```

Harness funcional (massa sintética, revertida por `ROLLBACK`):

```
H7K-T1 status=BLOCKED canTransmit=false
H7K-T2 codigos=EMITTER_ACCOUNTING_NOT_VALIDATED,EMITTER_ACCREDITATION_MISSING,
       EMITTER_CERTIFICATE_MISSING,FISCAL_FIELD_REQUIRED,
       FISCAL_ITEM_TOTAL_MISMATCH,FISCAL_TOTAL_MISMATCH
H7K-T3 campos={series, company, customer, net_value, issue_date, certificate,
       total_amount, document_model, certificate_ref, uf_accreditations,
       accounting_validated_at}
H7K-T4 ambiente=2
H7K HARNESS: PASS (4/4)
```

## 6. Gate H7k

**APROVADO COM RESSALVAS.** Preflight, integridade de itens e menor privilégio
homologados no staging. Permanecem abertos, sem impacto de segurança:

- P1: certificado A1 de homologação ainda não provisionado — o smoke real de
  transmissão SEFAZ (`cStat` 100/204/539) segue pendente e é o único item que
  falta para o fechamento fiscal de homologação.
- P1: drift recorrente de `.env`/`types.ts` provocado pela plataforma; exige
  restauração manual do baseline `c75bb87f` antes de cada execução.

Nenhuma ativação de produção fiscal foi executada ou preparada.
