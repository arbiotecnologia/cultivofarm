# Pedidos B2B — Fase 1

Módulo **independente** para gestão de parceiros comerciais (B2B) da AR Bio. Não altera Solicitações, Produção, Ordem de Serviço, Financeiro ou Estoque.

## Escopo da Fase 1

- Cadastro CRUD de Parceiros B2B com soft delete.
- Estrutura preparada para preços por parceiro (sem UI nesta fase).
- Auditoria completa de criação, edição, inativação/reativação e alterações de preço.
- Nova role `gestor_comercial` com acesso ao módulo.
- Menu **Comercial → Parceiros B2B**.

## Modelo de dados

### `partner_accounts`
Parceiros comerciais. `client_id` é opcional — o parceiro pode existir sem vínculo com um cliente cadastrado.
Campos principais: `codigo` (único), `razao_social`, `nome_fantasia`, `cnpj`, `desconto_padrao` (0–100%), `observacoes`, `ativo`, `deleted_at`.

### `partner_product_prices`
Tabela de preços por parceiro. Calcula `preco_final = preco_tabela × (1 − desconto_percentual/100)` automaticamente via trigger quando não informado. Único `(partner_id, product_id)` enquanto `ativo = true`.

### `partner_audit_logs`
Auditoria. Trigger `SECURITY DEFINER` registra `create`, `update`, `delete` (soft), `restore` e `price_change` com `dados_anteriores` e `dados_novos` em JSONB, vinculados a `auth.uid()`.

## Segurança (RLS)

Todas as policies usam `has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor_comercial')`. Demais roles não têm acesso.

- `partner_accounts`: SELECT/INSERT/UPDATE permitidos. **DELETE bloqueado** — usar soft delete (`ativo=false`, `deleted_at=now()`).
- `partner_product_prices`: SELECT/INSERT/UPDATE permitidos. Sem DELETE físico.
- `partner_audit_logs`: somente SELECT (inserção exclusiva via trigger).

## Frontend

- Rota: `/comercial/parceiros` (apenas admin e gestor_comercial em `permissions.ts`).
- Menu: novo grupo **Comercial** em `AppSidebar.tsx`.
- Listagem com busca debounced, filtro de status (ativos/inativos/todos) e paginação server-side (20/pág).
- Formulário com validação `zod` + CNPJ via `isValidCNPJ`.
- Mobile first: cards no mobile, tabela densa no desktop.

## Próximas fases (não nesta entrega)

- UI de preços por parceiro (CRUD em `partner_product_prices`).
- Catálogo de pedidos B2B.
- Integração com fluxo de OS / faturamento.
