# Complemento DPS NFS-e Nacional — relatório (2026-11-13)

Base: leiaute DPS 1.01 (pacote oficial em `../nfse-nacional-adapter-20261113/official/xsd-1.01`). Sem POST, sem alterações hosted, sem publicação.

## Mudanças
- `supabase/functions/_shared/nfse/dps.ts`: cNBS (9 díg.), cTribNac string (zero inicial), `locPrest/cLocPrestacao` = local da prestação (não mais o município de incidência), prest fone/email, toma CPF|CNPJ + IM/fone/email opcionais, `tribFed/piscofins` (CST, vBC, alíquotas, vPis/vCofins, tpRetPisCofins), vRetCP/IRRF/CSLL, `totTrib` IND|pTotTrib|pTotTribSN (SN só opSimpNac=3); regime ausente bloqueia; CNPJ alfanumérico vira pendência (TSCNPJ 1.01 é numérico).
- `dpsProfile.ts` (novo, puro) + `dpsFromInvoice.ts`: complemento lido de `fiscal_invoices.fiscal_profile_snapshot.nfse_dps`; ausente → pendências `local_prestacao`/`total_tributos`.
- Edge `nfse-nacional-emit`: só passou a ler colunas existentes (telefone/e-mail do emitente, IM/telefone do tomador e snapshot do cabeçalho). Gates de transmissão inalterados.
- Editor canônico do perfil de serviço: seção “NFS-e Nacional (DPS)”, gravada em `federal_withholding_defaults.nfse_dps` (coluna existente, outras chaves preservadas).
- Catálogo > Serviços: botão “Reaplicar perfil” em rascunho NFS-e de homologação (CAS por `draft_version`).
- Migração candidata **não aplicada**: `migration/20261113190000_service_nfse_dps_profile.sql` (gerada por `generate.py`, PRE pin MD5 `811e98cc…` = LIVE, POST `d0be511c…`). Gatilho de validação, snapshot no faturamento e `rpc_service_billing_reapply_profile_v1`.

## Evidências
- Vitest `src/test/services/nfseDpsProfile.test.ts` + `serviceBilling.test.ts`: 27/27.
- Deno `../nfse-nacional-adapter-20261113/offline.test.ts`: 19/19, zero rede; `deno check` da Edge OK.
- PostgreSQL local descartável (`run_pg.sh`, andaime com autorização e `rpc_fiscal_draft_save` **simulados**): 18/18 — gatilho, faturamento com/sem complemento, replay, reaplicação no mesmo rascunho preservando edição, idempotência, CAS, gestor/outra empresa negados, transmitido/fechado/não-homologação bloqueados.
- XSD (`validate_xsd.py`, `evidence/xsd-result.json`): 4 DPS sintéticas válidas com a cópia que só corrige a âncora `TSSerieDPS`; o XSD intocado rejeita qualquer série pelo defeito conhecido.
- Bateria services/fiscal/config: 3.350 passaram, 4 ignorados, 1 falha preexistente (`cultivofarm-runtime.static`).

## Limites
- Sem a migração, o faturamento não copia o complemento e o botão informa que a reaplicação não está instalada.
- Teste PG não reproduz `rpc_fiscal_draft_save`, RLS nem JWT reais; XMLs não assinados nem enviados; regras municipais/Sefin sobre combinações de regime não comprovadas.
- Leiaute 1.01 não aceita CNPJ alfanumérico: tais tomadores/emitentes ficam pendentes até novo leiaute.
