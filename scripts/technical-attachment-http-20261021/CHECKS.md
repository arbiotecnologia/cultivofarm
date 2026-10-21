# Resultado de validação — 21/10/2026

- **114/114 Vitest PASS**, nove arquivos: canal técnico37, integração abridor4, financeiro30, cliente10, não emissão11, storage scope8, deadline5, ownership7, abort2. Snapshots/JWT/HTTP são simulados; não são provas de RLS/POST em produção.
- **Tipos candidata app/node PASS** com `tsgo`, integração montada em `/tmp/technical-attachment-validation-2025`; a primeira montagem omitiu `docs` e falhou em dois imports de inventário dos testes existentes. Corrigida a montagem portátil incluindo docs; tipos concluídos sem erros. Não alteradas dependências do projeto.
- **Deno check PASS** no index candidato e stub deny-only; **bundle PASS** 47 módulos/index e2 módulos/rollback em `/tmp`. Não implantação.
- **Compilação automática da prévia OK** no log às20:27:01 UTC. Nenhuma compilação manual do projeto foi executada. A candidata não está instalada na prévia; o build automático não certifica a sua integração. Tipos e bundle acima validam apenas a cópia candidata.
- **SQL não executado**, nem em produção nem em banco descartável nesta rodada. Validação de catálogo read-only confirmou shape técnico/helpers/policies; não substitui exercício SQL/RLS real. Dependências transitivas e ACL completas permanecem preflight para revisão independente.
- **Sem browser autenticado técnico**: backend externo, sessões e mutações proibidas nesta rodada; nenhum resultado UI real alegado. Checks externos anteriores do proprietário separados no README.
- **Runtime preservado**: nenhuma fonte ativa em src (fora dos testes), função ativa, configuração Supabase, objeto/chave/papel/sessão alterada. Integração somente `.review`; XML/monitor/catálogo/contratos intactos.
- **AGENTS**: 5114 bytes fora do bloco LOVABLE, abaixo de5120; regras intactas. Regra técnica está no AGENTS do pacote e amparada pela regra raiz dos pacotes revisáveis.
- **NO-GO**: paths checkins/solicitacoes não provados, A/B POST e matriz operacional ausentes, demais buckets sem prova específica, URL/CDN histórica sem invalidação/expiração comprovada, perfis/renovação e aba antiga pendentes.

Logs locais preservados em `evidence/validation-*.txt`. `SHA256SUMS` cobre fontes/testes/logs/roadmap usados na revisão, excluindo o próprio manifesto. Não é fingerprint de implantação LIVE.