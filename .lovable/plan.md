# Plano D51.2-F — Isolamento SaaS da configuração global SMTP

## Diagnóstico confirmado

- `communication_provider_settings` é um singleton global sem escopo de organização.
- As duas Edge Functions autorizam hoje qualquer papel operacional `administrador`, inclusive administrador de tenant, usando consulta server-side a `user_roles`.
- Isso permite leitura/alteração e teste do provedor global por um papel de empresa; o risco será tratado como P1 antes de qualquer configuração SMTP.

## Implementação

1. **Fronteira server-side**
   - Substituir a autorização por papel `administrador` nas funções `communication-provider-settings` e `test-communication-email` pela RPC canônica `is_platform_superadmin(JWT sub)`.
   - Manter validação de JWT, CORS, rate limit, readiness, test mode e allowlist; retornar apenas erros 401/403 sanitizados.
   - Preservar o acesso técnico `service_role` das RPCs/workers, sem concedê-lo ao cliente e sem atribuir papel operacional ao superadmin.

2. **UI única no painel correto**
   - Reutilizar `ComunicacaoConfigTab` no painel `/plataforma`, em uma aba “Comunicação”.
   - Remover somente a aba global de provedores de `/configuracoes`; as demais configurações da empresa permanecem intactas.
   - Ajustar textos de permissão para “Superadmin de Plataforma”, sem confiar no papel do frontend como fronteira de segurança.

3. **Testes e runtime seguro**
   - Adicionar contratos/testes para tenant admin 403 antes do adapter, superadmin autorizado estruturalmente, anon/JWT inválido 401, ausência de papel operacional, workers preservados e posicionamento correto da UI.
   - Rodar typecheck, testes focados, suíte global, build e linter delta.
   - Antes do deploy, reconfirmar no canônico flags OFF, readiness falsa e zero lease ativo; então implantar somente as duas Edge Functions.
   - Fazer apenas chamadas negativas pós-deploy, sem destinatário real, configuração ou envio.

4. **Governança**
   - Atualizar relatório, roadmap e regra arquitetural em `AGENTS.md` com o P1 comprovado/corrigido, evidências, runtime e bloqueios restantes.
   - Manter D51.2 em NO-GO; não executar E01–E21, publicar frontend ou avançar D52.
