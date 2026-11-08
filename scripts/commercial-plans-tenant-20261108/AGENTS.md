# Isolamento de planos comerciais — baseline instalada pelo auditor

- O auditor instalou `cc1f6cc…` em 08/11/2026; nunca reaplicar `02-install.sql.review` nem executar rollback como parte de outro candidato. Não publicar ou alterar planos/atribuições reais a partir deste pacote; preservar a baseline POSPLANOS.
- O projeto canônico é somente `swzpzcwiasxmjutrmvkm`; PRE/POST exigem a declaração de revisão desse ref como verificação de ambiente, nunca como autorização.
- As funções em `capture/functions/` são capturas read-only completas de `pg_get_functiondef`, com MD5 pinado em `capture/live-pins.json`; 25 são funções-alvo e três são chamadores reais usados pela fixture. `generate.py` deve validar todas as fontes e âncoras antes de emitir SQL.
- A propriedade é resolvida por família (`root_plan_id`) usando somente `profiles.user_id = commercial_payment_plans.created_by` (nunca `profiles.id`), destino das atribuições e versões B3. Zero ou múltiplos tenants permanecem NULL e negados; nunca inferir por nome, CNPJ ou código. O plano `d89ce2b4-9f68-4b0e-b78e-5009b6119a4f` não pode ser atribuído à ARBio: sua evidência canônica disponível aponta exclusivamente para `8eae2bc1-ad00-4402-9f57-564258e493ca`; divergência futura o torna ambíguo e fechado.
- Planos novos herdam o tenant ativo do ator interno; `organization_id` e vínculos entre plano, destino e versão B3 devem permanecer consistentes. Não alterar snapshots, pedidos, recebíveis ou histórico.
- `payment_methods` e categorias financeiras continuam catálogos de referência; o comprador só os recebe por condição B3 publicada, vigente, atribuída e compatível com o tenant vendedor.
- Rollback é deny-only: fecha RPCs e leituras, preserva coluna, índice por tenant, cercas, versões e dados; nunca restaura funções ou o índice global vulneráveis.
- PostgreSQL descartável e Auth sintética não provam JWT/RLS/PostgREST/Storage hospedados. O bloqueio de liberação só pode ser revisto após reteste real ARBio/FSF, sem escrita FSF.
