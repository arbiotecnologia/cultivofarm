# D51.4 — usuários, onboarding e auditoria multi-tenant

## Resultado

- **Gate 1: PASS.** A gestão de usuários usa organização derivada de `auth.uid()` no servidor. A prova transacional A/B passou com administradores reais de organizações distintas, sem criar usuários nem preservar mutações. Superadmin não participa deste fluxo. Vínculos de cliente/parceiro sem ownership determinístico permanecem removidos da tela e bloqueados no backend.
- **Gate 2: PASS técnico.** Telefone, e-mail, fuso e regime tributário são normalizados e validados nas duas camadas. Perfil pessoal e Perfil da empresa ficam separados; ambos usam suas fontes canônicas existentes.
- **Gate 3: NO-GO.** A auditoria horizontal comprovou exposições cross-tenant fora dos dois primeiros gates.

## Banco e segurança

Migrations canônicas aplicadas no ref `swzpzcwiasxmjutrmvkm`:

- `20261005192442_ec81894c-cd02-412a-9a20-3de055b56307.sql`
- `20261005192534_d3208b29-c579-4309-ac0f-29841ef48126.sql`
- `20261005192840_1e060a1c-1817-4218-8fcf-bc58d91c0658.sql`
- `20261005192901_7f7ef56a-73a7-48e9-a875-c935b62eb704.sql`
- `20261005194435_b6e4bda4-745c-4f51-a916-b76777281391.sql`
- `20261005194512_9a63a46f-dba0-4861-bd0c-62e432e23671.sql`
- `20261005194622_91711015-fd68-40ef-a008-24d14cb3be1c.sql`
- `20261005194639_4395c11d-a774-4ba4-bec9-55ab15b2db25.sql`

Controles aplicados: helpers tenant privados; RLS em `profiles`, `user_roles`, `user_clientes` e `partner_users`; listagem paginada `tenant_admin_list_users`; status via `tenant_admin_set_user_active`; edição transacional; redefinição de senha vinculada ao JWT real do ator. Não houve backfill, exclusão ou alteração de dados operacionais.

## Gate 1 — evidências

- A tela não usa mais leituras globais de profiles, papéis, clientes ou parceiros.
- Cache inclui organização e identidade; mudança de usuário limpa todo o cache.
- Deep-link só abre um usuário devolvido pela RPC tenant-scoped.
- `create-user` deriva organização do perfil ativo do ator, proíbe Superadmin, rejeita vínculos sem tenant e compensa criação parcial.
- `admin-update-user-password` valida escopo com a sessão autenticada, não com service-role.
- A política legada de autoedição foi removida; trigger compara `OLD/NEW` e impede que até um administrador altere diretamente seu tenant ou campos estruturais.
- A/B canônico: A e B listaram somente suas organizações; leitura de profile/role cruzada retornou zero; edição, status, senha, Superadmin e troca direta de tenant foram negados. A prova rodou dentro da migration e não deixou mutações.

Smoke visual autenticado no navegador: **NOT RUN**, pois o Supabase é externo e não fornece sessão automatizada ao preview. A matriz server-side A/B obrigatória foi executada no banco canônico com quatro organizações administrativas disponíveis e passou sem persistir alterações.

## Gate 2 — evidências

- Telefone formatado ou em dígitos é persistido com 10/11 dígitos.
- E-mail usa campo próprio, trim/lowercase e validação.
- Fuso usa seis opções IANA brasileiras; valor IANA existente permanece preservado.
- Regime tributário usa catálogo canônico; legado desconhecido não sofre migração automática.
- Conclusão continua idempotente e transacional sob lock/ticket e persiste `organizations.onboarding_dados`.
- A aba Perfil da empresa lê `org_onboarding_state`, a mesma fonte do onboarding.

## Gate 3 — achados bloqueadores

