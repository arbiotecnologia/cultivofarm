# Plano de implantação — catálogo agrícola por abas
Data: 09/10/2026, America/Sao_Paulo. Estado: planejamento; nenhuma nova aba agrícola publicada.
Escopo vigente: três abas separadas — Biológicos, Químicos e Fertilizantes / Adubos. Sementes e Tratamento de sementes ficam para uma etapa futura, fora dos dados, telas, integrações e testes desta implantação.

Substituição documental registrada em 10/10/2026 03:01 UTC por solicitação expressa. Este é o único plano agrícola vigente; `.lovable/plan.md` é seu resumo, não outro plano. O planejamento anterior e suas aprovações não são restaurados; sua história Git permanece preservada. Revert `143253d6f758831a82f0f9ddfd8a2766821f2daa` e igualdade versus `4717ff865440c3506169d82cdeb308954bd54d21` são relatos externos Codex, não execução própria. Checkpoint de substituição: não executou fases A–F, DDL, código ou publicação. Continuidade autorizada 03:08 UTC: Fase A local concluída em `catalogo-agricola-fase-a-contrato.md`, com SQL candidato NÃO aplicado e plano rollback; fases B–F não executadas.

## 1. Funcionalidade
Evolução do catálogo existente em /base-tecnica, preservando aliases, ProdutosTab, catálogo técnico e identidades dos produtos.

## 2. Objetivo
Organizar navegação, classificação, fichas e unidades sem duplicar produtos nem alterar documentos históricos.

## 3. Diagnóstico atual
Delta focal autorizado14:13UTC basead714a952e2321b3ca1b010114f2e98605ad1c7e: aba Catálogo de consulta implementada localmente na /plataforma existente, sem cadastro/famílias novas/preço/composição. Leitor equivalente ausente no acervo local (migrations/tipos/hooks). Fechamento externo Codex para db8f29b02bb246ff426e9fdb9f981e226e645241: SQL revisto e JÁ APLICADO no canônico swzpzcwiasxmjutrmvkm como 20261010141924 platform_catalog_read_only; não reaplicado pelo Lovable. Provas SQL focais externas recebidas, não HTTP/browser/mobile nem nova publicação. Contrato e inventário da implementação na seção11 FaseA; não certifica novas abas agrícolas.
Pós-publicação externo a5702d2f, 10/10/2026 14:09 UTC: usuário publicou; produção build-mv1u4bb9/entry index-DPcujB0c.js observados. Financeiro AR e Superadmin autenticados foram de /base-tecnica?tab=produtos para /sem-permissao; /plataforma abriu ao Superadmin sem catálogo. Abas comuns compartilharam troca de identidade, não sessões independentes; nenhum save UI. Bloqueio não valida writer. Próximo recorte é integrar gestão à /plataforma existente, não abrir rota operacional. Contrato restrito e bloqueios na seção10 do contrato Fase A.
Delta externo Codex 03:17 UTC: 9 produtos, 26 FKs, 19 colunas, 0 fichas/0 fontes. Não consulta própria; inventário integral e consumidor nullable ainda pendentes. B1 mantém tipo NOT NULL; B2 está em arquivo separado sem DDL ativo, não promovido.
A inspeção encontrou produtos.tipo obrigatório (inseticida, fungicida, solo, inoculante, solubilizador), campos dose_ml_ha/valor_litro_brl e composição em volume. Isso não distingue natureza biológica/química e não atende todas as unidades de produtos sólidos e adubos. Consumidores incluem Protocolos.tsx, ProdutosTab.tsx, useCatalogoUnificado.ts, usePartnerCatalog.ts, usePartnerCatalogTecnico.ts e NovoPedido.tsx. Este último contém pressupostos de litro/dose100mL. A auditoria de todos os consumidores ainda não terminou.

