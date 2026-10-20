# Ativação runtime do frontend CQ manual — 2026-10-20
Pacote final 26509be763c2afadf9b05d149704ffc1a2faad08. 3 candidatos copiados byte-exatos; OSDetalhesDialog difere só em MANUAL_CQ_REVIEWED=true. Demais gates inalterados; envase/reserva/entrega fechados; monitor 88a872 NÃO ativado (bloqueado, ver ../../monitor-loader-renewal-20261020/runtime-activation-blocked).
Manifesto (manifest.json) lista 11 arquivos runtime em 4 grupos com pre/post SHA256: cq (4), cq-test (1), types (types.ts, regenerado pela plataforma 13:55:26 UTC após DDL do operador: micro nullable + overload rpc_avancar_esteira_laboratorio(p_cq); não editado pelo agente), types-import (5, correção separada).
Rollback: `bash rollback.sh` (CQ+teste); `--with-imports`; `--with-types` só junto do rollback SQL. Verificado em cópia /tmp: ROLLBACK OK.

## Comparação dos 6 arquivos (+ teste RBAC) — comparison/*.log
Mesmos arquivos executados no baseline anterior (CQ rollback + types.ts pré-DDL + teste RBAC original, cópia /tmp) e no runtime ativado: 14 falhas idênticas em ambos (nomes iguais). A 15ª falha original era o teste RBAC alterado pela ativação, já corrigido (guarda de papel preservada). Logo nenhuma das 14 é regressão da ativação CQ.
Após correção: 12 falhas (comparison/six-files-after-fix.log).

| Arquivo | Testes | Causa | Classificação/risco |
|---|---|---|---|
| canonicalTypesGuard | 1 | 5 arquivos (documentos de cliente, anexos do wizard, aprovação de visita, estorno, categorias) importavam o types.ts legado | REAL preexistente, CORRIGIDO: imports só-tipo para cultivofarm.types. EstornoDialog: snapshot canônico não tem receivable_payments.organization_id (hosted: uuid NULL, conferido read-only); declarado explicitamente, fence inalterada. |
| cultivofarm-runtime.static | 1 | mesma causa | CORRIGIDO. |
| financialReport.edge | 7 | teste espera URL assinada; Edge no repo (commit 345a8840, 19/10) devolve bucket/path/export_id sem URL assinada | Teste desatualizado frente ao contrato revisado (mais seguro). Risco: confirmar que Edge implantada = repo e que o frontend baixa com sessão própria; não alterado aqui. |
| financialReport.candidate.edge | 1 | compara candidato com baseline do repo; baseline já é o candidato | Teste de pacote obsoleto; não alterado. |
| notification-p1-scope | 1 | espera chave `${STORAGE_KEY}:${scope}`; hook usa `${STORAGE_KEY}:${preferenceScope}` (user+org+roles) | Literal desatualizado; escopo preservado. Baixo risco. |
| etapasVisita | 3 | literais antigos; código atual tem guarda de finalização mais estrita | Literais desatualizados; fora do escopo CQ. Baixo risco. |
Nenhum assert desabilitado ou relaxado.
Risco preexistente observado (não alterado): fence de estorno compara organization_id com igualdade simples (null==null); autorização real é server-side.

Validação: tsgo app EXIT 0; 199 testes CQ/lotes PASS sobre bytes runtime. Sem DDL/DML, sessão, recarga ou publicação. Não é homologação UI/JWT real; OS não concluída; PDF não homologado.
