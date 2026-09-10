# Roadmap de Tarefas

## Em aberto

### Anexar evidências locais da P1
- Arquivar em `restoration/promocao-producao-h9/evidencias/`, com SHA-256: `p1-security-invoker-production.sql` e as saídas brutas de pre/post-check das três unidades executadas.
- Arquivar a leitura literal do Security Advisor de produção pós-convergência.
- **Bloqueio:** os arquivos existem apenas na máquina do operador.

### Convergir homologação
- Aplicar `20261006000000`, `20261015000000` e `20261101000000` também em `ikaauvsflpmamgxmkhoq`, para que os dois ledgers avancem juntos.

### Variante H7n específica de produção — onda A1 reclassificada como NO-OP
- Pacote `restoration/promocao-producao-h9/h7n-prod/` gerado e baixado localmente (ZIP SHA-256 `a80832ab0c1cb6c979243b49f45944226f79ca2931b46012295b32f0e44c0d97`). Registros: `restoration/promocao-producao-h9/27-h7n-prod-pacote-variante.md` e `restoration/promocao-producao-h9/28-h7n-prod-a1-noop-evidencia-real.md`.
- **Evidência real de produção (2026-09-10):** censo somente leitura em `navfzbwgwzruipouyfnk` confirmou ledger 493/`20261101000000`, 3/3 views alvo com `security_invoker=true`, ACLs preservadas, schema `private` ausente, 277 `SECURITY DEFINER` para `authenticated`, e objetos ausentes (views de catálogo, `fn_catalogo_preco_canonico`, 4 helpers P2).
- **Veredito A1:** `NO-OP / NAO EXECUTADA` — estado-alvo já existe; não registrar no ledger.
- **Bloqueio A2..A5:** censo de dependências arquivado, diff de corpos das RPCs do P1b, promoção prévia de `fn_catalogo_preco_canonico`, views de catálogo e 4 helpers da P2, e classificação dos 277 SECURITY DEFINER.

### Dry-run H7n-PROD em homologação (preparado, não executado)
- Pacote criado em `restoration/promocao-producao-h9/h7n-prod/dry-run/`: checklist de dependências A2..A5/P2, prechecks somente leitura e plano com 12 gates de aceite. Registro: `restoration/promocao-producao-h9/29-h7n-prod-dry-run-homologacao-preparado.md`.
- **Bloqueio:** o Supabase de homologação `ikaauvsflpmamgxmkhoq` exige novo login autenticado; sem ele nenhum dry-run pode ser executado, nem somente leitura.
- Vereditos preservados: A1 `NO-OP` (fora do ledger), A2..A5 `NO-GO`, P2 `BLOQUEADA`, promoção `NO-GO`.



### Onda P2
- **NO-GO / bloqueada** até autorização explícita, arquivamento das evidências da P1 e dry-run verde da variante H7n.

### Promoção estrutural para o CultivoFarm `swzpzcwiasxmjutrmvkm`
- Pacote de preparação criado em `restoration/promocao-cultivofarm/`: prechecks somente leitura, gerador do baseline estrutural, pós-checks/gates, rollback por onda, runbook local e manifesto de exclusões. Relatório: `restoration/promocao-cultivofarm/10-relatorio-final.md`.
- Escopo: apenas schema, funções, views, RLS, policies, índices e triggers. Sem dados, sem usuários (só `admin@arbio.com` na etapa posterior), sem Storage, sem harnesses, sem as 20 migrations de sandbox.
- Estratégia: baseline por `pg_dump --schema-only` da homologação, não replay das 721 migrations.
- **Bloqueios:** sem canal autenticado para `swzpzcwiasxmjutrmvkm` neste ambiente (execução é local); sessão de homologação expirada impede gerar o dump; backup/PITR do CultivoFarm não confirmado; `.env` do repositório em drift para o sandbox.
- **Ação manual necessária:** obter a connection string e confirmar backups no dashboard do CultivoFarm, habilitar extensões e rodar `supabase link --project-ref swzpzcwiasxmjutrmvkm` localmente.
- Veredito: preparação concluída, promoção **NO-GO**.


## Concluídas
- **Onda P1 da promoção H9 (produção `navfzbwgwzruipouyfnk`)** — convergência `20261101000000` e authz `20261006000000` / `20261015000000` aplicadas e pós-checadas; ledger 490/`20260723000000` → 493/`20261101000000`; 3 registros `APLICADA`/`P1` em `public.promocao_execucao_registro`; tabelas de convergência com RLS, zero policies, sem SELECT para anon/authenticated, vazias e sem baseline. Registro: `restoration/promocao-producao-h9/25-p1-conclusao-convergencia-e-authz.md`.
- Hardening `security_invoker` das 3 views de produção (P0d), incluindo `public._src_vw_esteira_laboratorio` — mantido explicitamente fora do ledger, sem version fictícia.
- Exportação integral dos artefatos P1 para execução manual local.

- [x] CultivoFarm: pacote determinístico local gerado (20..27) — 314 incluídas, 260 REVISAO_DML, 126 REVISAO_REF_GUARD, 20 sandbox, 1 marker. Promoção NO-GO até revisão humana.
- [x] Logomarca CultivoFarm aplicada na tela `/auth` + favicon; `src/integrations/supabase/types.ts` restaurado do baseline `f3e125c6` (21.850 linhas) após regeneração indevida do Sandbox — typecheck limpo.