**Inventário útil preservado, não aprovação do plano removido:**
- `src/pages/Protocolos.tsx`, `src/components/protocolos/ProdutosTab.tsx`, `src/components/protocolos/CatalogoTecnicoTab.tsx`, `src/pages/app/MobileCatalogoTecnico.tsx`: entradas de gestão/consulta existentes.
- `src/hooks/useCatalogoUnificado.ts`, `src/hooks/usePartnerCatalog.ts`, `src/hooks/usePartnerCatalogTecnico.ts`: consumidores internos/comerciais/técnicos. RPCs encontradas no inventário local: `get_partner_catalog_secure(p_partner_id)` e `get_partner_catalog_tecnico_secure()`; payload técnico precisa prova negativa de preços.
- `src/lib/catalogo/pricing.ts`, `src/lib/catalogo/unidades.ts`, `src/hooks/useCatalogoVolumes.ts`, `src/lib/protocolos/autoCodigo.ts`: base líquida/100mL e códigos ligados ao tipo; não generalizar para sólidos.
- Contrato local canônico `src/integrations/supabase/cultivofarm.types.ts`: referências a `produtos`, `formulacoes`, `partner_order_items`, `estoque_produto`, `product_technical_profiles`, `product_fiscal_profiles` e snapshots. Não substituir o cliente canônico nem editar tipos gerenciados manualmente.

**UNVERIFIED:** paridade atual de schema/RPCs/grants/RLS no servidor, inventário integral de consumidores incluindo localização/contrato completo de NovoPedido.tsx, comportamento HTTP/JWT dos canais agrícolas e compatibilidade de todas as unidades. Apontamentos do inventário estático anterior e evidência externa não equivalem a nova auditoria funcional, nem confirmam segurança viva. Confirmar o ref exclusivo `swzpzcwiasxmjutrmvkm` antes de qualquer operação de banco autorizada; Cloud/outros refs proibidos.

## 4. Estrutura de dados
Reutilizar produtos e seu ID. Modelar separadamente família (biológico/químico/fertilizante-adubo) e classes multivaloradas controladas em produtos. Finalidade continua conceito futuro, sem coluna vazia/campo obrigatório nesta implantação. Contrato concreto e deltas em catalogo-agricola-fase-a-contrato.md.
Adicionar estado de classificação (pendente/revisado), autoria/data/motivo e unidade comercial explícita com precisão/conversões compatíveis. Não substituir enum tipo_produto nem preencher classificação por nome. Legados permanecem íntegros até revisão. Novos campos inicialmente opcionais para legado; obrigatórios no fluxo revisado de novos cadastros.

## 5. Regras de negócio
Biológicos usam biofungicida/bioinseticida quando tecnicamente confirmados; químicos usam fungicida/inseticida/herbicida. Não presumir natureza por função ou nome.
Família, classe e finalidade são eixos diferentes. Cada produto mantém um único ID/SKU e saldo, mesmo quando possui mais de uma classe ou finalidade.
Família não define sozinha unidade: produtos biológicos/químicos também podem ser sólidos. Unidade e formulação orientam campos/cálculos.
Permitir somente conversões explícitas da mesma dimensão; não converter kg em L sem base técnica revisada. Não reutilizar preço por litro como preço por saco/kg/unidade.
Classificação não libera automaticamente B2B, venda, produção ou fiscal. Não inventar produtos, doses, alvos ou recomendações.

## 6. Fluxo do usuário
Dentro de Produtos/Catálogo, três abas irmãs:
- Biológicos: subabas Todos, Biofungicidas, Bioinseticidas, Inoculantes, Solubilizadores; outras classes somente após inventário.
- Químicos: subabas Todos, Herbicidas, Fungicidas, Inseticidas.
- Fertilizantes / Adubos: filtros por classificação/formulação, sem inventar taxonomia antes do inventário.
Manter acesso Todos os produtos e fila administrativa Pendentes de classificação para que legados não desapareçam.
Fluxo cadastro: identidade → família/classes → apresentação/unidade → ficha técnica → revisão → liberação de canais. Reutilizar formulário e cadastro existentes.
Produtos, Microrganismos, Catálogo Técnico, Culturas e Problemas continuam agrupamentos existentes; evitar oito ou mais abas principais amontoadas no mesmo nível.

