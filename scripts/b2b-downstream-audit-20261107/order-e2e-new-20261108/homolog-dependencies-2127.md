# Homolog: inventário mínimo e ordem candidata — 08/11, 21:27 UTC

**Estado: NOT_RUN_BLOCKED_ENVIRONMENT_AND_CALLER. Sem instalação autorizada.**

## Evidência recebida

Relato do auditor de leitura em `vrlcdwmlytukrjezrrnf`, PostgreSQL 17.11: ausentes `public.rpc_entrega_confirmar_manual_v1(uuid,timestamptz,text,jsonb)`, helper privado de criação de OS de revenda e gate correspondente. O agente não realizou essa consulta e não recebeu captura integral do catálogo. Ausência desses três objetos já impede o fluxo; login não resolve. Demais dependências abaixo têm estado **A CONFERIR**, não presumidamente ausente nem instalada.

Produção original `swzpzcwiasxmjutrmvkm` permanece intocada. Homolog explicitamente indicada é destino permitido para planejamento, condicionado à verificação de configuração/escopo. Não trocar ref de um PRE de produção para fazê-lo passar na homolog.

## Ordem mínima de preparação e eventual instalação pelo auditor

Cada etapa: comparar captura homolog → classificar existente/exato/divergente/ausente → gerar delta próprio com pins → recompor em PG descartável → revisão independente → autorização específica → PRE/instalação transacional/POST. **Não executar listas antigas em lote.** Objeto já aplicado e exato é dependência somente leitura; drift exige revisão, nunca reinstalação cega.

| Ordem | Dependência e objetos essenciais | Fonte local de revisão | Condição de avanço |
|---|---|---|---|
| 0 | Ambiente, Auth, h15/readiness/roles/SaaS, tabelas/owners/RLS, `authz_tickets`; saídas externas/cron/workers OFF | `scripts/homolog-alignment-20261102/AGENTS.md`; `homolog-isolation-dbb81a9.md` | Captura homolog e isolamento comprovados; não reaplicar 00/01/04/06/10 relatados |
| 1 | Catálogo por empresa/apresentações inteiras; B3 preço/condição/snapshot; pedido/aceite/C2 e fence contábil; leitores vendedor escopados | `commercial.py`, `real_baselines.py` e `evidence/review-dbb81a9/new-b3-metadata.json` como referência **local**, não instaladores homolog | Nenhum stub, fixture SQL Auth/contábil ou grant do harness exportado; origem pending nega |
| 2 | Estoque/ledger/motor e batch reserva com ator/tenant/feature, recibos e locks; dez triggers recebíveis/no-downstream e ACL | `scripts/stock-envase-recovery-20261027/`; `real-baselines.json` | Captura atual equivalente e negativos; envase biológico não vira requisito comercial de revenda |
| 3 | Barreira atômica entrega + comprovante com autorização/Storage; policies parent-tenant e bloqueios auxiliares efetivamente usados | `scripts/delivery-proof-authz-20261030/release-combined.sql.review`; pacotes `proof-select-tenant`, `delivery-evidence-tenant`, `produto-etiquetas-tenant`, `delivery-checklist-occurrence-authz`, `delivery-waiver-closure` de 30/10 | Backend atômico/prova numa transação; ACL/RLS/Storage conferidos, labels/waiver não reabertos |
| 4 | Grupo observado/cancelamento e capabilities próprias; reserva→expedição canônica | `scripts/delivery-group-capability-20261030/` | Grants somente dos contratos aprovados, nunca helper/overload legado; cancelamento não remove histórico |
| 5 | Confirmação física manual, envio físico e recibos/CAS/rechecagem pós-lock | `scripts/delivery-atomic-hardening-20261030/confirmation/{assemble.py,install.sql.review,preflight.sql.review,postflight.sql.review}` e `confirmation/send/` | Confirmação **ausente relatada**; gerar sobre baseline homolog. Releases fechados/NO_GO não autorizam GRANT. Sem provider/mensagem |
| 6 | Compra produto acabado e lineage lote/embalagem/estoque, gate OFF | `scripts/b2b-downstream-audit-20261107/physical/finished-product/assemble.py` e suas capturas/manifestos | Purchase helper privado não recebe grant; caller operacional de compra e leitores precisam contrato revisado próprio se não existentes |
| 7 | Delta revenda: gate, OS privada/recibos, guards/lineage e sync parcial | `resale_logistics.py`; `evidence/review-dbb81a9/logistics/{install.sql.review,pre-metadata.json,postflight.sql.review,rollback.sql.review}` | Helper/gate **ausentes relatados**; preservar 8ad4def8… como candidato local, não instalar seus pins de composição em homolog sem rebase |
| 8 | Endpoint público mínimo sessão/CAS/idempotência; helper fechado | `os_endpoint.py`; `evidence/review-dbb81a9/os-endpoint/01–04` (nomes completos abaixo) | Instalar depois do helper/guards; authenticated EXECUTE só endpoint; service_role/anon/PUBLIC e helper negados; gate ainda OFF |
| 9 | Capability/leitura operacional canônica + UI isolada/continuidade/recovery da key; transporte homolog exclusivo | `ui-candidate/`; `caller-audit-dbb81a9.md` | Não montar com booleano inventado, SELECT privado ou cliente paralelo; nenhum grant de tela. Gates somente pelo auditor após aprovação |
| 10 | Fixture normal e sessão real: OS → compra autorizada → reserva/grupo/prova → parcial 1 → replay → restante 2 → evento único/negativos/rollback | `authenticated-partials-review-40186.md` | Contratos/leitores/capabilities/Storage/ambiente compatíveis primeiro; nenhum pedido de login agora |

