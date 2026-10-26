# C2 — Leitura administrativa da carteira do commercial owner (2026-10-26)

**Status: INATIVO — somente revisão. Não aplicar sem autorização explícita do proprietário.**

## Causa raiz (evidência READ ONLY em produção, 2026-10-26)

Homologação PB-001029: administrador A (org dona da carteira) em `/comercial/pedidos-b2b`
via "Nenhum pedido encontrado" nos filtros "Em análise" e "Todos"; admin B (org estrangeira)
também via zero (negativo esperado). A/B **não** homologado: o positivo A falhou.

- `partner_orders` tem policy **restritiva** `b2b_phase1_tenant_guard` que exige
  `platform_private.b2b_phase1_partner_visible(partner_id, false)` em toda leitura.
- Para ator interno, `b2b_phase1_partner_visible` resolve `b2b_actor_scope` e exige
  `org_partner = partner_id`. A org do admin A é **dona comercial** da carteira
  (`commercial_owner_organization_id`), não parceira — `org_partner` é NULL → guard falso →
  zero linhas, mesmo com a policy permissiva `partner_orders_select` (administrador/gestor_comercial).
- O canal do parceiro (`get_my_commercial_orders_projection`) cobre só o usuário externo
  `parceiro_b2b`; não existe leitor canônico para o admin interno da empresa dona da carteira.

## Correção proposta (candidate.sql.review)

Nova leitura **somente leitura**, escopada e fail-closed:

- `platform_private.c2_commercial_owner_orders_core(text,uuid,timestamptz,timestamptz)`
  SECURITY DEFINER: deriva a organização do ator **no servidor** (perfil ativo + org ativa),
  exige papel `administrador` ou `gestor_comercial`, e retorna apenas pedidos cujo parceiro
  tem `commercial_owner_organization_id = org do ator` (parceiro ativo/não deletado).
  Sem escopo ou sem papel → `42501`. Org nunca vem de parâmetro.
- `public.c2_commercial_owner_orders_projection(...)` INVOKER wrapper no padrão canônico
  (mesmo ACL de `get_my_commercial_orders_projection`: `authenticated` + `service_role`,
  owner `postgres`; autorização dentro do core).
- Filtros opcionais: status (texto, comparado como texto — enum inválido não quebra),
  partner_id, janela de datas. Limite 200, ordenação `created_at DESC, id`.

## Garantias

- **Deny B preservado**: org estrangeira não tem parceiros com `commercial_owner_organization_id`
  igual à sua org → lista vazia; sem papel interno → `42501`.
- **Vínculo revogado**: perfil/org inativos → `actor_scope_unavailable`; parceiro inativo/deletado
  → fora da lista.
- **Sem policy ampla, sem bypass de service**: nenhuma policy de `partner_orders` é alterada;
  o core é DEFINER com `search_path` fixo e validação interna.
- **Sem escrita**: a função não grava nada; aprovação/cobrança/NF/entrega seguem nos endpoints
  canônicos existentes, inalterados.

## Reconciliação com a tarefa anterior (mesmo dia)

O acompanhamento do parceiro (`CommercialOwnOrders` em `/portal-parceiro/pedidos`) e a
correção da data desejada permanecem intactos — este pacote cobre o lado **administrativo
da empresa dona da carteira**, canal separado e complementar.

## Limitações / NO-GO

- Não abre detalhe, itens, mensagens nem ações para o admin da carteira — somente listagem.
- Não certifica JWT/RLS real; testes locais usam transporte sintético.
- Gate contábil A (DRAFT) segue pendente; este pacote não promove nem valida contabilidade.
- Aplicar somente com preflight PASS, revisão independente e autorização do proprietário.

## Arquivos

- `candidate.sql.review` — DDL proposta (transação única).
- `preflight.sql` — READ ONLY: funções ausentes, policies de `partner_orders` intactas.
- `postflight.sql` — READ ONLY: owner/ACL/md5 das funções novas; policies inalteradas.
- `rollback.sql.review` — DROP guardado por md5 das duas funções; não toca policies nem dados.
- `expected.json` — contrato, hashes e ACL esperados.