## 7. Permissões e RLS
Implementação focal de leitura: guard visual exige sessão/perfil correspondente ativo/senha definitiva e superadmin; RPC candidata exige auth.uid + has_role(superadmin) + readiness privada + is_platform_superadmin e iat assinado positivo/fence canônica. public INVOKER→private DEFINER restrita; nenhum SELECT tabela/policy operacional ampliado. SQL de leitura JÁ APLICADO externamente por Codex (20261010141924); positivos/negativos SQL focais comprovados conforme relato, não HTTP. Acesso browser/mobile e nova publicação UNVERIFIED/NO-GO até provas independentes; nenhum acesso operacional tenant aberto.
Contrato futuro: leitura/escrita global exige auth.uid(), perfil ativo/readiness canônica e Platform Superadmin no servidor; is_platform_superadmin isolado não basta. Fonte mínima de gestão e equivalente de writer devem ser investigados antes de qualquer RPC nova; preservar policy ALL, sem autorizar tenants operacionalmente nem expor preços em portais técnicos. Nesta rodada nenhuma permissão alterada.
Preservar escrita global por ator ativo/ready e Platform Superadmin validados no servidor; tenant admin não passa a editar catálogo global. Consultor, parceiro e produtor recebem somente conteúdo permitido por vínculos, aprovação, ativo e canal. Verificar regras atuais antes de alterar qualquer gate.
Validar combinação classificação/unidade no servidor, inclusive RPCs e chamadas diretas. Cache deve conter identidade/tenant/escopo/família/classes/filtros relevantes; troca de contexto invalida resultados.
Teste obrigatório com AR e FSF, e roles reais disponíveis. Claims SQL não equivalem a login real.

## 8. Impactos no sistema existente
Revisar cadastro/códigos automáticos, composição, volumes, fichas/PDFs, catálogo técnico/mobile, RPCs B2B e tabelas de preço. Pedidos, estoque, produção, entrega, financeiro e fiscal mantêm IDs e snapshots históricos.
Produtos novos de unidades não suportadas ficam indisponíveis nos canais transacionais correspondentes até sua homologação. Não permitir inclusão silenciosa em motores exclusivamente líquidos.

Dependências locais a confirmar na fase A: `fn_resolve_commercial_price`, `fn_resolve_b2b_cart`, `b2b_read_simulations`, `b2b_save_technical_simulation`, `rpc_estoque_operar_v1`, `src/lib/estoque/motorEstoque.ts`, `src/hooks/usePartnerSimulations.ts`, `src/hooks/usePartnerOrderActions.ts`, `src/hooks/useFiscalProdutosLite.ts` e `src/hooks/useFiscalCatalog.ts`. ACL/assinaturas implantadas e cobertura integral **UNVERIFIED**; não abrir grants nem criar motor paralelo. Composição `formulacoes.volume_ml` e estoque associado a lote/envase não autorizam converter massa em volume ou fabricar lote biológico para produto comprado.

## 9. Performance e escalabilidade
Leitor focal: busca server-side literal por nome/código, p_limit1–50/p_offset0–1000000/busca<=120, ordenação lower(nome) COLLATE C,id, sentinela em snapshot único para has_more sem total global. Sem índice novo; plano de execução/custo de substring/offset permanece UNVERIFIED mesmo após aplicação externa, alterações concorrentes entre páginas podem mover itens.
Filtrar e paginar no servidor; buscar apenas colunas necessárias. Índices orientados por consultas reais (família, ativo, canal e associações), avaliados com plano de execução. Não fazer uma carga completa por aba nem gerar N+1 de fichas.

## 10. Auditoria e histórico
P1 externo novo já contido por Codex no canônico: migration20261010140830 catalog_price_sync_internal_only revogou EXECUTE client de fn_catalogo_sync_mestre_preco(uuid,uuid). SQL literal em scripts/rbac-audit/applied-20261010140830-catalog-price-sync-internal-only.sql, sem reaplicar. Função DEFINER sem check ator tinha alcance global/set_config; Financeiro chamou NULL sem mutação, amostra sem produto com tier ativo. Corpo/trigger preservados, zero preços alterados relatados, não exploração comprovada. Writer futuro deve reutilizar auditoria servidor existente na mesma transação, sem INSERT client de logs.
P1 externo: Consultor inseria audit com usuario_id Admin. Codex já aplicou 20261010031113 catalog_technical_audit_server_writes_only no canônico; SQL exato arquivado em scripts/rbac-audit/applied-20261010031113-catalog-technical-audit-server-writes-only.sql, NÃO REAPLICADO. SELECT/histórico preservados; produção de logs só servidor. Autoria de revisão muda somente no recorte classificação, não por preço/nome/updated_at.
Registrar anterior/novo, autor, data, motivo, origem e produto para classificação/unidade/liberação. Não recalcular preços, quantidades ou conversões de documentos antigos. Relatório de migração com contagens, ambiguidades e pendências; nenhuma classificação automática ambígua.

