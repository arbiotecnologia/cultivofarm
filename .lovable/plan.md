# D51.3 — Primeiro acesso único e isolamento tenant do Dashboard

## Objetivo
Eliminar a dupla definição de senha no primeiro acesso e impedir vazamento cross-tenant em `/dashboard/geral`, sem criar papéis, rotas ou dashboards paralelos.

## Fases aprovadas

### A — Primeiro acesso único
- Diagnosticar server-side a pendência de primeiro acesso em `/reset-password`.
- Se pendente, concluir senha e estado provisório exclusivamente por `platform-complete-first-access`.
- Se não pendente, manter o recovery comum por `auth.updateUser`.
- Falhar fechado em erro de diagnóstico e preservar `TrocaSenhaObrigatoria` como barreira legada.
- Cobrir finalizador único, falhas, link inválido, senha e limpeza do fragmento sensível.

### B — Inventário tenant do Dashboard
- Mapear todas as RPCs, views, consultas, tabelas, políticas e vínculos realmente alcançados por `/dashboard/geral`.
- Registrar fonte, escopo atual e correção mínima.

### C — Organização server-side
- Reutilizar ou criar um único helper privado que derive `organization_id` de `auth.uid()` e `profiles` ativo.
- Não aceitar organização do cliente; usar `search_path` restrito e privilégios mínimos.

### D — RPCs do Dashboard
- Corrigir `rpc_executivo_resumo_geral`, `rpc_dashboard_geral_lab_resumo` e helpers relacionados.
- Filtrar por organização server-side; fontes sem ownership determinístico devem falhar fechadas.
- Não conceder agregado operacional global implícito ao Superadmin.

### E — RLS e consultas diretas
- Ajustar somente as tabelas realmente alcançáveis pela tela.
- Aplicar predicados tenant em leitura e escrita; não ampliar o escopo às demais tabelas do sistema.

### F — Dados legados
- Fazer backfill somente quando houver vínculo determinístico e auditável.
- Excluir do Dashboard registros sem vínculo seguro e documentar a pendência.

### G — Testes de isolamento
- Validar organizações A/B, tentativa de forjar organização, REST/RLS, RPCs SECURITY DEFINER, usuário sem organização, inativo e Superadmin sem vínculo operacional.
- Usar fixtures transacionais com rollback quando tecnicamente possível, sem criar dados permanentes.

### H — Performance
- Avaliar planos e criar apenas índices necessários aos filtros tenant.
- Manter agregações server-side e evitar consultas amplas.

### I — Deploy e gate
- Aplicar migrations versionadas no Supabase canônico `swzpzcwiasxmjutrmvkm` após validações.
- Executar testes focados e globais, typecheck, build, scanner, advisors e smoke passivo.
- Documentar rollback/forward-fix, atualizar auditoria, matriz e roadmap e emitir GO/NO-GO.

## Restrições
- Preservar dados e histórico; não inventar associações tenant.
- Não criar fluxo, papel, rota ou Dashboard paralelo.
- Não avançar a Fase 2 da campanha enquanto o isolamento não estiver PASS.
