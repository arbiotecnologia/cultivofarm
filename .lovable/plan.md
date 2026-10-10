# Plano vigente — catálogo agrícola por abas

Resumo de `docs/auditorias/catalogo-agricola-plano-implantacao.md`, documento canônico com 17 seções.
Data do plano: 09/10/2026, America/Sao_Paulo. Substituição solicitada: 10/10/2026 03:01 UTC.
Estado: planejamento; nenhuma nova aba agrícola publicada. Plano anterior revogado, sem restauração de aprovações.

## Escopo exato
- **Biológicos:** Todos, Biofungicidas, Bioinseticidas, Inoculantes, Solubilizadores; outras classes só após inventário.
- **Químicos:** Todos, Herbicidas, Fungicidas, Inseticidas.
- **Fertilizantes / Adubos:** filtros confirmados pelo inventário, sem taxonomia inventada.
- Sementes e Tratamento de sementes adiados: fora de campos, abas, integrações e testes específicos desta implantação.
- Preservar Todos os produtos e Pendentes de classificação; reutilizar /base-tecnica, aliases, ProdutosTab, cadastro, catálogo técnico e IDs/SKUs/saldos únicos.

## Regras e detalhes técnicos
Família e classes são eixos distintos; finalidade futura não cria coluna vazia agora, com dupla função avaliada sem duplicar produtos. Não sobrecarregar produtos.tipo, inferir natureza por nome ou classificar legados automaticamente. Novos nomes de campos/tabelas apenas após verificar estruturas existentes. Classificação pendente/revisada, autoria/data/motivo e unidade comercial explícita; opcionais no legado, obrigatórios no fluxo novo revisado.
Unidade/formulação, não família, orientam cálculos; sólidos biológicos/químicos também existem. Conversões explícitas compatíveis com a dimensão, sem kg→L implícito nem preçoL aplicado a kg/saco. Preservar snapshots históricos e preço canônico. Canal incompatível permanece bloqueado até aceite independente.
Escrita global somente ator ativo/ready e Platform Superadmin validados no servidor. Preservar RLS, guards, entitlements, vínculos, cache por identidade/tenant/escopo/filtros e portais técnicos sem preços indevidos. Supabase exclusivo swzpzcwiasxmjutrmvkm; nenhum uso de Cloud/outros refs.

## Fases A–F futuras
A. Concluída localmente: inventário/contrato em docs/auditorias/catalogo-agricola-fase-a-contrato.md e candidato NÃO aplicado scripts/rbac-audit/proposed-catalog-classification.sql; assertions rollback para revisão Codex, sem prova runtime.
B. Dados aditivos, validação server-side, auditoria e revisão controlada; sem liberar venda nova.
C. Três abas/subabas/filtros e cadastro existente, URL/voltar e acessibilidade.
D. Fichas, técnico, mobile e portais conforme permissões.
E. Pedidos → estoque → entrega → financeiro/fiscal, cada família/unidade/canal com aceite próprio.
F. Implantação gradual autorizada, contas reais, monitoramento e rollback preparado.

## Testes, aceite e rollback
Testes focados/schema/RPCs, UI desktop/mobile, teclado/leitor de tela, dois tenants AR/FSF, roles reais, IDs forjados, cache/entitlements, unidade e saldo único. Typecheck/lint/scanner/build com provas PASS/FAIL/UNVERIFIED. Claims SQL não são login HTTP real. Navegação/classificação PASS não homologa operações.
Rollback desliga abas/canais e retorna interface anterior preservando dados/classificações/histórico, sem DROP ou restauração de vazamento. Sem dados técnicos fictícios, doses/recomendações inventadas, cobrança, mensageria ou emissão fiscal.

## Limites desta solicitação
Continuidade 03:08 UTC autorizou a Fase A: investigação local, contrato e SQL candidato NÃO aplicado. Nenhum DDL remoto/código funcional/grant aplicado/AGENTS/dependência/gate/publicação; fases B–F não iniciadas. Não chamar plan.show; não reutilizar aprovações antigas. Inventário integral/ACL/RLS atuais/HTTP/JWT/unidades dos canais permanecem UNVERIFIED. Financeiro amplo permanece aberto; fechamento externo 4717ff86 no H6/roadmap não é certificação global. A implementação depende de solicitações focais posteriores.

