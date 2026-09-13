# Roadmap de Tarefas

## Lotes — 2026-09-13
- [x] Auditoria local de Lotes, correções de consulta e relatório em restoration/lotes/README.md; 55/55 focados, 134/135 ampliados.
- Pendências Lotes: rastreabilidade completa e snapshot/agregações globais exigem etapa autorizada; E2E conectado proibido. Gate ampliado .env divergente separado do runtime aprovado; typecheck separado sem evidência.
- Constraints numéricas OS aplicadas e validadas manualmente conforme usuário; não reaplicar.

## Ordens de Serviço — 2026-09-13
- [x] Auditoria local e correções frontend; 64/64 testes focados, 114/115 ampliados. Runtime canônico e tipos íntegros.
- [ ] Aceite integral bloqueado pelo gate do .env gerenciado divergente; correção externa necessária. Sem E2E conectado nesta etapa.
- [x] SQL numérico OS aplicado/validado manualmente conforme usuário em 13/09/2026; não reaplicar. Demais riscos de servidor exigem auditoria autorizada.
- H10 aplicado e verificado manualmente pelo usuário; não reaplicar. Trabalhos históricos fora deste escopo permanecem suspensos.

## Aplicações — unidades (correção focada)
- Concluído frontend seguro: bloqueio por unidade ausente no contrato da OS, cálculo dimensional sem conversão, limpeza ao trocar OS e coerência temporal; testes puros 19/19.
- Pendente: habilitação multiunidade exige vínculo persistente OS/prescrição e snapshot de unidade ausentes no contrato atual; não houve alteração de banco.
- Typecheck/build não executados manualmente (restrição do ambiente); log automático segue com erros preexistentes de tipos gerados.
- Bloqueio externo identificado antes das edições: conexão local divergente e tipos gerados com 2.060 linhas; arquivos protegidos não alterados.

## Catálogo na prévia — lote atual
- Tratamento atômico de erros do catálogo e revisão técnica implementado; testes direcionados 24/24.
- Logs da prévia: único destino CultivoFarm; Produtos respondeu HTTP 200 com []. Causa do retorno vazio não comprovada. Validação automática bloqueada por tipos gerados truncados (arquivo protegido); nenhum banco acessado.

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
- [x] P0-03A: PWA com atualização obrigatória, tomada automática de controle, recarga protegida contra loop e gate runtime fail-closed para o CultivoFarm; 3.667 testes, typecheck e build aprovados; prévia verificada sem publicação.
- [ ] Concluir binding CultivoFarm `swzpzcwiasxmjutrmvkm`: cliente, guarda fiscal e configuração local estão alinhados, mas a conexão Lovable Cloud ainda regenera `.env` e `types.ts` para o sandbox; requer reconexão externa antes do aceite integral. Emissão fiscal de produção permanece bloqueada.
- **Onda P1 da promoção H9 (produção `navfzbwgwzruipouyfnk`)** — convergência `20261101000000` e authz `20261006000000` / `20261015000000` aplicadas e pós-checadas; ledger 490/`20260723000000` → 493/`20261101000000`; 3 registros `APLICADA`/`P1` em `public.promocao_execucao_registro`; tabelas de convergência com RLS, zero policies, sem SELECT para anon/authenticated, vazias e sem baseline. Registro: `restoration/promocao-producao-h9/25-p1-conclusao-convergencia-e-authz.md`.
- Hardening `security_invoker` das 3 views de produção (P0d), incluindo `public._src_vw_esteira_laboratorio` — mantido explicitamente fora do ledger, sem version fictícia.
- Exportação integral dos artefatos P1 para execução manual local.

- [x] CultivoFarm: pacote determinístico local gerado (20..27) — 314 incluídas, 260 REVISAO_DML, 126 REVISAO_REF_GUARD, 20 sandbox, 1 marker. Promoção NO-GO até revisão humana.
- [x] Logomarca CultivoFarm aplicada na tela `/auth` + favicon; `src/integrations/supabase/types.ts` restaurado do baseline `f3e125c6` (21.850 linhas) após regeneração indevida do Sandbox — typecheck limpo.
- [x] CAT-05: removida superfície destrutiva "Recarregar Catálogo A.R Bio v1.3" de `src/components/protocolos/ProdutosTab.tsx`; teste estático 6/6; typecheck e build OK; binding CultivoFarm preservado.

## Correção da prévia — 2026-09-11
- [x] Contrato TypeScript completo restaurado do baseline f3e125c6 (21.850 linhas); compilação automática build OK e testes direcionados 305/305. Sem acesso ao banco.
- [ ] Regressão às 18:20 UTC: contrato gerado novamente reduzido a 2.060 linhas, com tabelas e colunas ausentes nos erros de compilação. Bloqueio: arquivo gerado protegido contra edição; corrigir a integração geradora antes de restaurar o contrato. Sem acesso ao banco, deploy ou alteração de binding.

## 2026-09-11 19:26 UTC — Restaurar types.ts após build errors pós-CAT-06
- Bloqueio: build-errors.log mostra types.ts truncado (tabelas ausentes: registros_consultor_arquivos, microorganism_targets, formulacoes, etc.).
- Ação: restaurar src/integrations/supabase/types.ts do baseline completo; rodar typecheck/build.
- Restrições: não alterar .env, client.ts, config.toml, banco, migrations, backend.

## 2026-09-12 03:49 UTC — Build errors pós-renomeação da migration comercial
- [x] Corrigido: `src/integrations/supabase/types.ts` restaurado do baseline completo (21.850 linhas).
- [x] Verificado: `.env` aponta exclusivamente para CultivoFarm (`swzpzcwiasxmjutrmvkm`).
- [x] Typecheck limpo; build automático OK; testes focados comerciais + CAT-05/09/10 = 61/61 aprovados.
- Restrições respeitadas: sem acesso a banco, migrations, backend, deploy ou publicação.

## Cockpit Laboratório — auditoria atual
- Correções frontend parciais de estados, filtros, métricas e guardas realizadas; 28 testes focados aprovados; riscos documentados.
- Pendente: homologação completa e compilação limpa, bloqueadas por integração divergente e tipos gerados incompletos. Não executar preview conectado.
- Bloqueio: ambiente divergente e types.ts com 2.060 linhas; arquivos gerados protegidos, restauração exige correção da integração.
- Sem acesso ao banco, publicação ou GitHub; tarefas históricas fora do escopo permanecem suspensas.

- Nova solicitação: corrigir erros de compilação preexistentes; diagnóstico aponta incompatibilidade dos tipos gerados com o contrato canônico. Não mascarar com casts ou alterar arquivos protegidos.

## Proteção CultivoFarm independente do Cloud
- [x] Cópia histórica própria e imports de produção.
- [x] 111 testes aprovados (28 centrais Cockpit, 67 cálculos e 16 vínculo); log automático build OK. Typecheck manual não executado por restrição do ambiente.
- Sem acesso a banco; arquivos gerenciados de ambiente não alterados.