## 11. UI/UX mobile e desktop
Consulta focal implementada: aba Catálogo, título “Consulta do catálogo global”, busca por nome/código, tabela e paginação acessíveis, erro seguro/vazio/loading, sem botões de escrita. Reutiliza Tabs/Table/Input/Button/Badge existentes; não monta ProdutosTab com preços/mutações. Scope sessão/perfil remonta e limpa cache/aborta respostas antigas. Prova mock não equivale a inspeção visual mobile/browser real.
Abas com navegação por teclado e estado na URL, sem novas rotas paralelas. Família, subclasse e busca persistem ao voltar da ficha.
Desktop com tabela e filtros; mobile com abas roláveis e cartões, evitando linha de abas comprimida. Mesma terminologia nas superfícies autorizadas.
Tratar carregando, vazio, erro e sem permissão. Ausência de itens é estado real, não cadastro fictício para preencher a tela.

## 12. Integrações
Adaptar o contrato de unidades antes de liberar famílias em pedidos/estoque/fiscal; preservar RPCs seguras e isolamento de preço do catálogo técnico. Não ligar emissão fiscal, mensageria ou cobrança durante testes de navegação/classificação.

## 13. Riscos e prevenção
Consulta de leitura aplicada externamente como 20261010141924; candidato preservado apenas como harness histórico, NÃO REAPLICAR. Provas SQL focais externas não fecham browser/mobile, performance nem certificam integralmente ACLs/owner/USAGE/equivalentes. Erro continua sem fallback direto. Rollback retira apenas aba/leitor ou fecha RPC sob autorização; nunca restaura grants preço/audit nem apaga catálogo. B1/B2/fonte polimórfica/writer inalterados.
P1 de EXECUTE global contido externamente; producer/trigger com dados ainda UNVERIFIED. Rollback nunca restaura EXECUTE PUBLIC/anon/authenticated; eventual regressão interna exige forward-fix autorizado mantendo client fechado. Gestão global runtime NO-GO: bloqueio UI e owner NULL não são positivos. Fonte polimórfica sem FK permanece risco de integridade; guard B1 bloqueia flags também fora da classificação e exige futura transição canônica, nunca desativação de legado como contorno.
P1 audit direto externo contido, sem PASS global. P1 potencial: ator inativo, fonte excluída/revinculada e abertura de canal incompatível. B2/nullable risco alto bloqueado; numeric(18,6) arredonda antes do trigger, não garante rejeitar >6 casas. Legado ativo pode ser classificado preservando flags; sem desativação compulsória. Fence/versionamento de fonte é pendência real, 0 fontes não permite fabricar revisão.
Principais riscos: classificar biológico como químico; duplicar cadastro ou estoque entre classificações; converter sólido para líquido; expor preço interno; ocultar legado; alterar cálculo histórico.
Rollback por fase: desligar exposição das novas abas/canais preservando classificações e histórico; retornar interface anterior sem DROP de dados. Migrações aditivas e retrocompatíveis; nenhuma reversão deve restaurar falha de autorização já corrigida.

## 14. Critérios de aceite
Gestão global futura só aceita positivo Superadmin ativo/ready em sessão real e negativas dos demais perfis, sem permissão operacional tenant. Produto/composição/audit/recibo idempotente devem confirmar mesma transação, CAS por expected_updated_at e conflito/replay seguros; ausência de writer equivalente deve ser confirmada antes de criá-lo. Não implementado nem homologado aqui.
Três abas distintas; biofungicidas e fungicidas nunca misturados por inferência; cadastro único sem duplicação; legados acessíveis; estados/URLs corretos; unidade explícita; proibição de cálculos incompatíveis; controles server-side preservados.
PASS de navegação/classificação não significa PASS de pedidos/estoque/faturamento. Cada canal tem decisão independente.

## 15. Plano de testes
Fechamento EXTERNO Codex — 10/10/2026, referência `db8f29b02bb246ff426e9fdb9f981e226e645241`: SQL revisto e JÁ APLICADO no canônico `swzpzcwiasxmjutrmvkm`, migration `20261010141924 platform_catalog_read_only`. Arquivo literal `scripts/rbac-audit/applied-20261010141924-platform-catalog-read-only.sql` contém de CREATE FUNCTION platform_private até antes de -- Reviewer test plan, sem BEGIN/ROLLBACK nem cabeçalho candidato; harness original preservado com aviso histórico, não reaplicar. Nenhuma operação remota pelo Lovable neste fechamento.

