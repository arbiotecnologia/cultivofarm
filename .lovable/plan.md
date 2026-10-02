# Plano — D51.2: cadastro assistido, correção da finalização e E2E controlado

## Escopo e limites
- Trabalhar exclusivamente no Supabase canônico `swzpzcwiasxmjutrmvkm` e na rota existente `/plataforma`.
- Não criar módulos, rotas, tabelas ou clientes Supabase paralelos.
- Manter intocados a organização AR BIOTECNOLOGIA LTDA, seu endereço e o job falho atual; eles não participam da homologação.
- Manter D52 bloqueado e Leaked Password Protection como risco temporariamente aceito, aberto e não homologado.
- Parar imediatamente diante de P0/P1, tenant/CNPJ/destinatário indevido, duplicação de job/usuário, cross-tenant ou exposição de segredo.

## Fase 0 — auditoria e baseline
- Consolidar o mapa do fluxo atual entre `PlataformaEmpresas`, `PlataformaAdmins`, `usePlataformaSaaS`, criação da organização, convite e objetos de Auth/tenant.
- Registrar as duplicidades confirmadas: empresa criada em uma aba e selecionada novamente em outra; responsável preenchido fora da sequência; e-mail corporativo e e-mail de acesso pouco diferenciados; revisão apenas da empresa; resultado corrente misturado à lista histórica; status e colunas excessivos.
- Capturar baseline sanitizado do canônico, estado SMTP por booleanos, allowlist, leases e contagens do endereço autorizado, sem ler ou expor segredos.

## Fase 1 — forward-fix da finalização
- Aplicar migration versionada pelo mecanismo oficial, substituindo somente `platform_finalize_org_admin_provisioning` e preservando assinatura, `SECURITY DEFINER`, `search_path=''` e execução exclusiva por `service_role`.
- Aceitar profile do mesmo `user_id` com `organization_id` nulo ou igual à organização do job; rejeitar organização diferente e qualquer papel incompatível.
- No conflito, preencher explicitamente `organization_id`; preservar valores de nome/e-mail já mais ricos e completar somente dados ausentes ou próprios do provisionamento.
- Preservar `raw_app_meta_data.provisioning_request_id`, lease/fencing, responsável principal, papel exclusivamente `administrador`, idempotência e compensação apenas do Auth user criado na execução corrente.
- Mapear falhas da finalização na Edge Function para códigos sanitizados e permitidos: `profile_tenant_conflict`, `auth_metadata_mismatch`, `stale_lease`, `authorization_failed`, `database_constraint` e `finalize_internal_error`; não persistir SQL, tokens, senha, action link ou PII desnecessária.
- Não alterar nem reprocessar o job real falho.

## Fases 2 e 3 — fluxo único na interface existente
- Transformar “Nova Empresa” em três etapas contínuas: Empresa, Responsável de acesso e Revisão.
- Separar visual e semanticamente e-mail corporativo da empresa e e-mail de login/convite do usuário; manter CPF e telefone opcionais e link de convite como padrão.
- A revisão será somente leitura e mostrará empresa, plano, trial, responsável, e-mail de acesso e forma de acesso.
- Orquestrar as duas operações server-side sem fundi-las: criar empresa uma vez e, com o ID retornado, provisionar o responsável; bloquear duplo clique em todas as transições.
- Se o convite falhar após a criação, preservar o ID da empresa e oferecer somente nova tentativa do convite; nunca chamar novamente a criação.
- Após sucesso, oferecer “Ver empresa” e “Ver administradores”; ao abrir Administradores, passar o ID da organização recém-criada e pré-selecioná-la sem nova escolha manual.
- Preservar a aba Administradores para histórico, reenvio permitido e admins adicionais; simplificar a tabela para Empresa, Responsável, E-mail, Forma de acesso, Status, Última atualização e Ação contextual. CPF/telefone ficam fora da grade principal.
- Unificar os textos do fluxo em: Preparando, Empresa criada, Criando acesso, Enviando convite, Convite enviado e Falhou — tentar novamente.

