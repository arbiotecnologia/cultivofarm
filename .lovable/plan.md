# SMTP-T1 — Fundação segura de email por empresa

## Resultado desta fase
Preparar configuração SMTP multiprovedor na tela **Configurações** existente, com salvamento de rascunho após implantação revisada pelo auditor. Nenhum teste de conexão, ativação ou envio será liberado nesta fase.

## Auditoria inicial realizada
- HEAD local `98c74c3f`; destino das ferramentas confirmado como Supabase externo `swzpzcwiasxmjutrmvkm` antes das consultas somente leitura.
- Banco confirma singleton `communication_provider_settings` e eventos/outbox sem `organization_id` direto; nenhuma tabela SMTP/email tenant equivalente encontrada pelos nomes consultados.
- `rpc_service_load_provider_runtime_config()` é global, ACL service-only e lê Vault; foi inspecionada somente a definição, nunca executada.
- As quatro fontes globais consultadas têm RLS e contenção `notif3_global_client_containment`; preservar as políticas e verificar sua modalidade restrictive no inventário final.
- Worker local contém retorno de contenção antes de carregar segredos/claim. Configuração global fica na Gestão da Plataforma, não nas Configurações tenant.
- Guard de readiness existente: `platform_private.platform_actor_access_ready`, que considera atividade, senha provisória e fencing de convite. Reutilizar sem reduzir checks.
- TLS existente não prova proteção SMTP contra DNS rebinding. Não usar o transporte atual para tenants antes de homologação específica.

## Implementação focal
1. **Configuração tenant aditiva:** tabela vinculada a organização, metadados de SMTP, versão monotônica, estado exclusivamente DRAFT e auditoria mínima sem valores de configuração/credenciais. Nada de fila ou módulo paralelo; singleton WhatsApp/in-app/global intocado.
2. **Autoridade no servidor:** derivar organização de `auth.uid()` e perfil; exigir Administrador ativo/pronto, organização válida e não-Superadmin. Superadmin continua exclusivamente no caminho global existente. RLS simétrica; tabelas sem escrita direta pelo cliente; RPCs com privilégios mínimos, `search_path` fixo e validação estrita.
3. **Credencial write-only:** candidato de entrada segura pelo servidor, validação do JWT e RPCs no contexto do chamador. Vault somente por API oficial, sem alteração de objetos reservados nem reader de credenciais. Retorno público contém apenas indicador de credencial configurada; nenhuma referência Vault. Atualização atômica, lock por empresa e versão esperada; conflito não faz retry automático. Rotação ou mudança de parâmetros invalida qualquer readiness.
4. **Campos genéricos:** host, porta, TLS implícito ou STARTTLS obrigatório, usuário, senha, remetente, reply-to opcional e nome do remetente. Sem preset KingHost, plaintext ou promessa de OAuth/API. Validar tamanhos, hostname e injeção de comandos/cabeçalhos no servidor e na interface.
5. **Rede fechada:** não implementar conexão nesta fase. Rejeitar destinos literais/reservados e entradas ambíguas no rascunho; resolução DNS, bloqueio completo de IPs privados/metadata e conexão com endereço fixado/SNI serão gates obrigatórios antes de qualquer teste. Um hostname sintaticamente válido não recebe selo de segurança ou prontidão.
6. **Interface integrada:** seção de email da empresa nas Configurações existentes, somente para o contexto elegível. Estados de carregamento, indisponibilidade, falta de autorização, conflito e pendências separados; senha não retorna nem persiste em cache/storage e é limpa após tentativa/desmontagem/troca de identidade. A identidade/empresa cerca leituras e respostas tardias. Mostrar “Rascunho”, “Remetente não verificado” e “Envio bloqueado”, sem botão de ativação/teste.

## Entrega sem aplicação automática
- SQLs versionados candidatos e rollback restritivo fora de `supabase/migrations/`, para revisão e execução pelo auditor; não usar ferramenta de migration nesta entrega.
- Código candidato de função servidor fora de `supabase/functions/`, evitando implantação automática. Manifesto informa destino, imports e procedimento de instalação controlada.
- Integração da interface fica desabilitada por padrão para chamadas remotas até o auditor instalar e liberar o contrato revisado; indisponibilidade nunca aciona fallback global. Testes locais exercitam o fluxo com servidor simulado.
- Não tocar Auth global, credenciais/templates/hooks, recuperação429, senhas reais, SMTP global ou gates comerciais. Nenhum email, escrita remota, leitura de segredo ou publicação.

## QA e evidência
- PostgreSQL descartável com corpos SQL candidatos: dois tenants, roles negadas, sem JWT, inativo/provisório, Superadmin, tenant forjado, ACL/RLS, conflito/rotação, atomicidade e ausência de leitor. Stubs Auth/readiness/Vault explicitamente identificados; não equivalem a Vault criptografado ou RLS hospedado.
- Testes unitários e de integração do handler real candidato com mocks: validação, códigos seguros, falhas fechadas, nenhum acesso a envio/runtime global e nenhuma credencial em resposta/log/audit.
- Interface desktop/mobile com dados simulados e sem persistência remota; teste de salvamento, conflito, limpeza da senha e troca de identidade. Sessão hospedada autenticada e fluxo persistido real ficam para o auditor.
- Vitest focal e regressões de recuperação/admin-password/comunicação; lint focal e scanner local. Build/typechecks serão os automáticos da plataforma, sem executá-los manualmente; registrar sua evidência disponível e não alegar PASS independente se ausente.
- Relatório, inventário com referências/hashes, roadmap, regra arquitetural e rollback preservando dados/Vault sem apagar histórico.

## Limitações e gates seguintes
- Configuração ainda não comprova domínio/remetente, autenticação SMTP, entrega, quota ou compatibilidade do provedor/runtime.
- Antes de receber credencial real, auditor deve comprovar redaction no gateway/telemetria e banco. Estado consultado: `log_parameter_max_length=-1`, `log_parameter_max_length_on_error=0`, `log_statement=ddl`, `pgaudit.log=none`, `pgaudit.log_parameter=off`; esses valores isolados não certificam ausência de captura pelo gateway.
- **SMTP operacional NO-GO.** Próximas fases, mediante autorização específica: verificação de remetente/domínio; teste controlado com proteção SSRF/DNS e TLS homologados; origem tenant comprovada em eventos/outbox e roteamento do worker sem fallback global; quotas, idempotência e recibos.
- Não iniciar nova grande fase da auditoria funcional até encerrar este recorte SMTP.
