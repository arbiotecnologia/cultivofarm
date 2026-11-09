# Tentativa 24 — reconciliação dos 7 corpos divergentes (espelho PG17 descartável)

Guarda 81: **NÃO APROVADA**. Nada hospedado, publicado, ativado ou enviado. Gates fiscal/logístico/envios fechados.
Tentativas 14 e 23 abortadas (erro de digitação no hook / cancelamento da ferramenta), preservadas com sufixo `-aborted-*`; 15–22 são iterações de diagnóstico.

## Resultado
- exit 1 · harness 318/320 · CCR2 109/111 · overlay SHA256 `027b1d41a9341ce181f167c8090bf453d53307530f5c89538bc6f1b8c13802ff`
- Os 7 corpos instalados **verbatim** a partir de `live-exact-7/capture-20261109.json` (md5 do texto re-verificado ao carregar):
  md5(pg_get_functiondef) no espelho = captura produção 09/11 para **7/7**.
- Writers POSPLANOS: 25/25 iguais aos pins POST; rollback/reinstall 81 preserva corpos e dados. Rollback B3 04: NOT_RUN (obsoleto, sem repin).

## Classificação dos 7 diffs (arquivos `live-exact-7/*.diff`)
Todos são **desatualização funcional** do espelho (corpos reduzidos/permissivos da fixture B3), não apenas costura de Auth:

| Função | Espelho anterior | LIVE |
|---|---|---|
| `public.b2b_phase1_order_visible` | SECURITY DEFINER; visível a qualquer perfil ativo da empresa dona | wrapper STABLE para `platform_private.b2b_phase1_order_visible` |
| `public.fn_b2b_status_is_approved_or_later` | lista fixa de status, sem search_path | IMMUTABLE, `aprovado OR fn_b2b_status_is_operational` |
| `public.get_partner_order_payment_terms_secure` | retornava `{}` | leitor B2B_ORDER_PAYMENT_TERMS_READ_V1 com portas de visibilidade e papel |
| `platform_private.b2b_actor_scope` | **stub permissivo** (ignora revogação, tenant, valid_from, org ativa); colunas OUT em outra ordem | cadeia completa perfil→org→tenant→dono |
| `platform_private.b2b_internal_commercial_actor` | qualquer perfil ativo | admin/gestor_comercial com org h15 e acesso pronto, sem papel externo |
| `platform_private.c2_partner_order_attempt_authz` | só `c2_order_actor_scope` | ordem completa do create canônico (produtor, técnico, parceiro) |
| `platform_private.b2b_internal_order_snapshot_guard` | bloqueava todo status operacional | permite só via `b2b_resale_delivery_status_transition_valid_v1` (gate etapa 41) |

`b2b_actor_scope`, `fn_b2b_status_is_approved_or_later` e `c2_partner_order_attempt_authz` mudaram nomes/forma de saída: recriados (DROP sem CASCADE) com a mesma ACL do espelho anterior (verificado).

## Costuras declaradas (não são prova LIVE)
- Auth: `auth.uid()` do harness via `request.jwt.claim(s)`; não é JWT hospedado.
- Logística: tabelas `ordens_servico`/`entregas` reduzidas e **vazias** só se ausentes; DDL de `delivery_context_20261030` copiado de `real_triggers.py`. Corpos de `b2b_resale_delivery_order_valid_v1` e `..._status_transition_valid_v1` copiados da etapa 41 instalada; gate `enabled=false`.
- Capturas reais de 06/11 do repo (não reconfirmadas 09/11), instaladas só onde ausentes: `is_valid_b2b_partner_user`, `b2b_phase1_partner_visible` (público/privado), `b2b_owner_internal_partner_readable`, `platform_private.b2b_phase1_order_visible`.
- Fixture: `partner_users.valid_from` NULL → now()-1 dia (só linhas sintéticas).

## Controles reais exercitados
- `b2b_actor_scope`: positivo resolve o próprio parceiro; negado para vínculo revogado, tenant divergente, valid_from futuro e parceiro inativo (4/4).
- `c2_partner_order_attempt_authz`: próprio parceiro autorizado; parceiro de outra empresa → `forbidden_partner`.
- Guarda LIVE com gate OFF: avanço para `em_producao` → `B2B_INTERNAL_DOWNSTREAM_UNVERIFIED`; transição de entrega falsa em todos os pedidos.

## 2 falhas abertas (não afrouxadas)
1. **attempt_authz com vínculo revogado passou.** O corpo LIVE depende de `public.get_user_partner_id()` e `platform_private.c2_order_actor_scope(uuid,uuid)`; no espelho ambos são stubs (o primeiro ignora `revoked_at`). Nenhum dos dois estava na lista de 70. Requer captura exata.
2. **Resposta do vendedor (admin A) negada com `b2b_phase1_scope_denied`.** Com o wrapper LIVE, a visibilidade passa por `platform_private.b2b_phase1_partner_visible` (captura 06/11), que para usuário interno só aceita `org_partner = parceiro` — admin do fornecedor não tem. Ou a produção mudou após 06/11, ou é um bloqueio real do LIVE na resposta do vendedor. Requer reconfirmação 09/11 antes de concluir; nada foi alterado.

Lista de capturas solicitadas: `capture-request-20261109.json`.
