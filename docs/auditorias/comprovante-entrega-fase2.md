# Fase 2 — Comprovante de entrega: implementação, correções e certificação

Ambiente: **somente** staging `ikaauvsflpmamgxmkhoq` via `$STAGING_DSN` + `restoration/os-e2e/staging-psql.sh` (runner fail-closed).
Produção `navfzbwgwzruipouyfnk` não tocada. Nada publicado. Sem SEFAZ. Nenhum segredo exposto.
HEAD inicial desta rodada de correção: `87a9281f` · HEAD final: `33b22156`.

## 1. Migrations canônicas (registradas em `supabase/migrations`, ordem incremental preservada)

| Ordem | Arquivo canônico | Espelho de trabalho | Conteúdo |
| --- | --- | --- | --- |
| 1 | `supabase/migrations/20260903000000_comprovante_entrega_documento_v1.sql` | `restoration/os-e2e/17-...` | ACL (revoga `anon`), `comprovante_entrega_seq`, `fn_comprovante_entrega_montar_v1`, `rpc_get_comprovante_entrega_data` |
| 2 | `supabase/migrations/20260903010000_comprovante_cepas_fix.sql` | `restoration/os-e2e/18-...` | `produto_etiquetas.cepas` é `text[]` → `array_to_string` |
| 3 | `supabase/migrations/20260903020000_comprovante_tipo_canonico.sql` | `restoration/os-e2e/19-...` | `entrega_comprovantes_tipo_chk` aceita `comprovante_entrega` |
| 4 | `supabase/migrations/20260903030000_comprovante_os_volume_v1.sql` | `restoration/os-e2e/20-...` | Gates de OS e volume; OS On-Farm; fallback sem ambiguidade de alias; helper sem EXECUTE para `authenticated` |

Nenhuma migration antiga foi reescrita. O estado final aplicado em staging é o da migration 4.

## 2. Rollback

`restoration/os-e2e/97-rollback-20260903000000.sql` (cobre 000000/010000/020000/030000):

- Remove `rpc_get_comprovante_entrega_data` e `fn_comprovante_entrega_montar_v1`.
- Restaura `entrega_comprovantes_tipo_chk` ao conjunto anterior **somente** se não houver documento com `tipo = 'comprovante_entrega'`; havendo, preserva a constraint e emite NOTICE (auditoria acima de reversão).
- **Preserva deliberadamente** `public.comprovante_entrega_seq`: números `CE-YYYY-NNNNNN` já emitidos nunca podem ser reciclados. A sequence permanece sem privilégios para `PUBLIC`/`anon`.
- **Não reverte** as revogações de `anon` sobre `entrega_comprovantes`/`entrega_termos` (reconceder seria regressão de segurança) nem apaga snapshots já congelados.

Rehearsal executado em `BEGIN … ROLLBACK` no staging: **PASS** (0 funções remanescentes dentro da transação, constraint restaurada, transação desfeita).

## 3. Regras de negócio implementadas

- Entrega **não confirmada** → `romaneio` (`definitivo=false`, numeração `RM-xxxxxxxx`, sem snapshot). Dados incompletos são tolerados aqui — o documento se declara operacional e não comprova recebimento.
- Entrega `entregue` **com recebedor identificado** → `comprovante` (`definitivo=true`), exigindo cumulativamente: **cliente + OS + produto + lote + quantidade > 0 + volume total > 0** e data de confirmação.
- OS aceita dois vínculos legítimos já existentes no modelo de `entregas`: `ordem_servico_id` (`public.ordens_servico`) e `ordem_servico_onfarm_id` (`public.ordens_servico_onfarm`, `origem='on_farm'`). Não há exceção que dispense OS no definitivo.
- `Produto: Não informado` é impossível no definitivo (`COMPROVANTE_PRODUTO_OBRIGATORIO`).
- Snapshot JSONB congelado uma única vez em `entrega_comprovantes.metadata.comprovante_snapshot_v1`, com hash SHA-256 e numeração `CE-YYYY-NNNNNN`.
- Reemissão: nunca reescreve conteúdo/número/hash; incrementa `comprovante_reemissoes` e grava `DELIVERY_RECEIPT_REISSUED` em `financial_audit_log`.
- Concorrência: `pg_advisory_xact_lock` por entrega + `SELECT … FOR UPDATE` (duplo clique não duplica).