## Fase 4 — provas antes de implantação
- Adicionar harness SQL transacional/reversível cobrindo profile nulo, mesma organização, outra organização, metadata divergente, lease vencida, responsável principal, papel exato e retry sem duplicação.
- Adicionar testes da Edge Function com Auth/trigger/finalização mockados, compensação, retomada da intenção e ausência de segundo e-mail em resultado ambíguo.
- Adicionar testes da interface para sequência única, ausência de campos duplicados, falha pós-criação, retry somente do convite, duplo clique e estados de carga/erro/sucesso.
- Validar desktop e mobile na prévia, executar testes focados, suíte global, typecheck, build e scanner/advisors; não seguir com novo P0/P1.

## Fase 5 — implantação controlada
- Registrar snapshot lógico somente leitura das definições, ACLs e contagens afetadas.
- Aplicar a migration no canônico e validar corpo da RPC, assinatura, `search_path`, grants e comportamento negativo.
- Implantar somente `platform-invite-org-admin` se seu código tiver mudado.
- Publicar o frontend somente após todas as provas verdes e executar smoke de `/auth`, `/plataforma`, Nova Empresa, Administradores e Comunicação.
- Confirmar novamente que o job real permanece sem alteração e sem retry.

## Fase 6 — E2E novo e controlado
- Antes de qualquer criação, comprovar Test Mode ON, allowlist contendo exclusivamente `teste@refilinformatica.com.br`, demais canais OFF, zero lease e zero conflito para o endereço autorizado.
- Verificar se existe mecanismo oficial de CNPJ de teste. Se não existir e o cadastro exigir CNPJ real, parar antes da primeira mutação e reportar somente esse bloqueio.
- Abrir apenas as flags global/e-mail por mecanismo auditável; criar uma única empresa sintética com prefixo obrigatório `HOMOLOGAÇÃO D51.2` pelo novo fluxo.
- Parar após a criação para conferir exatamente uma organização, uma assinatura e sua auditoria; somente então prosseguir ao responsável.
- Criar um único convite para o endereço autorizado e conferir exatamente um job, um Auth user, um profile, um papel `administrador` e o `organization_id` correto.
- Confirmar uma tentativa SMTP e aceitação do provedor. Não reenviar automaticamente em falha ou ambiguidade.
- Se a mensagem chegar, parar sem abrir o link e aguardar confirmação do responsável.

## Fase 7 — contenção e relatório
- Fechar sempre as flags global/e-mail ao terminar ou parar; preservar Test Mode, allowlist, configuração SMTP/Vault e demais canais OFF.
- Não apagar histórico. Inativar/cancelar somente a empresa sintética por fluxo suportado; remover/revogar o Auth user de homologação apenas se houver procedimento seguro e evidência auditável.
- Atualizar `docs/auditoria-d51-2-e2e-controlado.md` e `roadmap.md` com fluxo anterior/novo, arquivos, migration, ACLs/RLS, testes, deploy, passos E2E, contagens, SMTP, falhas, retry, cleanup e decisão GO/NO-GO para encerrar D51.
- Não iniciar D52 automaticamente.

## Detalhes técnicos já confirmados
- A causa de `finalize_failed` está presente no runtime: `handle_new_user` cria profile sem organização e a RPC atual rejeita `NULL` via `IS DISTINCT FROM` antes do UPSERT.
- `platform_create_organization` cria organização, assinatura TRIAL e auditoria em uma única RPC server-side.
- A Edge Function atual já preserva intenção, `raw_app_meta_data`, lease/fencing, compensação do usuário recém-criado e entrega SMTP com cooldown; a alteração será restrita à classificação sanitizada da finalização.
- A aba Administradores continuará independente para operações posteriores, mas deixará de ser etapa obrigatória do primeiro cadastro.
