# Plano — correção CORS da Comunicação no ambiente publicado

## Diagnóstico confirmado
- Reproduzir e registrar o preflight no Supabase canônico: o domínio `app.cultivofarm.com.br` retorna 403 sem `Access-Control-Allow-Origin`, enquanto `cultivofarm.lovable.app` retorna 204 com a origem exata.
- Registrar que `COMMUNICATION_ADMIN_ORIGINS` não está configurada, sem consultar ou expor valores secretos.
- Correlacionar os logs recentes e as versões implantadas das duas Edge Functions afetadas.

## Implementação mínima
- Incluir apenas `https://app.cultivofarm.com.br` na allowlist estática do helper CORS compartilhado; não liberar wildcard de `cultivofarm.com.br`.
- Preservar previews Lovable, localhost e origens extras configuráveis.
- Declarar `verify_jwt = true` explicitamente para `communication-provider-settings` e `test-communication-email`.
- Manter inalteradas autorização Superadmin, SMTP, destinatários, usuários, tenants e regras funcionais do D51.2.

## Validação e deploy
- Ajustar testes para origens canônicas permitidas, origem maliciosa negada, preflight 204 com origem exata, ausência de wildcard e GET sem JWT em 401.
- Executar testes focados, typecheck e build.
- Implantar somente `communication-provider-settings` e `test-communication-email`, incluindo dependências compartilhadas empacotadas automaticamente.
- Repetir preflight e GET sem JWT no runtime canônico; confirmar correção de transporte sem enviar e-mail.

## Documentação e decisão
- Atualizar o relatório D51.2 e o roadmap com causa, arquivos, funções implantadas, testes e decisão sobre retomada da aba Comunicação.
- Manter D52 bloqueado e não avançar o E2E automaticamente.