## Delta de revisão 10/10/2026 03:17 UTC
Base eebdab69ba03ee0eb30fab7ee26936fbde0b0ece. B1 aditivo separado de B2 não executável/não promovido; tipo NOT NULL preservado em B1. Legado classificado preserva ativo/canais; revisão não muda autoria por campos alheios. numeric(18,6) arredonda antes do trigger. Fonte/exclusão/revínculo e consumidores nullable seguem bloqueios. admin-catalogo não existe como endpoint.
P1 externo Codex já contido por 20261010031113, SQL exato arquivado sem reaplicar; quatro INSERT diretos negados com claims, positivo owner/trigger, não HTTP; rollback, 0 fichas/logs teste. Inventário externo9produtos/26FKs/19colunas/0fichas/0fontes. Advisors15INFO/2+366+1WARN sem PASS global. Rollback não restaura escrita livre. Detalhes e riscos no contrato e plano17seções; nenhum DDL remoto/alteração funcional/publicação nesta revisão.

## Delta pós-publicação a5702d2f — 10/10/2026 14:09 UTC
Evidência externa: usuário publicou; produção build-mv1u4bb9/index-DPcujB0c.js. Financeiro AR/Superadmin /base-tecnica?tab=produtos → /sem-permissao; /plataforma abre sem catálogo. Abas comuns compartilham identidade, não sessões independentes; nenhum save UI e nenhum positivo do writer.
P1 fn_catalogo_sync_mestre_preco(uuid,uuid) DEFINER sem check ator/EXECUTEclient já contido por Codex no canônico via20261010140830; SQL literal arquivado, não reaplicado. Baseline Financeiro NULL sem mutação, amostra sem tier ativo; pós cinco perfis negados, ownerNULL funciona, anon/authfalse/servicetrue. Corpo/trigger preservados, zero preços alterados; não HTTP nem positivo trigger com dados. Rollback nunca reabre EXECUTEclient.
Checks externos anteriores38/38/typecheckappnode/build29s/scanner3863zeroPASS; lint42any/2avisosFAIL sem classificar tudo legado. Próximo recorte: gestão global na /plataforma existente, componentes reutilizados; investigar leitura e writer equivalentes antes de criar transação. Contrato seção10 FaseA: ator ativo/readiness+Superadmin no servidor, projeção/payload mínimos, expected_updated_at, idempotência escopada e auditoria servidor na transação, zero permissão operacional tenant. Fonte polimórfica/fence e guardB1 fora classificação pendentes; B1/B2 não aplicados. Somente documentação/arquivo SQL neste job, sem RPC/DDL/frontend/AGENTS/publicação; runtime gestão global NO-GO.

## Consulta focal autorizada — 10/10/2026 14:13 UTC
Supersede limite documental apenas para consulta local na /plataforma existente: aba Catálogo, busca/paginação servidor<=50 e projeção id/codigo/nome/tipo/ativo/b2b_enabled/updated_at, sem preço/composição/mutação/classificação. Guard visual ativo/sessão/perfil e scope/cache remount/abort; autorização real no candidato publicINVOKER→privateDEFINER auth.uid/has_roleSuperadmin/readiness/is_platform_superadmin/iatfence. proposed-platform-catalog-read.sql BEGIN/ROLLBACK NÃO aplicado; leitor equivalente ausente localmente, revisão viva pendente, sem SELECTtable novo. Contrato seção11 FaseA e plano17seções atualizados; AGENTS/B1/B2/contenções/deps intactos. Próprio37/37Vitest/lintestrito5/scannerfocal9zero/diffPASS/buildautomático14:17:03OK. Typecheckapp/node separados/SQL/browserJWT/mobilevisualNOTRUN. GOlocal; runtimeNO-GO até Codex revisar/aplicar e provar acesso, nenhum deploy/publicação/cadastro.