Ordem é de dependências, não uma sequência de comandos de implantação pronta. Envase/CQ/fabricação não são ativados para revenda. As funções/guards que o delta compartilha com esses módulos precisam baseline exata, sem liberar operações transitivas.

## Artefatos endpoint exatos e evidência local

Diretório `evidence/review-dbb81a9/os-endpoint/`:

- `01-pre.sql.readonly`
- `02-install.sql.review`: SHA256 `21d40202d32e70dfbb44c7eb2a54a4135ebace840b301c15ab37b910cbfa0ee3`
- `03-post.sql.readonly`
- `04-rollback-deny.sql.review`
- `manifest.json`: pins corpo/owner/ACL das dependências, endpoint e delta de ACL.

`checks.json` 41/41 fresh, `review-70d08c.json` 13/13 parciais/revogações, `os-endpoint-tests.json` 9/9 e frontend 13/13 + compatibilidade OS 73/73; execuções anteriores verificadas nesta atualização, não nova execução. FSF local negada na feature: **não prova isolada de tenant**; service_role parou no schema, ACL helper foi medida separadamente. Nenhum PASS substitui JWT/RLS/Storage/PostgREST/browser homolog. Essas lacunas devem entrar na matriz homolog sem grants temporários.

## Fora do mínimo físico

- Isolamento planos cc1f6cc é rollout de segurança separado, sem dependência de motor fiscal. Verificar/revisar seu estado por ambiente e reader B3 antes de usar planos; nunca instalar ponte fiscal para corrigir vazamento.
- B4/ponte H12/H13, NF/NFS-e, recebíveis, cobrança/pagamento/provedores e comunicação não são pré-requisitos para confirmar entrega física. **Não instalar/ativar esses writers como parte desta cadeia.** Manter always-deny e contabilidade real pendente; não exportar fixtures fiscais/contábeis locais do harness.
- As 41 verificações locais compuseram B4/ponte apenas para medir negação/invariantes; isso não aumenta o escopo de instalação homolog mínima.

## Reversão e critério de saída

Retirar UI e negar transporte, revogar endpoint público e capabilities/writers do recorte aprovado, fechar gates, manter barreiras/policies/recibos/ledger/snapshots/comprovantes e histórico; não restaurar vazamento ou regrant. Reversão de cada estágio exige seus pins/artefatos homolog próprios e POST negativo. Não DROP em cascata.

Só sair de NOT_RUN_BLOCKED_ENVIRONMENT_AND_CALLER quando catálogo homolog completo, deltas aprovados/instalados, callers de OS **e compra**, leitores/capabilities, transporte/Storage e saídas OFF forem demonstrados. Login é a etapa final de teste, não intervenção para resolver ausência de contrato. Nenhuma escrita hospedada/publicação/delegação pelo Lovable.