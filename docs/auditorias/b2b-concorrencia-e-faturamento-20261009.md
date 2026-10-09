# Recorte B2B — concorrência de convites, 2026-10-09

## 1–2. Escopo e migration
Mesma fase, RENATO 10K; canônico swzpzcwiasxmjutrmvkm conferido no cliente. Nenhum SQL mutador remoto, Auth, envio, fixture, publicação ou subagente. Executivo19/emailv9 preservados.

Histórico MCP lido: version20261009144646, namepartner_prices_inherit_partner_scope e statements completos. Texto exato salvo em `scripts/rbac-audit/20261009144646_partner_prices_inherit_partner_scope.sql`, sem reexecução. **Sincronização parcial:** arquivo não colocado em `supabase/migrations/`: edição nesse diretório proibida e ferramenta migration disponível só executa SQL, sem sync-only. Não executar novamente para fabricar ledger. Pendência: sincronização oficial local sem execução.

## 3. P1 de preços — evidência independente
Antes adminFSF leu/alterou preçoARBio1/1; depois0/0, insertcross42501 e insert/select/update própriosPASS, rollback sem resíduos. Relato claimsSQL/iat atual, não JWT real nem prova executada por este harness. Policy RESTRICTIVE ALL herda partner_accounts RLS em USING/WITHCHECK; preserva roles/permissivas, não certifica RPCDEFINER.

## 4–6. Fixtures e efeitos
Manifesto atualizado sem duplicar dados. Adendo humano 15:22 UTC reconcilia **11 novos registros + 1 parceiro reutilizado = 12 objetos principais**: 3 parceiros + 2 clientes + 2 fazendas + 3 talhões + 2 preços. Produto é existente, fora dessa contagem. IDs das fazendas/talhões agora fornecidos e registrados; todos AR Bio/TESTE AUDITORIA segundo relato. Cleanup exige autorização futura, não executado. Zero pedidos/usuários vinculados/externos segundo relato; nenhuma nova escrita.

## 7. Código concreto
`b2b-provisioning-lifecycle.sql` instala BEFORESTATEMENT INSERT/UPDATE/DELETE em convites usando **cf_user_guards_v1.state**, gate existente. SELECTFORUPDATENOWAIT evita esperar em ordem inversa quando produtores já seguram convite. Falha55P03 rollbacka transação; sem takeover/retry automático Auth/envio. AFTERROW toca stamp existente dos perfis old/newuser_id em ordemUUID, invalidando receipt inclusive remove/reinsert/revoke/reset(ABA). TRUNCATE usa block_truncate existente. Sem segundo registro de locks/permissões paralelas; funções trigger sem EXECUTE PUBLIC/anon/authenticated. Handler gatefalse.

## 8–12. Canais e restrições
Técnico/catálogo/operações/faturamento continuam contidos. Nenhuma mudança helpers fiscais/enum/ACLfrontend. Qualquer produtor DML de convites participa do gate, inclusive associação user_id e revogação. SELECTFORUPDATE isolado não muta; produtor que perde gate abortaNOWAIT em vez de formar ciclo com finish. Locks de email não são adquiridos por finishB2B. Pode haver mais55P03 em acesso/email: candidato não implantado; efeitos externos não podem ser repetidos automaticamente. Atualizações não financeiras de convite também invalidam claim conservadoramente.

## 13. Schema e fontes
DDL/triggers vivos inspecionados: nenhum trigger invite prévio; gates/stamps/Authinsert/delete/truncate presentes. Harness reproduz corpos relevantes/FKs/checks anteriores, acrescenta perfil telefone/cargo/cpf_cnpj e audit/email-change mínimos. Corpos vivos completos de platform_finalize_org_admin_provisioning, platform_claim_admin_access(5args), require_provisioned_admin_target reproduzidos, além claiminvite existente. Authusers segue stub; audit/email-change/entitlements/tickets reduzidos, não schemaAuth integral. Erros de dependências ausentes corrigidos sem retirar guard real.

## 14. Concorrência e regressões
Duas conexões PG descartável: claim/claim; profilegate/finish; finish/compensação; claiminvite/emaillease; INSERTassociado/finish nega phantom; UPDATEuser_idNULL→ator/finish nega; finalizador administrativo real associa ator/finish nega; revogador acesso real/finish nega; produtor row→gate ocupado falha55P03 semdeadlock; finish antes revoke conserva completed/nega replay; DELETEinvite não ressuscita receipt. Negativas verificam zero role persistida. Não prova concorrência remota/JWT/browser/serviçosAuth.

## 15. Validação
58/58 Vitest focais PASS em quatro arquivos: 55 testes do handler create-user (Auth mockada) e três harnesses PostgreSQL (lifecycle, partner_accounts e organizations). Onze cenários locais de concorrência/lifecycle registrados, incluindo exclusão ABA. Lint focal, scanner fiscal-secrets, diff-check e JSON do manifesto PASS. Prévia automática build OK às 15:20:39 UTC. Typecheck manual NOT RUN, execução delegada ao harness sem evidência separada disponível; não declarar typecheck PASS. Nenhum PASS JWT/Auth integral. Commit intermediário observado: 9cd9c813f0e3ff2a12796281797bfe048bce412c; atualização documental final recebe commit gerenciado posteriormente.

## 16. Rollback
Candidato não aplicado: manter gatefalse. Se futuramente implantado, forwardfix conserva gate/stamp/negações, não restaurar producer inseguro. Preços não reaplicados; não remover policy nem apagar dados. Cleanup fixtures apenas IDs comprovados/autorização futura.

## 17. Próximos bloqueios
Concorrência focal candidata corrigida; auditoria canais sensíveisUNVERIFIED, dependências integrais, aplicação conjunta segura e negativasJWT continuam gates de ativação. Sem nova decisãoA/P. Commit é gerenciado pelo ambiente; não executar gitcommit ou inventar hash antes persistência.

### Planejamento 14 app_role reais + faturamento futuro
Matriz planejada, **não alteração de direitos existentes**. Fiscal exige atorativo/fresh/tenant/feature/estabelecimento/documento/pedidoaprovado/snapshot. Sem adicionar role em helpers amplos.

| Papel real | Planejamento de escopo |
|---|---|
| administrador | Interno existente preservado; mandato fiscal específico tenant |
| tecnico_agronomo | Técnico próprio, sem emissão fiscal |
| producao | Produção própria, sem emissão fiscal |
| administrativo | Avaliar pedidos aprovados same-tenant; fiscal só mandato futuro |
| gestor | Gerencial escopado; fiscal elegível separado |
| cliente_produtor | Cliente próprio, sem fiscal interno geral |
| consultor_tecnico | Técnico atribuído, sem fiscal interno |
| aplicador | Aplicações próprias, sem fiscal interno |
| operador_onfarm | Operações atribuídas, sem fiscal interno |
| financeiro | Financeiro existente; emitir depende elegibilidade específica |
| gestor_comercial | Comercial tenant; direitos não transferidos ao faturamento futuro |
| parceiro_b2b | Recursos do parceiro, nunca fiscal geral do owner |
| parceiro_b2b_tecnico | Contido financeiramente; sem fiscal |
| superadmin | Plataforma, não mandato operacional tenant |
| faturamento (futuro, NÃO enum/conta) | Só pedidos aprovados do tenant; rascunho/validação/emissão elegível; sem aprovar pedidos, alterar preços, baixar financeiro, gerir usuários/certificados |

Nesta fase nenhum novo papel, helper fiscal, perfil ou emissão habilitado. Implementação futura exige RPCs específicos e negativas por ação/tenant/role.