Erros canônicos: `COMPROVANTE_UNAUTHENTICATED`, `COMPROVANTE_FORBIDDEN`, `COMPROVANTE_ENTREGA_NAO_ENCONTRADA`, `COMPROVANTE_ENTREGA_CANCELADA`, `COMPROVANTE_CLIENTE_OBRIGATORIO`, `COMPROVANTE_OS_OBRIGATORIA`, `COMPROVANTE_SEM_ITENS`, `COMPROVANTE_PRODUTO_OBRIGATORIO`, `COMPROVANTE_LOTE_OBRIGATORIO`, `COMPROVANTE_QUANTIDADE_OBRIGATORIA`, `COMPROVANTE_VOLUME_OBRIGATORIO`, `COMPROVANTE_CONFIRMACAO_SEM_DATA`.

## 4. Correção do fallback (item 7 do gate)

O fallback usava `FROM public.entregas e2` enquanto as expressões referenciavam a variável PL/pgSQL `e`. Não havia shadowing (aliases distintos) e o resultado era correto, porém a leitura era ambígua. Na migration 4 todas as referências da consulta passaram a usar `e2` (linha atual), incluindo `quantidade_entregue`, `volume_entregue_ml`, `produto_id`, `lote_id` e `estoque_produto_id`. Harness reexecutado após a correção.

## 5. ACL / RLS / least privilege

- `public.is_delivery_staff(uid)` autoriza exatamente: `administrador`, `gestor`, `administrativo`, `producao`, `operador_onfarm`, `aplicador` (via `has_role`). Gate D26 confirma que nenhum usuário fora dessa lista é autorizado.
- `authenticated` tem EXECUTE apenas na RPC; **não é bypass**, porque a própria RPC nega internamente (`COMPROVANTE_UNAUTHENTICATED` / `COMPROVANTE_FORBIDDEN`) — comprovado por D17/D18.
- `fn_comprovante_entrega_montar_v1`: EXECUTE revogado de `PUBLIC`, `anon` **e `authenticated`** (D19). Só é chamada internamente pelo motor `SECURITY DEFINER`.
- `anon` sem qualquer grant em `entrega_comprovantes` / `entrega_termos` (D05); RLS ativa nas duas tabelas (D25), políticas existentes preservadas — nenhum acesso foi ampliado.
- `search_path = public, extensions, pg_temp` nas duas funções (D04).

## 6. Frontend

`src/lib/comprovanteEntregaPdf.ts` mantido (íntegro): não importa o cliente do backend, não consulta tabelas e não reintroduz regra de negócio — apenas renderiza o payload canônico (`doc_tipo`, `titulo`, `definitivo`, `numero_documento`, `conteudo`, `snapshot_hash`, `aviso`) devolvido pela RPC. `src/pages/Entregas.tsx` chama `gerarDocumentoEntregaPDF` e traduz os erros canônicos.
**O layout NÃO está homologado nesta fase** — permanece pendente de fase de layout.

## 7. Evidências de teste

Harness `restoration/os-e2e/33-comprovante-20260903.sql` (BEGIN … ROLLBACK), staging: **26/26 PASS**.

D01–D05 ACL/search_path/grants · D06–D08 romaneio e zero snapshot · D09 `entregue` sem recebedor bloqueado no banco · D10–D13 comprovante, numeração `CE-2026-000006`, recebedor ≠ confirmado_por, duplo clique sem duplicação · D14 snapshot imune a alteração de cliente · D15 reemissão só incrementa auditoria (número e hash preservados) · D16 dados mínimos exigidos · D17 autenticado sem role negado · D18 anônimo negado · D19 helper sem EXECUTE · D20 sem OS negado · D21 volume zero negado · D22 sem lote negado · D23 snapshot imune a renomear produto · D24 perfil `producao` autorizado · D25 RLS ativa · D26 `is_delivery_staff` restrita.

Resíduo pós-ROLLBACK: `residuo_entregas_fixture = 0`, `residuo_comprovantes_ce = 0`.

Demais validações: runner fail-closed PASS · rollback rehearsal PASS · connection-binding static test PASS · `tsgo --noEmit` PASS · Vitest **2776 passed / 0 fail** · build PASS.

## 8. Riscos residuais

- Layout do PDF ainda não homologado (fase seguinte).
- QR público / verificação externa não implementados (fora de escopo, deliberado).
- Entregas legadas confirmadas sem OS ou sem volume não conseguirão emitir comprovante definitivo — por desenho; permanecem com romaneio até serem regularizadas.
- Nenhuma promoção para produção foi feita nem preparada.

## Veredito

**FASE_2_CERTIFICADA_PARA_LAYOUT**
