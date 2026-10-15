# Produtor — proteção focal de solicitações, 2026-10-15 20:55 UTC

## 1. Escopo e gate
Candidato revisável adicional à entrega A+B. Não aplicado: nenhum DDL, grant, conta, email, deploy ou publicação. Storage core/policies e OS `20261015194058` preservados. Não amplia portais, alçadas internas ou produção.

## 2. Fonte canônica
Ref `swzpzcwiasxmjutrmvkm` verificado antes das consultas. Apenas metadados/schema/helpers consultados; nenhum registro de pessoa/solicitação extraído. CLI de diagnóstico recusou backend externo; utilizada ferramenta Supabase conectada para SELECT-only. Nenhum destino alternativo utilizado.

## 3. Confirmação do achado
Tabela possui INSERT/UPDATE authenticated; permissivas Produtor limitam somente cliente via get_cliente_ids_for_user. Restritiva valida cliente/fazenda/talhão do tenant. Nenhum dos cinco triggers valida autoria, alçada de status ou tenant do consultor. Ensaio before INSERT forja user_id/created_by/status/consultor estrangeiro e gera uma notificação; UPDATE também reproduz atribuição estrangeira. **P1 de mutação confirmado localmente + estrutura hosted; não exploração em produção.**

## 4. Schema do ensaio
26 campos com tipos/null/defaults, seis constraints (PK/unique/quatro FKs), nove policies e cinco triggers reproduzidos. Corpos versionados reais de gen_numero, validate_retorno, notify_atribuido, notify_confirmacao e comunicacao. Helpers técnicos e get_cliente_ids transitive preservam predicados reais; Auth/readiness e sink de comunicação reduzidos. Não chamar isso fullschema do banco inteiro, Auth hook/GoTrue ou prova JWT hospedada.

## 5. Correção preparada
`proposed-producer-request-mutations.sql`: um trigger BEFORE lexicamente anterior à numeração e agenda. Só aplica restrições adicionais quando papel real cliente_produtor está presente, inclusive composição com papel interno; não concede acesso aos outros atores. Grants/policies/corpos atuais inalterados.

## 6. Criação legítima
user_id exige ator; created_by NULL ou ator, fixado server-side. status pendente/origem portal_produtor/confirmacao pendente. Não aceita atribuição, retorno técnico, agenda, registro de origem, external_event ou número fornecido. Timestamps server-side. Campos legítimos da tela existente permanecem aceitos, cliente ativo/vínculo vigente e readiness obrigatórios. Não inventa consultor/tenant.

## 7. Confirmação e remarcação
UPDATE só admite confirmacao_produtor confirmada/remarcacao_solicitada de retorno técnico não concluído/cancelado; comparação JSON completa protege todos os demais campos inclusive futuros. Preserva autoria interna/histórico; não exige que Produtor tenha criado o retorno agendado. updated_at server-side. Repetir mesma confirmação não gera segunda notificação no trigger existente.

## 8. Destinatário e efeitos
Para retorno, consultor persistido deve ter perfil ativo no mesmo tenant e papel interno cabível; técnico exige carteira vigente. Atribuição estrangeira/inativa/revogada/NULL falha antes de qualquer AFTER. Não repara dados históricos nem desativa notificações. Ator sem papel Produtor mantém policies atuais; não há whitelist service_role/GUC autorizadora. Service sem papel não representa prova de acesso Produtor.

## 9. Baseline/preflight
`preflight-producer-request-mutations.sql`, mesma transação antes do corpo. Fingerprints: triggers `ed8985865c3b137d37920d32af22ae95`, policies `60f15722ac8eb52e44fc8dbbb510196e`, campos `e0affc7044459dd936434ed2eb383abc`. Confere owner postgres/RLS/grants existentes, helpers e ausência do novo guard/rollback. Mismatch aborta; não usa CREATE IF NOT EXISTS para esconder drift.

## 10. Corpos hosted registrados
gen_numero599a70e26ac8d043045b7cb4c4c7e1d9; atribuiçãoe443c3aa804bfe5bf6c54181bb0021f7; confirmaçãof3b93a119f117f9c5569d8e8bf2899b3; agenda899217cc0ebaf09a2cf4c5948ea6604f; comunicação9c7b762fd575862e38408d9a1a2dba7a. Helpers readyb5d0994b6eb976b14122cd2a1ec798cf; refs1d178d4acb1439a16600cab10b63f29e; clientesc80d5900692d960f649d0a9f7850fe2c. MD5 é fingerprint de pg_get_functiondef, não SHA do arquivo.

## 11. Reproduzir
```sh
python3 scripts/tests/producer-request-mutations-local.py
python3 scripts/tests/b2b-receivables-rls-local.py
bun run test -- src/test/security/external-user-ab-proposal.test.ts src/test/config/portalCliente.session.test.tsx src/test/config/scopedPortalQuery.session.test.tsx src/test/config/producerPages.session.test.tsx src/test/config/producerWorkspace.session.test.tsx
sha256sum -c scripts/rbac-audit/producer-request-delivery.sha256
```
Requer initdb/pg_ctl/psql/setpriv. Instâncias descartáveis em /tmp, sem conexão remota; cleanup finally. Não imprime tokens/credenciais ou usa contas reais.

## 12. Regressões concretas
56 assertions PASS: before falsificação INSERT/UPDATE; after cada campo operacional proibido, refs/PK/conteúdo alterados, zero novos efeitos e sequência inalterada nas rejeições, criação válida, confirmação/remarcação/replay com duas notificações, autoria preservada, irmão/tenant cruzado, readiness/anon, cliente inativo, ator e consultor revogados, atribuição histórica estrangeira, ACL closed e rollback preservando criação interna.26 assertions financeiro B2B PASS;53 Vitest em5arquivos PASS com páginas/QueryClient reais e sessão/SDK simulados.

## 13. Rollback
`rollback-producer-request-mutations.sql` em transação única adiciona restritivas INSERT/UPDATE negando Produtor antes de retirar trigger; não restaura a brecha. Preserva dados, função com ACL fechada, internos, cinco triggers/notificações e grants. Inverso testado localmente. Instalação falha usa ROLLBACK integral preferencialmente.

## 14. Storage e financeiro
Storage preservado:82 probes existentes não justificam nova migration. Financeiro B2B mantém candidato separado de duas policies; não concede leitura de partner_users nem abre RPC financeiro. Separação Produtor partner_id NULL/não B2B_ORDER preservada.

## 15. Validações
Lint focal dos5arquivos de regressão0erros; scanner secrets focal0; diff-checkPASS. Build automático observado21:02:27 OK. Typecheck não executado manualmente por regra da plataforma; log dedicado não disponível nesta rodada, não certificado. Lint global não certificado. Testes SQL não são lint/compilação da aplicação.

## 16. Limites reais
Não foi exercitado JWT Produtor real/URL/API hospedada ou concorrência de revogação durante statement neste candidato. Predicados avaliam snapshot da transação; não alegar serialização com todos writers de vínculos. Produtores privilegiados internos e política de atribuição interna não foram ampliados/auditados globalmente. Admin AR disponível não substitui Produtor exclusivo; não criar nova conta antes de revisão.

## 17. Entrega e decisão
Pacote de guard/preflight/rollback/runner/manifesto pronto para reprodução e revisão focal. GO restrito para ensaio local; ativação continua aguardando revisão expressamente solicitada, seguida de login do titular e prova JWT hospedada. Sem nova decisão humana de negócio inventada, sem extensão do recorte. Commit é gerenciado pela plataforma; identificar HEAD somente como snapshot, nunca commit manual.