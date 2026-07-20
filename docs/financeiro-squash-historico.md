# Squash Histórico — Módulo Financeiro

**Data de aplicação:** 2026-06-26
**Status:** ✅ **RESOLVIDO**

## Resumo

Todos os arquivos históricos sob `supabase/migrations/` que ainda
continham `INSERT` em `financial_audit_log` com colunas legadas
(`event_type`, `details`, `user_id`, `payload`) foram corrigidos
in place para o schema canônico
(`entity_type`, `entity_id`, `action`, `new_data`, `performed_by`,
`reason`).

## Arquivos corrigidos

| Arquivo | Ocorrências antes | Estado atual |
|---------|-------------------|--------------|
| `20260520210810_f9a5bbdd-67c7-42f4-b4b6-90432bdf7f07.sql` | 1 (`user_id`, `details`) | ✅ canônico |
| `20260521142254_0454ec5d-eba5-4749-8ac8-eeda2fa90683.sql` | 3 (`event_type`, `details`) | ✅ canônico |
| `20260521143433_b803fb8b-04cf-4cfe-abfb-cd536bd7b01b.sql` | 4 (`event_type`, `details`) | ✅ canônico |
| `20260613181329_92a6bb67-da12-4506-baa4-4cdd626e16b3.sql` | 1 (`user_id`, `payload`) | ✅ canônico |

## Validação global pós-correção

```
rg "financial_audit_log\(event_type" supabase/migrations/                          → 0
rg "financial_audit_log\(user_id"    supabase/migrations/                          → 0
rg "financial_audit_log\(details"    supabase/migrations/                          → 0
rg "financial_audit_log\(payload"    supabase/migrations/                          → 0
rg "financial_audit_log \(\s*(user_id|event_type)" supabase/migrations/            → 0
```

Nenhuma referência viva a colunas legadas permanece. Padrões antigos
seguem mencionados apenas em:

- documentação (`docs/financeiro-*.md`);
- a migration defensiva `20260626193347_*.sql`, que **lê** assinaturas
  de funções para impedir regressão.

## Estado atual

- Runtime: canônico, testado, com guarda defensiva ativa
  (`20260626193347_*.sql`).
- Histórico de migrations: 100% canônico após a correção da última
  ocorrência residual (`20260520210810_*.sql`).
- Banco novo: apto a executar `supabase db reset` sem falha por
  colunas inexistentes em `financial_audit_log`.

**Recomendação operacional:** validar `supabase db reset` em ambiente
limpo antes de subir produção a partir do histórico atual.

## Mapeamento canônico (referência)

| Coluna legada | Coluna oficial |
|---------------|----------------|
| `event_type` | `action` |
| `details` | `new_data` |
| `user_id` | `performed_by` |
| `payload` | `new_data` |