## Fechamento externo Codex — 10/10/2026 14:22 UTC
Referência db8f29b02bb246ff426e9fdb9f981e226e645241: SQL de leitura revisto e JÁ APLICADO no canônico swzpzcwiasxmjutrmvkm como20261010141924 platform_catalog_read_only. Supersede somente o status anterior de candidato não aplicado/provas SQL pendentes. Arquivo literal applied-20261010141924-platform-catalog-read-only.sql, intervalo CREATE FUNCTION platform_private até antes Reviewer test plan sem BEGIN/ROLLBACK/cabeçalho; candidato mantém corpo com aviso histórico NÃO REAPLICAR. Nenhum SQL remoto pelo Lovable.
SQL externo: quatro atores reais FinanceiroAR/AdminAR/AdminFSF/ConsultorAR negados inclusive metadata.role=superadmin; Superadminativo9produtos/7chavessempreços, página2/offset2/vazio1000000; limit51/offset-1/iat0negados, anonEXECUTEfalse. Sem dados alterados; SQLnãoHTTP. Checks externos51/51(23novos+25CAT+3independentes),typecheckappnode/lint5/scanner3867zero/build35.39sPASS avisoslegados; não reexecução própria. AdvisorsINFO RLSsemPolicy/WARN DEFINERanon-auth/senha permanecem, sem PASSglobal.
Browser/mobile/produção nova ainda UNVERIFIED/NO-GO para homologação integral, nova publicação pendente; B1/B2/classificação/escritor/transações/fonte polimórfica/flagsB1 continuam pendentes. Rollback somente exposição/leitor sob autorização, preservando histórico e contenções20261010140830/20261010031113, nunca EXECUTEclient de preço ou escrita livre de audit. Fechamento apenas documental/arquivo SQL literal; frontend/guard/AGENTS/SQLfuncional intactos, sem subagentes/publicação.


## Direção substitutiva e edição focal — 10/10/2026 14:38 UTC
Superadmin único cria/edita base global; tenants futuramente apenas exibir/ocultar globais SEM overrides nome/descrição/classificação/preço. CRUD próprios com organização imutável, usados arquivam. Tenant NÃO implementado. Usuário informa consulta20261010141924 publicada/testada9itens/busca/vazio/mobile; supersede pendências positivas só da leitura, não prova writer.
Edição local cinco campos existentes nome/descricao/modo_acao/funcao_completa/modo_aplicacao na aba Catálogo /plataforma. ID/CAS updated_at/motivo10–500/idempotência/audit servidor, sem criar/copiar produto, preço/tipo/família/composição/dose/código/flags. RPCs candidatas detail/update, publicINVOKER→privateDEFINER ativo/readiness/JWT válida e alçada equivalente em core direta. Reutiliza catalog_platform_admin_audit/correlation unique com extensão focal de operation/JSON envelopes, sem escrita livre/tabela nova. SQL proposed-platform-catalog-metadata.sql BEGIN/ROLLBACK NÃO APLICADO, preflight triggers/equivalentes/owner/ACL e testes rollback exigidos. UI erro/conflito/lock/fence/resposta tardia/recibo/refetch escopado, sem auto-retry.
Criação só após código/composição/cálculo transacionais; tenant/B1/B2/classificação/fonte polimórfica/flagsB1 continuam futuros. Risco trigger recalcular preço exige prova antes promoção. Rollback fecha novas RPCs/editor preservando leitura/audit/duas contenções; não apagar histórico/reabrir preços. Sem AGENTS/deps/secrets/banco remoto/subagentes/publicação. Contrato completo seção12 FaseA e17seções vigente; não novo plano concorrente.

Validação própria edição:65/65Vitest(28+23+14),lintestrito4/scannerfocal5zero/diff-checkPASS; buildautomático14:43:11UTCOK. Typecheckappnode separados NOT RUN por ambiente; SQL/HTTP/browser/mobile edição NOT RUN. GOlocal/NO-GO promoção/runtime até revisão/aplicação e provas autorizadas; sem publicação.
