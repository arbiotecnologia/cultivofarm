# SMTP-T1 — pacote revisável, NÃO implantado

Destino obrigatório: `swzpzcwiasxmjutrmvkm`. Não instalar pelo binding de outro projeto.

## Conteúdo e ordem controlada
1. Revisar `20261016_smtp_t1.sql` com schema/ACL do canônico; validar APIs Vault, owner e grants dos helpers. Executar somente pelo auditor, após aprovação específica. O SQL é candidato fora da pasta gerenciada, não uma migration aplicada. Auditor deve registrar migration versionada/ledger no seu procedimento; este pacote não manipula `supabase/migrations`.
   Identidades exatas do preflight: `vault.create_secret(text,text,text,uuid)` e `vault.update_secret(uuid,text,text,text,uuid)`, último UUID DEFAULT NULL. A omissão nas chamadas de 3/4 argumentos é válida; NÃO existe sobrecarga de identidade curta. Preflight exige default final, EXECUTE para o executor e USAGE authenticated no schema privado já existente; não cria/altera objetos/grants Vault nem amplia USAGE global. Owner/ACL reportados pelo auditor: supabase_admin, postgres EXECUTE, anon/auth sem EXECUTE.
2. SQL é aditivo e repetível no schema local testado, mas `IF NOT EXISTS` não repara drift de colunas. Antes de aplicação/reexecução comparar schema completo e parar se houver objeto homônimo não pertencente a esta fase. Nenhum backfill.
3. Instalar `index.ts.review` como `supabase/functions/tenant-email-settings/index.ts`; copiar `handler.ts` ao mesmo diretório e `_shared/contract.ts` para `tenant-email-settings/_shared/contract.ts`. Usar `deno.json.review` como `deno.json` da função (mapeia Zod npm), ajustar config de import_map se o empacotador exigir. Reutilizar `../_shared/comunicacao/cors.ts` existente. **Não copiar arquivos frontend para a função.**
4. Entrypoint usa chave anon e JWT validado, não service_role. As RPCs de escopo/read/write são executadas no contexto autenticado. Declarar JWT de gateway sem rebaixar nenhuma outra função e manter getUser em código. Nenhuma alteração de config.toml foi feita nesta entrega.
5. Manter `reviewed:false` no entrypoint e `TENANT_SMTP_REVIEWED=false` no frontend até revisão de ACL/Vault **e** prova de que gateway, observabilidade, PostgREST e PostgreSQL não capturam corpos/parâmetros de credencial. Não usar credencial real para provar redaction; usar marcador sintético descartável autorizado e verificar ausência de captura. Não foi realizado aqui.
6. Há também gate privado persistente `communication_tenant_email_review_gate`, inicialmente false, que bloqueia mutações mesmo via RPC direta. Somente o auditor/proprietário do banco pode aprovar seu único registro, após prova de redaction e ACL; não há API de ativação. Só liberar salvamento após os três gates. Essa liberação não permite teste, conexão, worker, ativação, leitura de credencial ou envio. Sem fallback global.
   Scope/get/save públicos são wrappers SECURITY INVOKER, com cores SECURITY DEFINER em platform_private e search_path vazio. Authenticated tem EXECUTE mínimo nos wrappers/cores/actor usados pelas RLS; PUBLIC/anon/service_role não. Cores também revalidam auth.uid/tenant, sem argumento organização; não confiar na inacessibilidade do schema como autorização. Save exige gate após autorização, antes de validar/usar Vault e novamente após lock; trigger continua defesa adicional. GET lê somente version/config/credential_configured, não SELECT *.

## Vault / fronteira de confiança
Apenas API oficial `vault.create_secret/update_secret`; sem DDL em Vault, reader de decrypted_secrets, ou FK em schemas reservados. Referência opaca está em `platform_private`, sem ACL authenticated/anon/service. Secret não aparece no JSON público, tabela de configuração ou auditoria. Operador PostgreSQL com privilégios administrativos continua sendo trusted boundary: não há promessa de esconder segredo do proprietário do banco/Vault.

## Gates OFF e rede
Nenhum conector SMTP foi acrescentado. Host público sintaticamente aceito pode resolver para IP privado: **isso não é proteção SSRF completa**. Resolução A/AAAA/CNAME, ranges especiais/mapped IPv6/NAT64, mixed-answer, DNS rebinding, IP pinning e SNI/certificado devem ser homologados antes de criar qualquer conexão. TLS não usa plaintext fallback. Porta 25 é bloqueio desta fase, não uma declaração de compatibilidade universal; demais portas são somente rascunho sem garantia de disponibilidade Edge.

## Testes locais
- `python3 scripts/smtp-tenant-candidate/test_local.py`: PostgreSQL descartável com corpo SQL real; stubs Auth/readiness/Vault não criptografado. Nenhuma conexão ao canônico.
- `bun run test -- src/test/comunicacao/tenant-smtp-foundation.test.ts src/test/comunicacao/tenant-smtp-ui.test.tsx`: contrato/handler e interface com dependências simuladas.
- Mocks de role/scope do handler só provam obediência à RPC; tenant/RBAC local são provados pelo SQL em ambiente reduzido, não hosted.
- Vault stub tem as identidades reais de 4/5 argumentos com UUID default, sem sobrecargas curtas. Sequência `vault.attempts` é instrumentação local não transacional: comprova zero tentativa antes de rejeição pelo gate (não somente rollback dos efeitos). Não é auditoria persistente de produção nem objeto a instalar no Vault real.

## Rollback
Desligar as duas chaves locais, bloquear/remover a função tenant do roteamento conforme autorização do auditor e executar `rollback.sql` somente após validação do ref. Revoga acesso, mantém dados/auditoria/Vault. Não volta gates globais nem exclui segredo automaticamente. `20261016_smtp_t1.sql` reexecutado restauraria grants: não reaplicar após rollback sem nova revisão.
