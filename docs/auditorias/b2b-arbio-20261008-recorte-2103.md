# B2B AR Bio — inspeção inicial21:03UTC, mesma auditoria

## 1. Autorização e escopo
Fixtures comerciais autorizadas exclusivamente para AR Biotecnologia `007bb519-cba0-4704-be2c-cb93ad010048`, prefixo `TESTE AUDITORIA B2B 20261008`. Não criar Auth/credenciais/grants/convites, modificar reais/legado NULL/outros tenants nem publicar. Nenhum agente adicional utilizado.

## 2. Baseline e destino
HEAD confirmado `28cf0b05746eaf96f67d6a533a90b770aa44d8db`, worktree inicialmente limpa. Cliente/config apontam ao canônico `swzpzcwiasxmjutrmvkm`. Ferramenta Supabase conectada conforme contexto desta sessão; SQL `current_database=postgres`, configurações app.settings de ref/URL ausentes: não apresentar essas configurações como confirmação independente do ref. Nenhuma escrita remota executada.

## 3. Ator e sessão
Sessão sandbox `external_unmanaged`: não há sessão AR Bio restaurável nem mint gerenciado disponível. Não pedir credenciais, simular login, reutilizar service_role ou transformar SQL claims em identidade real. Browser Codex anterior é evidência independente, não sessão disponível ao Lovable neste ambiente. Cadastro requer ator real AR Bio pelo fluxo existente.

## 4. Gate de automações
Leitura viva, somente booleanos de `communication_provider_settings`: delivery_enabled=true, email_delivery_enabled=true, whatsapp_delivery_enabled=false, inapp_delivery_enabled=false, whatsapp_webhook_enabled=false, test_mode_enabled=true. **Não todas OFF**; modo teste não comprova zero envio. Não ler segredos ou listas de destinatários, não alterar configuração global. `rpc_service_load_provider_runtime_config` existe e authenticated EXECUTE=false; presença agora não altera retrospectivamente limites DRIFT-EMAILv9. Configuração efetiva de todos workers/webhooks/cobrança/pagamento/SEFAZ não certificada: gate zero externos **NÃO SATISFEITO**.

## 5. Cadastro comercial
`/clientes?aba=parceiros` e `/parceiros/:id`; `useCreateParceiroB2B` usa INSERT normal autenticado em partner_accounts. Trigger vivo `guard_commercial_partner_registration` deriva h15/auth.uid, exige admin/gestor_comercial, preenche owner/autoria/código e valida referências. Cliente é opcional. RLS permissiva de papel intersecta restritiva owner/tenant. Não mudar contrato para fabricar PASS.

## 6. Efeitos do cadastro e manifesto
INSERT cria também `partner_financial_settings` por tg_create_default_pfs e `partner_audit_logs` por partner_audit_trigger. Nenhum cadastro executado. Contagem viva de parceiros com prefixo autorizado e owner AR Bio=0. Manifesto JSON associado: IDs/relações/autoria de criação vazios, efeitos remotos da rodada zero. Auditoria append-only não deve ser apagada por cleanup oportunista.

## 7. Login parceiro
Cadastro comercial não provisiona Auth. `ParceiroUsuariosTab` mantém vincular/desvincular indisponíveis; link_partner_user e set_partner_user_papel authenticated EXECUTE=false. Não liberar ACL/checkbox, criar conta, senha ou convite. Integração futura precisa contrato server-side tenant/parceiro/ator ativo, papel protegido e fluxo titular de definição de senha, sob autorização específica; **nenhum login parceiro seguro certificado nesta rodada**.

## 8. Catálogo e simulação
Fontes existentes: usePartnerCatalog/get_partner_catalog_secure, usePartnerSimulations/b2b_read_simulations/b2b_save_technical_simulation, motor canônico fn_resolve_b2b_cart. Não alterar catálogo global/preços reais. Não criar pedido na simulação. Percurso positivo real não executado por gate de sessão/externos.

## 9. Pedido e condições
`/portal-parceiro`, `/comercial/pedidos-b2b`; create_partner_order_secure authenticated EXECUTE=true, MD5 definição viva `85be378d0751a26470cb98cc641a230f`. Front envia IDs/quantidade/unidade, hash de carrinho e idempotency_key; valores financeiros autoritativos permanecem server-side. EXECUTE não é autorização. assert_b2b_partner_scope usa b2b_actor_scope/org_partner: não confundir tenant P com ownership comercial A nem criar mandato cross-tenant para passar.

