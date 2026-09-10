# Roadmap de Tarefas

## Em aberto

### Anexar evidências locais da P1
- Arquivar em `restoration/promocao-producao-h9/evidencias/`, com SHA-256: `p1-security-invoker-production.sql` e as saídas brutas de pre/post-check das três unidades executadas.
- Arquivar a leitura literal do Security Advisor de produção pós-convergência.
- **Bloqueio:** os arquivos existem apenas na máquina do operador.

### Convergir homologação
- Aplicar `20261006000000`, `20261015000000` e `20261101000000` também em `ikaauvsflpmamgxmkhoq`, para que os dois ledgers avancem juntos.

### Onda P2
- **NO-GO / bloqueada** até autorização explícita e arquivamento das evidências da P1.

## Concluídas
- **Onda P1 da promoção H9 (produção `navfzbwgwzruipouyfnk`)** — convergência `20261101000000` e authz `20261006000000` / `20261015000000` aplicadas e pós-checadas; ledger 490/`20260723000000` → 493/`20261101000000`; 3 registros `APLICADA`/`P1` em `public.promocao_execucao_registro`; tabelas de convergência com RLS, zero policies, sem SELECT para anon/authenticated, vazias e sem baseline. Registro: `restoration/promocao-producao-h9/25-p1-conclusao-convergencia-e-authz.md`.
- Hardening `security_invoker` das 3 views de produção (P0d), incluindo `public._src_vw_esteira_laboratorio` — mantido explicitamente fora do ledger, sem version fictícia.
- Exportação integral dos artefatos P1 para execução manual local.
