# P1 técnico — candidato local sobre 85eeb6c

## Estado e bloqueio concreto
**PASS local focal / NO-GO remoto. Migration NÃO aplicada. P1 vivo não declarado corrigido.**

A ferramenta de leitura não comprova o destino: `supabase.project_ref`, `app.settings.project_ref` e `app.settings.supabase_url` retornaram NULL. O `requested_ref` das consultas anteriores era literal enviado na consulta, **não prova do destino**. Configuração/cliente apontam para `swzpzcwiasxmjutrmvkm`, mas a ferramenta de migration não aceita ref nem fornece preflight de binding. A regra canônica exige interromper escrita sem prova; nenhuma tentativa de migration foi feita.

Desbloqueio: ferramenta oficial deve comprovar `swzpzcwiasxmjutrmvkm` antes da escrita. Não trocar cliente nem usar Cloud. Depois revisar/submeter candidato completo por migration oficial e executar provas rollback canônicas. Não pedir novas credenciais/identidades.

## Evidências separadas
- Relato independente: consultor real criou ocorrência `098fa34f-1cce-4820-af52-7b22a07a49b7`; browser mostrou fazenda principal e dois talhões após refresh. Carteira foi seed administrativo, não prova provisionamento UI. Admin FSF com claims simulados: SELECT zero/helper true/lista um/resumo 1/1/1. Não reproduzimos esse request autenticado.
- DDL retornado pela ferramenta: bypass administrador sem tenant nos helpers; lista/resumo DEFINER herdavam autorização; solicitações sem restrictive tenant. Leitura não comprova binding operacional.
- MD5 de bodies históricos coincide com retorno para criar `9e53b44a5af92f7c22dfd89762b98f29`, iniciar `572535a7d0d98983e03d640070e61f86`, listar `a6e5ff8c68212a7b990125ddb04aa4c6`, resumo `4e030226470b06ea68a52e9084984383`.
- PostgreSQL isolado executa quatro RPCs reais, policies representativas e claims/Auth simulados. DDL reduzido; não prova RLS global/triggers/FKs completos, JWT ou browser.

## Candidato auditável
`scripts/rbac-audit/technical-tenant-containment.sql` não é migration aplicada:
- Ator igual a auth.uid, iat positivo/numérico, perfil ativo/permanente, organização ativa e fence de primeiro acesso existente. Claims malformados retornam false antes de casts legados.
- Helpers view/manage/responsável/participante/gestor exigem tenant e cliente→fazenda→talhão. Técnicos dependem de carteira vigente/não revogada; manage mantém responsável com execute/manage. Admin/gestor somente no próprio tenant.
- Solicitações e visitas recebem restrictive de referências sem consultar a própria tabela dentro do predicado, evitando recursão. Policies permissivas não são substituídas; produtor usa vínculo canônico existente no helper.
- Trigger de INSERT/UPDATE cobre escritores DEFINER, sem bypass service-role. Produtores sem ator ficam fechados; revisar todos os callers automáticos antes da aplicação.
- Lista/resumo filtram demandas pelo helper; visita invisível não suprime demanda. Assinaturas e payload preservados.
- Criação autoriza antes do replay; ambos os ramos exigem visita administrável e referências iguais. Iniciar valida solicitação antes do lock e visita antes de retornar replay.
- P2 fazendas conta fazendas acessíveis pela carteira/listagem no tenant, inclusive antes da primeira visita, não fazendas presentes em visitas.
- Nenhuma mudança UI/guard/papel/catálogo/B2B gate/Executivo19/emailv9.

## Testes e limites
37 asserções PostgreSQL: quatro baselines de vazamento; negativas FSF/ator forjado/financeiro/noorg/anon, iat ausente/malformado/antigo, perfil inativo, papel/carteira revogados, referências cruzadas; positivos responsável/admin A, request e update próprios, criar/repetir/iniciar pelos bodies reais e fazenda antes da primeira visita. Banco descartável/transação rollback, sem inserts com IDs reais.

Runner persistente `src/test/visita/technicalTenantPostgres.test.ts`; resultados da rodada registrados no roadmap, sem somar contagens sobrepostas. Helpers auxiliares/DDL reduzidos: positivos produtor/participante e concorrência multiconexão ainda não certificados. Triggers atuais e writers automáticos exigem revisão antes de aplicar.

Validação desta execução: **25/25 Vitest em quatro arquivos PASS**, incluindo runner PostgreSQL com 37 asserções (não somar como 62 testes); lint focal do runner, scanner de segredos e diff-check PASS. Prévia automática build OK20:35:57UTC. Typechecks app/node separados **NOT RUN** por proibição ambiental de execução manual; não atribuídos a outra medição. Lint global não reexecutado, sem alegação de PASS integral.

Arquivos: candidato SQL, harness Python/SQL, teste Vitest, este relatório, adendo `retomada-delta-2026-10-08.md`, `roadmap.md` e regra em `AGENTS.md`. Nenhum arquivo em `supabase/migrations/` criado/editado manualmente. Commit observado após artefatos/testes: `7678576cd7ea446e9599c783097fb9d1d9db3938`, antes deste fechamento documental; Git stateful não executado.

## Rollback e decisão
Rollback seguro é forward-fix ou fechamento temporário, nunca restaurar bodies/policies globais vazantes. Sem aplicação não há rollback remoto. Candidato não faz backfill, update ou exclusão de registros. Fixtures fornecidos intactos; sem Auth novo/senha/envios/fiscal/cobrança/publicação.

**Authenticated path: UNVERIFIED.** Pós-fix remoto/JWT/browser/Storage/concorrência real UNVERIFIED. Contenção produção NO-GO até aplicação comprovada e testes canônicos.