## 10. Aprovação e snapshots
approve_partner_order authenticated EXECUTE=true, MD5 `8e266945b058393ce780b1d10b20f6b3`. b2b_internal_assert_origin deriva org/ator/feature e owner comercial, valida cliente somente de A. Snapshots preservados. Trigger vivo b2b_internal_order_snapshot_guard contém B2B_INTERNAL_DOWNSTREAM_UNVERIFIED. Não remover contenção antes de contrato downstream determinístico.

## 11. Produção e estoque
production_planning/ordens_servico/partner_orders e itens são fontes atuais; ready_for_production e estados operacionais internos estão contidos. Não inserir estado final, produzir sobre estoque real, associar legados NULL ou criar registros por bypass. Fluxo feliz até estoque **BLOCKED**, não FAIL funcional reproduzido.

## 12. Recebível e faturamento
`/financeiro/b2b`, `/financeiro/receber`; generate_b2b_receivable_secure vivo bloqueia internal_origin_snapshot com42501 B2B_INTERNAL_DOWNSTREAM_UNVERIFIED antes do impl. MD5 `c08432be20b610b424c45b73ec9610ae`. AR Bio possui0company_fiscal_settings ativos/0VALIDATED. Não configurar emissor real nem fabricar VALIDATED: falta contrato determinístico de emissor/credor e integração downstream. Faturamento interno teste/draft também depende gates externos e ownership provados. Não cobrar/pagar/transmitir fiscal.

## 13. Cenário feliz e negativas
**Feliz planejado, não executado:** cadastro comercial mínimo sem contatos externos → preço/simulação canônicos → pedido com hash/idempotência → aprovação/snapshot → produção fixture → entrega → recebível/draft interno. Parar em cada contrato não provado.

| Caso | Evidência atual | Estado real AR Bio |
|---|---|---|
| duplicidade/replay | suíte PostgreSQL isolada duplicate_order_id/same_status_replay | UNVERIFIED via RPC/JWT |
| limite/desconto | validação comercial local; preço/limite server-side não chamados | UNVERIFIED |
| status/produção | bloqueio downstream vivo + casos locais | BLOCKED/negativa local PASS |
| estoque | estoque real intocado; sem lote fixture | UNVERIFIED |
| tenant/role/ativo/plano | guard vivo e testes locais P_to_A/insufficient_role/inactive/missing_feature | local PASS, JWT UNVERIFIED |
| emissor DRAFT/ambíguo | negativos PostgreSQL isolado;0emissores AR Bio ativos | local PASS/real BLOCKED |

## 14. Testes executados
41/41testes PASS em7arquivos existentes: commercialRegistration.validation/session/delete, b2b-bf-containment, b2b-p1a-reader-acl, b2b-internal-snapshot-postgres, executivo-family-p1. O único teste PostgreSQL contém23cenários: **não somar como23testes Vitest adicionais**. Fixtures/Auth stubs locais descartáveis em `/tmp`, socket isolado, processo encerrado; não canônico/JWT/browser. Dois warnings React Router sem falha.

## 15. Lint, scanner, typecheck e build
Lint3hooks inspecionados: **FAIL2no-explicit-any** preexistentes em useCreatePartnerOrder:78/99, sem código alterado. Scanner fiscal-secrets-scan: **PASS nesta rodada**, sem atribuir este resultado ao scanner Codex pendente da contenção executiva. Typecheck/build manuais **NOT RUN** pela restrição do harness; sem runtime alterado, não transferir PASS Codex histórico para esta rodada nem alegar nova validação automática. Não corrigir P2 any oportunisticamente neste gate de segurança.

## 16. Correção mínima e rollback
Nenhum P0/P1 novo demonstrado além dos contratos já contidos; sem migration/runtime/deploy. Preparação mínima: contrato interno A completo de pedido→planejamento→estoque→recebível com owner/autoria/snapshots e emissor cadastrado determinístico; testar isolamento/status/quantidades/idempotência antes de qualquer desbloqueio. Não definir escopo global nem inferir P=A. Cleanup futuro somente por IDs do manifesto/fluxos autorizados, respeitando append-only/snapshots; não apagar histórico. Nesta rodada sem persistência, rollback de dados **não necessário**. Preservar contenção executiva19RPCs e DRIFT-EMAILv9.

## 17. Decisão e blockers
**GO inspeção read-only e testes locais; NO-GO cadastro persistido e fluxo real até faturamento.** Bloqueadores: sessão real AR Bio indisponível ao Lovable; flags entrega/e-mail ativas e zero externos não comprovado; downstream interno contido; emissor ativo/validado AR Bio ausente; provisionamento parceiro sem contrato certificado. Autorização a fixtures registrada, não recusada em geral: persistência espera estes gates. Não pedir credenciais nem mudar serviços globais/roles/Auth por conta própria. Evidências Codex anteriores preservadas, auditoria integral NO-GO.