**SQL externo focal:** FinanceiroAR/AdminAR/AdminFSF/ConsultorAR (quatro atores reais) negados inclusive com `user_metadata.role=superadmin`; Superadmin ativo corrente retorna 9 produtos com exatamente 7 chaves sem preços. Página de 2 itens, offset2 e página vazia em offset1000000 observados; limit51/offset-1 e iat0 negados; anon EXECUTE=false. Sem dados alterados. **SQL não é HTTP:** não confirma sessão browser, mobile, busca literal/custo, todos os limites do plano ou auditoria global.

**Checks locais EXTERNOS Codex:** 51/51 PASS (23 novos + 25 CAT + 3 independentes), typecheck app/node PASS, lint5arquivos PASS, scanner3867arquivos/zero achados, build35.39s PASS com avisos legados. Não execução própria nem soma com checkpoints anteriores. Advisors continuam INFO RLS sem policy e WARN DEFINER anon/authenticated e proteção de senha; sem novas contagens informadas e sem PASS global. Browser/mobile e nova publicação pendentes; B1/B2/classificação/writer/transações e fonte polimórfica continuam pendentes. Contenções 20261010140830 e 20261010031113 intactas; rollback nunca restaura EXECUTE client de preço nem escrita livre de audit.

**Estado atual:** PASS SQL focal e checks externos relatados; consulta browser/mobile/produção nova UNVERIFIED/NO-GO para homologação integral. Histórico abaixo descreve o estado anterior à aplicação e é supersedido somente nos pontos comprovados por este fechamento.

Recorte leitura14:13: UI/query real com RPC/Auth mockados e regressão guard/home; SQL negativos BEGIN/ROLLBACK planejados no candidato, não executados. Typechecks app/node separados NOT RUN por restrição ambiental; build automático e lint/testes/scanner próprios registrados no fechamento abaixo, não PASS SQL/HTTP/JWT/produção.
Fechamento próprio14:17UTC: 37/37Vitest PASS (23consulta+14regressão), lint estrito5arquivos PASS sem desligar regras, scanner focal9arquivos0achados, diff-check PASS, build automático14:17:03UTC OK. AGENTS/B1/B2/contenções/dependências iguais à base. Avisos ReactRouter future flags nos testes, sem erro. Typecheckapp/node separado, SQL remoto, browser autenticado e inspeção visual mobile NOT RUN; sem publicação. GO somente entrega local, runtime NO-GO até promoção/provas.
EXTERNO Codex pós-contenção preço: Financeiro/AdminAR/AdminFSF/ConsultorAR/Superadmin cinco chamadas SQL negadas; owner NULL funciona; anon/auth EXECUTE=false, service=true. Não prova trigger com dados nem HTTP, zero preços alterados. Checks independentes anteriores38/38PASS, typecheckapp/nodePASS, build29sPASS, scanner3863zero; lint42any/2avisos FAIL, não todos legados sem comparação. Sem rerun próprio neste job. Futuros testes autorizados de writer: ator inativo/not-ready, projeção mínima, CAS, idempotência igual/divergente/concorrente e rollback integral após falha composição/audit, SQL e browser isolados; manter baseline contido e snapshots.
EXTERNO Codex: 4 INSERT diretos negados com claims AdminAR/AdminFSF/ConsultorAR/Superadmin. Trigger de ficha produziu log sob owner/servidor, não UI/HTTP; primeiro positivo falhou sem ficha, segundo rascunho vazio transacional. Tudo rollback, 0 fichas/0 logs de teste depois. Advisors:15INFO RLS sem política,2WARN defineranon,366WARN definerauthenticated,1WARN proteção senha. Não PASS global nem testes próprios.
Futuros: B1 BEGIN/ROLLBACK, B2 não executar; testar ativo/inativo/readiness, flags de legado preservadas, autoria alheia estável, precisão armazenada e fonte/revínculo/exclusão. Rollback parte do baseline contido, nunca restaura escrita livre.
Banco: constraints, classificações incompatíveis, alteração direta/RPC, concorrência e histórico.
Interface: abas/subabas/busca/paginação, vazio/erro, URL direta, voltar, desktop/mobile, leitor de tela/teclado.
Segurança: roles reais, dois tenants, identificadores forjados, cache após troca de identidade e gates de plano.
Integração: ID/saldo único ao consultar e filtrar o produto; unidades L/mL e kg/g e unidades comerciais reais; preço correto; documentos históricos intactos.
Regressão dos biológicos e fluxos existentes; testes focados, typecheck, lint, scanner de segredos e build. PASS/FAIL/UNVERIFIED com evidências.

