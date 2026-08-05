# Harnesses de teste — NÃO IMPLANTÁVEIS

Este diretório está **fora** de `supabase/functions/` de propósito.

Regra permanente (P0 de segurança, auditoria 2026-08-05):

- Nenhum harness de teste pode ser publicado como Edge Function.
- Nenhum harness pode ser exposto com `verify_jwt = false`.
- Harness que usa `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` para criar
  ou remover usuários Auth **jamais** pode aceitar POST público.

O conteúdo aqui é preservado apenas como referência de execução manual e
auditoria. Para executar, rode localmente com `deno run` contra staging,
nunca via deploy.

## Histórico

| Harness | Origem | Situação |
| --- | --- | --- |
| `visita-atendimentos-runtime-harness` | `supabase/functions/` | Deployment removido do staging em 2026-08-05; endpoint responde 404 (`NOT_FOUND`). `verify_jwt=false` retirado de `supabase/config.toml`. |