1. **P0 Financeiro:** relatórios e regras de recibos autorizam por papel global sem filtro de organização.
2. **P0 Storage:** documentos financeiros e de clientes são autorizados por papel sem organização no caminho/registro.
3. **P0 Catálogo:** `admin-wipe-produtos-catalog` permite limpeza global a administrador tenant.
4. **P0 Portal:** `list-portal-users` aceita `cliente_id` sem provar vínculo com a organização do ator.
5. **P1 Fiscal:** configuração fiscal possui escrita por papel global sem vínculo tenant comprovado.
6. **P1 sistêmico:** `user_roles` é global por usuário; `has_role()` sozinho não estabelece isolamento tenant.

Inventário detalhado: `docs/auditorias/gate3-d51-4-inventario-modulos-tenant.md`.

## Validação e riscos

- Testes focados do Gate 1: PASS.
- Suíte global: **5.433 PASS / 4 skipped**.
- Typecheck: PASS.
- Build da prévia: PASS.
- Scanner de segurança: 10 achados informativos, zero P0/P1 detectado automaticamente; os P0 tenant acima vieram da auditoria manual de fluxo e autorização.
- Supabase linter: baseline de 492 achados preexistentes, sem novos achados das migrations do Gate 1.
- Edges `create-user` e `admin-update-user-password`: implantadas.
- Testes Deno: inexistentes nessas funções; contratos cobertos por Vitest estático.

## Rollback / forward-fix

- Rollback somente por restauração das definições anteriores caso haja indisponibilidade, mantendo superfícies globais bloqueadas.
- Não reintroduzir a política legada de autoedição. Se houver regressão operacional, o forward-fix seguro é criar uma RPC de perfil pessoal com allowlist de campos, mantendo tenant e identidade imutáveis.
- Forward-fix: adicionar ownership tenant determinístico por módulo, backfill somente auditável, RLS/RPC/Storage por organização, índices compostos e matriz A/B transacional antes da reabertura.

**Decisão final: NO-GO multi-tenant geral.** O vazamento conhecido em Configurações → Usuários foi contido, mas os P0 horizontais impedem homologação completa.

## D51.5 — remediação dos bloqueios horizontais

### Resultado por módulo — fechamento vivo

- **Financeiro/Storage: FAIL-CLOSED/PASS no escopo operacional seguro.** Recibos validam pagamento, parcela, título e cliente pela organização derivada da sessão. Buckets financeiros e de clientes são privados; novos caminhos incluem a organização e as policies validam o recurso-pai. Relatórios, fluxo, DRE e registro de exportação continuam bloqueados para `authenticated`, pois ainda não há vínculo determinístico completo para todas as fontes. Artefatos legados sem tenant permanecem preservados e inacessíveis.
- **Catálogo global: PASS de autorização.** Wipe e auditoria de órfãos agora exigem `is_platform_superadmin` server-side; o wipe também exige frase de confirmação. O fallback destrutivo do navegador foi removido. Nenhuma limpeza foi executada.
- **Portal: PASS estrutural.** `list-portal-users` deriva o tenant pela sessão, valida o cliente nesse tenant antes de usar service role, filtra profiles pela mesma organização, usa CORS allowlist e não devolve erro bruto.
- **Produção: FAIL-CLOSED.** Ordens, programação, lotes, envase e CQ mantêm ownership explícito. `aplicacoes` e `entregas` têm `organization_id`, índice, trigger e policy restritiva. `ordens_servico_onfarm` e `production_planning` passaram a exigir a cadeia determinística cliente/parceiro → organização; linhas sem vínculo não foram preenchidas e ficam bloqueadas.
- **Fiscal: PASS estrutural/FAIL-CLOSED para legado.** Eventos derivam a organização da sessão, validam nota e configuração da mesma empresa e selecionam certificado somente dentro da configuração vinculada à nota. Legado sem vínculo comprovado permanece bloqueado.
- **RBAC horizontal: PASS estrutural no escopo alcançado.** Policies antigas baseadas somente em papel continuam existindo para compatibilidade, mas são intersectadas por policy `RESTRICTIVE`, eliminando o efeito global para usuários autenticados.
- **Configuração global legada: PASS estrutural.** Os singletons comprovadamente globais não receberam vínculo tenant artificial; suas mutações agora exigem Platform Superadmin por policy restritiva.

