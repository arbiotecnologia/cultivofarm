# Roadmap de Tarefas

## Em aberto

### Anexar evidências locais da P1
- Arquivar em `restoration/promocao-producao-h9/evidencias/`, com SHA-256: `p1-security-invoker-production.sql` e as saídas brutas de pre/post-check das três unidades executadas.
- Arquivar a leitura literal do Security Advisor de produção pós-convergência.
- **Bloqueio:** os arquivos existem apenas na máquina do operador.

### Convergir homologação
- Aplicar `20261006000000`, `20261015000000` e `20261101000000` também em `ikaauvsflpmamgxmkhoq`, para que os dois ledgers avancem juntos.

### Variante H7n específica de produção — onda A1 preparada
- Pacote `restoration/promocao-producao-h9/h7n-prod/` gerado: diff de contratos, censo, prechecks, forward `20261103000000`, pós-checks, rollback fail-closed e critérios de aceite. Registro: `restoration/promocao-producao-h9/27-h7n-prod-pacote-variante.md`.
- **Pendente:** dry-run em homologação com a matriz de 10 perfis, prechecks em produção e confirmação de backup antes de qualquer execução.
- **Bloqueio A2..A5:** censo de dependências em produção, diff de corpos das RPCs do P1b, promoção prévia de `fn_catalogo_preco_canonico`, views de catálogo e 4 helpers da P2, e classificação dos 277 SECURITY DEFINER.


### Onda P2
- **NO-GO / bloqueada** até autorização explícita, arquivamento das evidências da P1 e dry-run verde da variante H7n.


## Concluídas
- **Onda P1 da promoção H9 (produção `navfzbwgwzruipouyfnk`)** — convergência `20261101000000` e authz `20261006000000` / `20261015000000` aplicadas e pós-checadas; ledger 490/`20260723000000` → 493/`20261101000000`; 3 registros `APLICADA`/`P1` em `public.promocao_execucao_registro`; tabelas de convergência com RLS, zero policies, sem SELECT para anon/authenticated, vazias e sem baseline. Registro: `restoration/promocao-producao-h9/25-p1-conclusao-convergencia-e-authz.md`.
- Hardening `security_invoker` das 3 views de produção (P0d), incluindo `public._src_vw_esteira_laboratorio` — mantido explicitamente fora do ledger, sem version fictícia.
- Exportação integral dos artefatos P1 para execução manual local.