### Adendo supersedente21:10 — cadastro focal confirmado independentemente

O NO-GO genérico de persistência acima descreve a decisão inicial do ambiente Lovable e **não permanece válido para o cadastro focal já comprovado pelo Codex**. A sessão `external_unmanaged` limita este harness, não invalida a sessão browser real AR Bio do Codex. Flags delivery/email globais ativas **não provam que salvar parceiro dispara email**; a exigência correta é inspeção dos efeitos de cada ação, não proibição universal de persistência.

Codex inspecionou partner_accounts→settings/audit→governance audit sem hooks externos e criou **pela UI normal**, sem CNPJ/emails/telefones, o único parceiro `7e52de9a-4bed-4d1e-8200-3255a805465c`, nome `TESTE AUDITORIA B2B 20261008`, owner AR Bio `007bb519-cba0-4704-be2c-cb93ad010048`, autor `a7d45277-6dec-413d-bf6b-86620c1ef39f`, data `2026-10-08T21:09:35Z`. Toast e linha observados; SELECT independente confirmou1audit/0pedidos. Não houve alteração global de flags ou Auth. É entidade comercial, **não login**. IDs dependentes não fornecidos não são inventados; manifesto mantém contagem inicial0 separada da medição posterior1 e writes Lovable0 separados da criação Codex.

**PASS focal criação comercial/UI Codex; NO-GO login/faturamento e auditoria integral.** Roteiro autorizado continua exclusivamente com este ID: não duplicar, não apagar auditoria nem executar cleanup nesta rodada. Demais etapas precisam seus próprios contratos e efeitos comprovados.

Provisionamento21:07: ausência no dropdown é contenção integrada, não mero select. Configurações exclui B2B, create-user aceita10papéis internos e nega vínculos; usePartnerUsers hard-deny e link_partner_user viva RAISE42501. partner_users tem leitura administrativa escopada, sem escrita autenticada. Portal exige único vínculo igual a organizations.partner_account_id via b2b_actor_scope, não ao owner comercial A. Liberar somente papel/vínculo AR Bio não resolve o contrato e pode violar a separação A/P. Preparação mínima preserva bloqueios até autorização, perfil, papel único, primeiro acesso e contexto do portal compartilharem cadeia demonstrada. Não haverá Auth/envio sem ação humana.

P2 formulário vazio: normalização de strings vazias para null incluía razão social obrigatória antes do schema string, corroborando a mensagem técnica relatada. Correção local aplicada: preservar string obrigatória na validação, mantendo opcionais nulos. CNPJ repetido corretamente rejeitado permanece negativo válido, sem gravação. Browser publicado pós-correção UNVERIFIED; nenhuma publicação solicitada/executada.

### Implementação do plano aprovado — preparação integrada e correção focal

Matriz dos oito elos, fontes, gates e casos executáveis: [contrato preparatório](b2b-arbio-provisionamento-contrato-20261008.md). O modelo fica exclusivamente em teste, não importado pelo runtime, e **não autoriza provisionamento**. Contrato P/A, primeiro acesso e portal ainda não suportam a ativação integrada; dropdown, mutações, allowlist, ACL, RPCs, roles e Auth inalterados. Nenhuma nova fixture, convite ou efeito remoto executado por Lovable. Preservados Executivo19, DRIFT-EMAILv9 e bloqueio financeiro.

Validação local final: **69/69 testes PASS em4arquivos** (11 formulário,14 hooks reais com mocks,29 handler real SDK/Auth isolados,15 especificação proposta). Não somar às rodadas anteriores como casos distintos. Regressão da normalização verificada capturando entrada real de validação; razão social insuficiente e CNPJ repetido negados antes de mutação. Lint dos2testes alterados PASS; lint do formulário **FAIL5any preexistentes**, sem correção oportunista. Scanner fiscal-secrets-scan PASS; diff-check PASS. Prévia: log build OK em2026-10-08T21:14:27Z após alteração do formulário. Typecheck manual NOT RUN (restrição harness); não declarar PASS sem sinal. Testes, scanner e build deste recorte não promovem scanner Codex pendente nem evidência SQL a JWT/browser.

**Resultado: correção focal local testada e preparação concluída; PASS cadastro comercial Codex do único ID; NO-GO login/provisionamento, fluxo até faturamento e auditoria integral.** Bloqueadores nomeados: contrato integrado owner/identidade/portal/primeiro acesso; snapshot downstream e emissor/credor não comprovados; efeitos externos precisam avaliação por próxima ação. Não aguardar fixtures para corrigir P1 nem fabricar estados finais.