### Evidências

- Banco canônico confirmado: `swzpzcwiasxmjutrmvkm`.
- 21 tabelas operacionais têm `organization_id`, índice, trigger de guarda e policy restritiva `tenant_isolation_d51_5` no estado vivo, incluindo `aplicacoes` e `entregas`.
- Treze RPCs financeiras elevadas estão sem execução para `authenticated` no estado vivo.
- Backfill foi feito somente onde perfil, cliente ou registro-pai fornecia associação única; nenhum dado foi excluído. Linhas ambíguas foram preservadas sem vínculo.
- Três Edge Functions foram implantadas: catálogo destrutivo, auditoria do catálogo e usuários do portal.
- Fechamento: **66 PASS** focados na rodada de implementação, mais **22 PASS** de recertificação, e suíte global **5.436 PASS / 4 skipped**; typecheck e build automático **PASS**. Scanner: **10 Info, zero P0/P1**. Supabase linter: **479 achados preexistentes**, sem novo achado atribuído às migrations finais. Quatro Edges corrigidas foram implantadas. As quatro Edges D51.5 não possuem módulos Deno próprios; a tentativa focada foi registrada como **NOT RUN — no test modules found**, sem ser convertida em PASS.
- Publicação frontend foi solicitada uma vez. Smoke passivo oficial: HTTP 200, rota `/auth` renderizada, zero erro de página; duas respostas 401 esperadas sem sessão. Nenhuma autenticação, deleção, emissão fiscal ou mutação destrutiva foi executada.

### Matriz A/B e decisão

A prova estrutural confirma que A não pode obter linha B quando a linha possui tenant: a policy restritiva exige igualdade com a organização derivada de `auth.uid()`, e o trigger rejeita organização enviada pelo cliente ou troca de tenant. Usuário inativo/sem organização e Superadmin sem tenant recebem escopo nulo e falham fechados.

A matriz A/B foi reexecutada no banco canônico pela migration `20261005204351_3ab227fc-40d7-48b2-94b6-a49162216da3.sql`, usando dois administradores ativos de organizações distintas, claims locais e `SET LOCAL ROLE authenticated`. A prova confirmou A→B e B→A bloqueados em perfis, contas financeiras, notas fiscais e ordens de serviço, além de negar alteração da configuração global por administrador tenant. O bloco transacional não criou dados e não preservou mutações. Foram também revalidados no estado vivo: policies tenant restritivas, helpers server-side, ACLs das RPCs, políticas de Storage por tenant/recurso-pai, mutação global exclusiva de Platform Superadmin e guardas de OnFarm, parceiros e planejamento. Financeiro/Storage permanece **FAIL-CLOSED** para relatórios cujas fontes ainda não possuem ownership completo; linhas legadas ambíguas continuam indisponíveis, nunca globais.

### Decisão final por módulo

| Módulo | Decisão | Evidência/limite |
|---|---|---|
| Financeiro/Storage | **FAIL-CLOSED** | Tenant e recurso-pai validados; relatórios sem ownership completo seguem revogados; legado sem tenant invisível. |
| Catálogo global | **PASS estrutural** | Mutação de produtos e microrganismos intersectada por policy restritiva de Platform Superadmin. |
| Portal | **PASS estrutural** | Edge valida JWT, tenant e cliente antes do acesso privilegiado; JWT inválido retorna 401. |
| Produção | **FAIL-CLOSED** | Ownership e policy restritiva; linhas sem vínculo determinístico bloqueadas. |
| Fiscal | **PASS estrutural / FAIL-CLOSED legado** | Nota, configuração, certificado e ator vinculados ao tenant; Edge protegida retorna 401 sem JWT válido. |
| RBAC sistêmico | **PASS estrutural** | Administração tenant limitada à própria organização e `superadmin` não atribuível. |
| Configuração legada/global | **PASS estrutural** | Escrita global em configuração visual e financeira exige Platform Superadmin; leitura operacional preservada. |
| Matriz A/B | **PASS transacional** | Dois administradores de organizações distintas; leituras cruzadas e escrita global negadas, sem mutação persistida. |