Testes de schema devem usar validação apropriada; regras temporais dependentes de agora exigem triggers, não CHECK temporal. Nenhuma fixture/conta/dado agrícola criada neste registro. Nenhum teste funcional reexecutado aqui; evidências históricas não são PASS das novas abas.

## 16. Fases de implementação
Autorização14:13UTC supersede job documental apenas para leitura: aba Catálogo local e candidato SQL separado entregues; nenhum cadastro/writer transacional/classificação. Gate de revisão/aplicação SQL e provas SQL focais encerrado por evidência externa Codex 20261010141924; próximo gate exige browser/JWT independente, mobile e eventual publicação explicitamente autorizada. Escrita segue futura autorização e ausência de equivalente confirmada, contrato seção10 FaseA; implementação leitura seção11. B1/B2 não aplicados; SQL de leitura aplicado externamente por Codex, nenhum DDL remoto/publicação pelo Lovable.
A — Inventário e contratos: fechar mapa de campos/RPCs/unidades, classificação existente e canais suportados. Sem alteração comercial.
B — Dados e validação: B1 aditivo candidato mantém NOT NULL; B2 separado não executável/não promovido aguarda consumidores nullable.  regras server-side, auditoria e revisão controlada dos legados; sem liberar venda nova.
C — Navegação e cadastro: três abas, subabas, filtros e campos condicionais no fluxo existente, acessibilidade e testes.
D — Fichas e canais de consulta: catálogo técnico, mobile e portais conforme permissões; preservar preços restritos.
E — Operação por família/unidade: pedidos → estoque → entrega → financeiro/fiscal, cada recorte com aceite próprio; liberar somente fluxos compatíveis com a família e unidade homologadas.
F — Implantação gradual: publicação após testes, conferência com contas reais, monitoramento de erros e rollback pronto.
A auditoria financeira ampla permanece aberta. Planejamento agrícola pode avançar; implantação agrícola não deve ser apresentada como encerramento da auditoria nem atropelar P0/P1 pendentes do recorte em execução.

**Gate atualizado da Fase A:** inventário/contrato local e SQL candidato para revisão Codex entregues, sem pedir aprovação documental nem chamar plan.show. Nenhuma fase B–F funcional iniciada. DDL, mudanças funcionais, permissões, dependências e publicação futuras exigem autorização específica; não recuperar aprovações do plano removido. Se nova tabela pública for necessária futuramente, a migration autorizada deve conter CREATE → GRANT mínimo → ENABLE RLS → POLICY; somente SQL candidato em scripts/rbac-audit nesta Fase A, jamais aplicado como migration.

## 17. Prompt final pronto para Lovable
Evolua o catálogo existente em fases A–F deste plano. Primeiro audite schema/RPCs/componentes/rotas, classificações e contratos de unidades; entregue inventário e delta antes de DDL. Reutilize produtos, IDs, cadastro e catálogo técnico, sem fluxo/tabela paralela de produtos.
Implemente somente três abas irmãs dentro do catálogo: Biológicos, Químicos e Fertilizantes/Adubos. Biológicos deve ter Biofungicidas/Bioinseticidas e demais classes confirmadas; Químicos deve ter Herbicidas/Fungicidas/Inseticidas. Preserve Todos e pendentes de classificação.
Não sobrecarregue produtos.tipo nem classifique legado por nome. Use B1 aditivo com B2 bloqueado separado, validação de ator ativo server-side, auditoria e rollback sem perda. Considere unidades sólidas e líquidas, sem conversões implícitas ou extrapolação de dose100mL. Preserve RLS, guards, entitlements, canais e snapshots; escrita global somente pela plataforma.
Entregue cada fase com arquivos/migrations/RPCs/RLS alterados, testes focados/typecheck/lint/scanner/build, evidências por perfil/tenant, riscos, rollback e decisão PASS/FAIL/UNVERIFIED. Não invente dados técnicos nem libere canais transacionais sem aceite específico.

Este prompt é material para uma solicitação futura, não instrução de implementação neste job. O fechamento financeiro externo está exclusivamente registrado no H6/roadmap; não certifica catálogo agrícola ou Financeiro global.
