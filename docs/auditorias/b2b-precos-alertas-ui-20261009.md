# B2B: alertas e geração de preços — 2026-10-09, recorte 15:22 UTC

## Escopo e continuidade
Continuação da mesma fase após **3875ec8** informado pelo usuário. Alterações apenas apresentação, testes e documentação; nenhuma modificação remota, Auth, email, cobrança, emissão externa ou publicação. Provisionamento continua false. Executivo19/emailv9 e demais contenções preservados.

## Migration já aplicada, não reaplicada
Ledger `supabase_migrations.schema_migrations` consultado somente leitura, condicionado ao marcador canônico `swzpzcwiasxmjutrmvkm`. Version **20261009151458**, name **partner_price_rpc_scope_and_alerts**. Statements inteiros copiados sem edição para `scripts/rbac-audit/20261009151458_partner_price_rpc_scope_and_alerts.sql`; cópia local permitida, não migration executável adicionada ao ledger local gerenciado. Nenhuma reexecução.

As três RPCs usam INVOKER e conservam checks de role/RLS. apply/reset verificam parceiro ativo e não excluído; ON CONFLICT contém predicado do índice parcial `product_id IS NOT NULL`. Alertas herdam RLS e listas limitadas a 50; campanhas retornam []/false/`campaign_owner_unverified`. Grants/revokes preservados literalmente. Não converter de volta a DEFINER nem inventar owner de campanhas.

## Evidência independente, não execução deste harness
- Antes: claims FSF atuais, reset principal AR Bio alterou uma linha; alerts expôs ID alheio, rollback.
- Depois: seis PASS relatados: cross-reset/cross-apply 42501; alerts sem fixture alheia; alerts próprio presente; reset próprio 1; apply inativo 42501.
- **Apply próprio = 0, BLOCKED**: catálogo invisível ao administrador AR Bio. Não PASS de geração, não inventar catálogo/preços globais nem relaxar RLS.
- Preços permanentes 90/200 preservados segundo relato; não atualizados nem reconsultados nesta rodada.
- Claims SQL não são JWT real, browser ou certificação integral.

## Correção concreta de UI
`AlertasComerciais.tsx`: loading preservado; erro/ausência de resposta exibem aviso explícito, inclusive quando há dados antigos em erro. Campanhas com disponibilidade false exibem indisponibilidade, nunca “Nenhuma” nem lista residual; outros alertas continuam visíveis.

`ParceiroPrecosTab.tsx`: captura count de apply; zero/null/inválido não apresentam sucesso, exibem “Catálogo indisponível ou sem itens autorizados para gerar a tabela.” Resultado positivo conserva sucesso, invalidação das duas consultas e ações existentes. Erro/cancelamento/pending/finally/normalização e gates preservados. Nenhuma nova permissão ou alteração de regra de preços.

## Testes e limites
**8/8 Vitest PASS**, interação com componentes reais e dependências mockadas: campanha bloqueada com payload residual, erro com dados antigos, campanha disponível/loading, apply0/null, apply1, erroRPC, cancelamento/normalização distinta. Asserções verificam exclusão de dados residuais, RPC correta, ausência de sucesso, invalidations e botão liberado; não busca textual no código fonte. Sem RPC remota/mutação real.

Primeira execução excedeu tempo porque mock retornava array novo em cada render, realimentando useEffect; corrigido apenas mock para array estável. Rodada final PASS, não atribuir loop à aplicação.

Lint do teste PASS; lint conjunto das duas telas **FAIL por oito any preexistentes** (quatro em cada), nenhum any novo. Scanner fiscal-secrets/diff-check PASS. Typecheck manual NOT RUN conforme restrição do harness, sem declarar PASS separado; build automático observado registrado no roadmap.

## Manifesto reconciliado
**11 novos registros + 1 parceiro reutilizado = 12 objetos principais**. Produto existente não é novo fixture. Manifesto incorpora IDs de duas fazendas e três talhões fornecidos; todos AR Bio/TESTE AUDITORIA segundo relato. Não apagou, recriou nem duplicou dados. Histórico antigo preservado, reconciliação supersede apenas pendência de contagem/IDs.

## Rollback e próximos bloqueios concretos
Rollback de UI não pode restaurar falso sucesso ou esconder indisponibilidade; forward-fix conserva avisos e gates. SQL arquivado não reaplicado; não remover containment do banco. Cleanup só por futura autorização explícita, nenhuma exclusão nesta fase.

Provisionamento permanece fechado: auditoria dos canais sensíveis e integração candidata ainda pendentes; e-mails de teste dependem de ação humana já solicitada, sem inventar identidade/senha nem repetir confirmação rotineira. Apply próprio bloqueado por catálogo/RLS e campanhas por owner não verificado. Nenhuma alegação de fluxo completo até faturamento, JWT real, emissão fiscal validada ou auditoria integral PASS.