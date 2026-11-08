# Isolamento de planos comerciais — preparação inativa

- Nunca aplicar `02-install.sql.review` ou `04-rollback-deny.sql.review` no banco hospedado, publicar ou alterar planos/atribuições reais; o auditor revisa e executa após autorização específica.
- O projeto canônico é somente `swzpzcwiasxmjutrmvkm`; PRE/POST exigem a declaração de revisão desse ref como verificação de ambiente, nunca como autorização.
- As funções em `capture/functions/` são capturas read-only completas de `pg_get_functiondef`, com MD5 pinado em `capture/live-pins.json`; 25 são funções-alvo e três são chamadores reais usados pela fixture. `generate.py` deve validar todas as fontes e âncoras antes de emitir SQL.
- A propriedade é resolvida por família (`root_plan_id`) usando somente perfil de `created_by`, destino das atribuições e versões B3. Zero ou múltiplos tenants permanecem NULL e negados; nunca inferir por nome, CNPJ ou código.
- Planos novos herdam o tenant ativo do ator interno; `organization_id` e vínculos entre plano, destino e versão B3 devem permanecer consistentes. Não alterar snapshots, pedidos, recebíveis ou histórico.
- `payment_methods` e categorias financeiras continuam catálogos de referência; o comprador só os recebe por condição B3 publicada, vigente, atribuída e compatível com o tenant vendedor.
- Rollback é deny-only: fecha RPCs e leituras, preserva coluna, índice por tenant, cercas, versões e dados; nunca restaura funções ou o índice global vulneráveis.
- PostgreSQL descartável e Auth sintética não provam JWT/RLS/PostgREST/Storage hospedados. O bloqueio de liberação só pode ser revisto após reteste real ARBio/FSF, sem escrita FSF.