**Decisão global atualizada:** **PASS de isolamento horizontal com degradação FAIL-CLOSED explícita** nos relatórios financeiros e registros legados sem ownership determinístico.

### Rollback / forward-fix

- Rollback emergencial: restaurar grants das RPCs somente depois de restaurar suas definições tenant-scoped; remover a policy restritiva isoladamente é proibido porque reabre políticas globais antigas.
- Forward-fix: modelar as cadeias determinísticas faltantes, fazer backfill auditável por lote, adaptar RPCs financeiras para filtrar pelo tenant server-side e então reabrir cada função após teste A/B.

### D51.5 P0-A — Financeiro e Storage

- **Recibos: PASS.** A Edge deriva a organização da sessão, valida `receipt_id`, recibo e cliente na mesma organização, grava somente no prefixo tenant e só devolve URL após a assinatura ser criada.
- **Documentos de clientes: PASS.** O helper de Storage foi corrigido para o caminho real `organization_id/clientes/cliente_id/...`; a tabela `cliente_documentos` recebeu policy restritiva pela organização do cliente.
- **Integridade financeira: PASS para novas escritas.** Trigger simétrico rejeita vínculos entre organizações em títulos, parcelas, pagamentos e recibos. Nenhum backfill foi executado; legado sem vínculo continua bloqueado.
- **Relatórios, fluxo de caixa e DRE: FAIL-CLOSED.** As RPCs elevadas sem filtro tenant completo continuam sem execução para `authenticated`; `generate-financial-report` retorna indisponibilidade segura e não produz arquivo. Não foram reabertas nesta rodada.
- **Prova A/B: PASS transacional.** Dois administradores de organizações distintas; leituras de contas, recibos, exportações, documentos e paths forjados da empresa B foram negadas para A, sem mutação persistida.
- **Validação:** 12 testes focados, suíte global com 5.440 PASS/4 skipped, typecheck e build PASS; scanner com 10 Info e zero P0/P1; linter no baseline de 479. Edge `generate-financial-receipt` implantada e smoke anônimo protegido, sem emissão de recibo.

**Decisão P0-A:** **PASS** para recibos, tabelas e Storage; **FAIL-CLOSED** para relatórios analíticos. A funcionalidade analítica permanece indisponível até todas as fontes e joins receberem escopo tenant server-side. P0-B não foi iniciado.

### D51.5 P0-B — Catálogo global

- **Classificação: GLOBAL.** `produtos` e suas tabelas técnicas/fiscais de catálogo não possuem `organization_id`; referências operacionais permanecem pertencentes aos respectivos tenants.
- **Autorização: PASS.** Auditoria e wipe validam JWT e `is_platform_superadmin` no servidor; administrador de empresa recebe 403 e ausência de sessão recebe 401. Nenhum tenant informado pelo cliente participa da autorização.
- **Wipe: PASS com preservação histórica.** A Edge não executa mais cascata pelo navegador ou por loops privilegiados. Uma RPC transacional, executável somente por `service_role`, exige confirmação, motivo de 10–500 caracteres e `correlation_id` UUID, usa lock e idempotência e limita o alvo às tabelas globais do catálogo. Referências operacionais impedem atomicamente a exclusão.
- **Auditoria: PASS.** A trilha registra ator, horário, motivo, correlação e contagens antes/depois, sem payload sensível. A leitura é restrita a Platform Superadmin.
- **Frontend: PASS.** Não existe chamador visual ativo dessas ações; os atalhos de limpeza client-side foram removidos e nenhuma nova ação foi exposta.
- **Validação:** 13 testes focados e suíte global PASS; typecheck e build PASS; scanner com 10 Info e zero P0/P1. Estado vivo confirmou `SECURITY DEFINER`, `search_path` fixo e execução da RPC destrutiva apenas por `service_role`. Smoke anônimo protegido foi executado sem wipe.

**Decisão P0-B:** **PASS**. Nenhuma limpeza real foi executada e o P0-C não foi iniciado.