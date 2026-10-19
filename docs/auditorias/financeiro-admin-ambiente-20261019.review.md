# Financeiro/Admin de empresa — candidata ambiental restrita

## Origem e evidência recebida
Base `50d72d6b94aa5333ef25fe1d29d58163c578b5e6`. Proprietário informou revisão externa de recibos: 15 hashes, staging5/5, 13 locators + 3 invariantes PASS, Edge v88 byte-exact e preflight produção revisados; publicação deployment `6a525e60-08c6-4abf-9561-dcfd0c16c63b`, bundle `DBAYuiaw`.

**Homologação real dos recibos NÃO PASSOU**: financeiro A teste3 clicou Preparar PDF no recibo CANCELED fictício canônico `5ec0f885-f386-4198-aa9f-5e94698828fb` e, ao abrir vista B, houve pausa antes de qualquer inativação. Nenhum pagamento novo informado. Não atribuir PASS real aos locators/testes locais. A/B permanecem autenticados e não foram alterados ou recarregados por esta execução.

## Alteração mínima
Única fonte runtime alterada: `src/hooks/useAuth.tsx`. Seleção de política ambiental passa de somente par gestor+consultor para **par já revisado OU financeiro exclusivo já monitorado OU administrador de empresa exclusivo já monitorado**. Usa as mesmas opções `pollWhenHidden`, `renewBeforeDeadline` e `revalidateEnvironment` do monitor existente. Nenhuma mudança no monitor, probes, contratos, guards, roles, paths, recibos, opener, Edge, dependências ou gates.

- Recortes singleton continuam definidos pelos gates existentes e roles exatas; administrador exige organização UUID. Isso seleciona agendamento e nunca concede autoridade. Probes canônicos h15/perfil próprio/roles/has_role/h15 final seguem intactos.
- Confirmação idêntica/foco/visibility/online conserva draft/modal/bytes preparados **somente com lease confirmada vigente**. Eventos em requisição em voo coalescem; não há requisições ambientais concorrentes.
- Renovação antecipada usa deadline confirmado, RTT observado e jitter somente antecipatório; piso1s e máximo poll10s do motor já revisado. Lease continua máxima15s desde início da consulta; iniciar request nunca a estende. RTT impossível/orçamento insuficiente/erro/offline/timeout/negação expiram, respostas tardias não reabrem.
- Retry/revalidação explícita continua destrutiva. Mudança real/expiração invalida cache, desmonta drafts e ownership Blob; restore retoma limpo.
- B2B conserva refresh por confirmação e política ambiental anterior; produtor/consultor/operador/outros recortes não receberam as opções. Global v6/Blob não foram habilitados.

## Testes e recibos
- **312/312 em 9 arquivos**: nova integração20 + financeiro/admin antigos + multipapel + monitor/ambiente + B2B/produtor + recibos.
- Nova integração monta AuthProvider, ProtectedRoutes, RoleGuard, QueryClient e opener canônicos, com página/draft stub e transporte/sessão/download simulados. Financeiro/admin exclusivos passam **90s contínuos de RTT total3s** (1,5s em cada h15), alternando hidden/visible+focus, sem pending/expired/epoch novo; draft/modal/preparo permanecem e download exige clique.
- Provas de coalescência focus+visibility+online com poll em voo; inativação/perda de role/has_role negado/erro/offline/timeout; retry negado e restore limpo; preparação tardia após expiry; relógio monotônico avançado sem timers: nova ação nega e retomada desmonta UI/cache/bytes.
- Duas assertions antigas esperavam foco destrutivo e falharam na primeira regressão. Foram corrigidas para chamar **revalidateAuthz explícito real**, preservando a prova de descarte, não removidas. Nova integração prova foco ambiental não destrutivo.
- **Typecheck separado PASS**, `tsgo -p tsconfig.app.json --noEmit`, exit0, recibo JSON. **Build automático OK**, observado 03:03:08Z. Staging5/5 PASS e hashes fixos.
- Seis falhas históricas da suíte ampla continuam registradas; suíte ampla não repetida e nenhum PASS global alegado. Testes não são JWT/RLS, login real, suspensão real do navegador nem homologação de recibos.

## Limites
Hidden polling é best effort: navegador/OS suspenso pode atrasar timers e limpeza visual até retomar; acesso síncrono verifica deadline. Não há promessa de 90s sem pausa em navegador suspenso, revogação instantânea, ABA não observado ou garantia de RTT arbitrário. A disponibilidade foi provada sob relógio/timers executáveis com RTT3s; segurança continua fail-closed.

URLs assinadas emitidas/bytes já obtidos permanecem não revogáveis; esta fase não muda recibos nem Edge v88. Não gerar/cancelar recibo, registrar pagamento ou apagar arquivos para verificar esta candidata.

## Artefatos, preflight e rollback
`scripts/authz-cache/financial-admin-environment/`: manifest SHA fixo no stage; quatro pares fonte/candidata (uma nova sem baseline), dez fontes protegidas byte-exatas; snapshots completos, SHA256SUMS, validation-receipt e stage/test_stage. Stage exige destino vazio fora do projeto, valida todo input antes de escrever e nunca instala/SQL/publica/recarrega.

Rollback restaura AuthProvider e dois testes antigos exatamente da base; lista remoção apenas do teste novo. Não desativa gates nem reverte recibos/Edge/produtor/B2B/multipapel. Manifests antigos não são regenerados.

Preflight SELECT-only reutiliza integralmente o arquivo revisável administrador: ref obrigatório `swzpzcwiasxmjutrmvkm`, marker, cinco MD5/ACL/owner/search_path/volatilidade, RLS profiles/user_roles e inventário agregado/trigger. **Não executado hosted nesta fase**; hash não garante que produção continua igual. Confirmar destino antes de executar, fail-closed em drift; não corrigir banco para satisfazer o arquivo. Nenhum DDL/DML/Edge deploy/publicação executado.

## Gate de implantação
Revisão independente e homologação real são pendências do proprietário. Usar sessões A/B já autenticadas, sem pedir login ou reload automático: repetir preparo de PDF existente/alternância de abas com latência e confirmar ausência de pausa prematura; testar revogação/restore de forma autorizada e sem pagamentos novos. Recibos seguem **não homologados** até a prova independente; autorização de implantação após revisão não autoriza publicação automática nesta execução. Contratos permanecem fora da fase.