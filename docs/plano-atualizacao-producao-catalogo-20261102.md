# Plano de atualização de PRODUÇÃO — catálogo exclusivo por empresa (preparado 02/11/2026)

> Planejamento solicitado pelo proprietário. **Nada foi executado em banco hospedado nesta cópia isolada.**
> Destino único e obrigatório: Supabase CultivoFarm `swzpzcwiasxmjutrmvkm`, projeto Lovable de produção
> `a79bb3db-f665-466d-bf41-ee8c6cb91fab`. Qualquer outro ref = interromper.
> O proprietário JÁ autorizou condicionalmente a atualização da produção. A condição é objetiva: pacote exato (hashes
> abaixo) com todos os testes aprovados e revisão independente aprovada. Cumprida a condição, não se exige nova ordem
> genérica; “apto para revisão” NÃO equivale a GO.

## 0. Delta já aplicado (02/11, 23:59 UTC) — linha de base ACL endurecida

O auditor aplicou o `04-client-destructive-acl-hardening` (SHA-256 `eb200070…d461da6`) como
`restrict_catalog_client_destructive_privileges` em homolog e produção (produção: 174 permissões removidas, 0 destrutivas
restantes, CRUD/service_role intactos). O `00-pre-global` agora exige esse estado exato e aborta com
`client_destructive_acl_not_hardened:*` se algo reabrir. Não reaplicar o 04. Catálogo/ownership e 02 seguem não aplicados.

## 1. Gate de entrada (todos obrigatórios; qualquer “não” = NO_GO)
| # | Condição | Estado 02/11 |
|---|----------|--------------|
| G1 | Revisão independente do achado A/E fechada (simulação técnica, seleção, catálogo do parceiro, visita, guardas, painéis B2B sem tenant fechados) | candidato v2.11 pronto para revisão |
| G2 | PostgreSQL descartável sem FAIL de segurança; FAILs restantes só por objeto ausente de captura, nomeados | 336/1 — só `rpc_fiscal_nfe_readiness_v1`, falta captura de `fiscal_certificates` (relatório §6) |
| G3 | Captura READ ONLY fresca de produção confere 100% com os pins do PRE (corpos md5, FKs, triggers, event triggers, 19 fingerprints) | a capturar no dia |
| G4 | ~~Backup~~ — retirado por decisão expressa do proprietário (02/11/2026); não é condição nem decisão pendente | dispensado |
| G5 | Frontend compatível pronto e NÃO publicado antes do banco (ver §4) | pronto na cópia, não publicado |
| G6 | Fiscal DRAFT/NOT_READY, flags de emissão OFF, cron zero, comunicação false, 7 pedidos bloqueados | preservar; POST verifica |

## 2. Pacote atômico revisável (ordem fixa, uma transação por arquivo)
1. `02-chain-purge-maintenance.sql.review` — descarte autorizado das 19 linhas da cadeia sem empresa (locks, suspensão
   nominal, restauração verificada antes do COMMIT). Aborta se qualquer fingerprint divergir.
2. `00-pre-global.sql.review` — somente leitura: 129+ pins, dependências, event triggers. Aborta antes de qualquer DDL.
3. `01-migrate.sql.review` — migração transacional única: cópias por tenant, repontamento de referências SQL/JSON,
   RLS/RPC/ACL, cercas DEFINER, **deltas A/E pinados e guardas persistentes de tenant nas tabelas-pai**, fechamento
   dos 3 painéis B2B sem tenant e revogação da escrita direta em `product_fiscal_profiles` (v2.11),
   códigos por empresa, CRUD por RPC, POST interno (aborta tudo se qualquer invariante falhar).
Hashes: `scripts/tenant-exclusive-catalog-20261101/SHA256SUMS.json` (o revisor aprova estes bytes; qualquer
alteração exige nova revisão). Executor: `postgres` (allowlist), sem JWT, `statement_timeout`/`lock_timeout` definidos
pelo operador, sessão UTC.

## 3. Pré-execução (no dia, antes da janela)
- Confirmar ref `swzpzcwiasxmjutrmvkm` por consulta read-only (`current_database`, URL do projeto) — fail-closed.
- Captura READ ONLY fresca dos mesmos objetos e `diff` contra os pins (G3). Drift = parar e regenerar via `build.py`.
- Backup: dispensado pelo proprietário (02/11/2026). Não é condição de GO e não será pedido novamente. Testes,
  revisão independente, captura fresca e POST continuam obrigatórios.
- Congelar escritas operacionais durante a janela (aviso interno; nenhuma comunicação externa é enviada).

## 4. Compatibilidade de UI (ordem de publicação)
- Banco primeiro, frontend depois. A UI atual de produção continua funcional após a migração nos fluxos de leitura;
  telas que gravavam direto em microrganismos/culturas/volumes/fichas passam a receber 42501 até a nova UI publicar
  (janela curta e conhecida).
- A nova UI (já nesta cópia) usa somente as RPCs `tenant_product_save`, `tenant_catalog_root_save/delete`,
  `tenant_catalog_formulacoes_replace`, `tenant_owned_product_fiscal_save` e a associação fiscal específica do Financeiro.
- Publicação da UI só após o POST do banco passar e o smoke test §5 em sessões reais. A trava
  `OWNED_PRODUCT_FISCAL_ENABLED` (ficha fiscal de produto próprio) continua DESLIGADA na publicação: nenhuma flag
  fiscal é ligada automaticamente por deploy; ligar é passo separado, após prova própria. Até lá a tela fica
  somente leitura. A tela atual de produção grava a ficha fiscal direto e passará a receber 42501 após o banco.

## 5. Pós-execução (verificação)
- POST interno da migração já aborta a transação se: referência cruzada entre empresas, guarda de recebível/fiscal
  alterada, ACL aberta, função global com EXECUTE, triggers não restaurados.
- Verificações externas read-only depois do COMMIT: contagens por empresa vs. ledger; `ae_owner_delta` = 13 funções com
  `new_md5` registrado; `catalog_parent_guard` presente nas tabelas-pai; `tenantless_aggregator_closed` = 3;
  0 linhas com `owner_organization_id` nulo.
- Smoke test em sessões reais A/B (AR Bio, FSF, técnico do parceiro, Financeiro, Superadmin): cada um vê só o próprio
  catálogo; técnico do parceiro FSF vê só itens da AR Bio vendedora; simulação somente em rascunho (sem envio ao
  gestor, sem aviso externo); Superadmin sem catálogo.
- Prova JWT/RLS real é do auditor; testes descartáveis não substituem essa prova.

## 6. Reversão
- Antes do COMMIT: qualquer falha = ROLLBACK automático (transação única).
- Depois do COMMIT: reversão de segurança é deny-only (fechar EXECUTE das RPCs novas, manter guardas e policies); não se
  restauram corpos vulneráveis nem catálogo global. Sem backup (dispensado pelo proprietário), não há
  reversão de dados prevista: o mapa e o ledger da migração são o registro para correção posterior por forward-fix.

## 7. Fora deste pacote (continua fechado)
Emissão fiscal real, cobrança, comunicação externa, cron/automações, ativação de recebível automático dos 7 pedidos.

## 8. Homologação (vrlcdwmlytukrjezrrnf) — diferença declarada
Na homologação o catálogo usa a variante limpa (`02-homolog-catalog-gate`) do pacote de alinhamento; a manutenção
`02-chain-purge-maintenance` de produção NUNCA roda na homologação (a cadeia de 19 linhas não existe lá) e só é
provada em PostgreSQL descartável.
