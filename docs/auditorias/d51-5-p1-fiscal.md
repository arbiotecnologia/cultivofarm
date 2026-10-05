# D51.5 — Gate P1 Fiscal

## Estado vivo

- Projeto canônico confirmado: `swzpzcwiasxmjutrmvkm`; emissão produtiva segue bloqueada.
- `company_fiscal_settings.organization_id` é obrigatório. Documentos/eventos legados sem vínculo são preservados e invisíveis por RLS fail-closed.
- `fiscal-certificates` e `fiscal-xml` são privados, sem acesso direto do navegador; views fiscais são `security_invoker`.

## Correções

- Notas: administrador/financeiro da empresa podem escrever; gestor permanece somente leitura, conforme `ACCESS_MAP`.
- Perfil fiscal de cliente herda ownership de `clientes.organization_id`.
- Perfis fiscais de produto/serviço são catálogo global: leitura fiscal preservada e mutação somente Platform Superadmin.
- Auditoria fiscal só libera objetos com cadeia determinística até a organização ativa.
- Transporte SEFAZ valida run/evento/invoice antes de XML, certificado, Storage ou transmissão.
- Motor XML valida invoice/run antes de gerar conteúdo ou URL assinada.
- Upload/revogação de certificado validam a empresa do ator antes de material privilegiado.
- Diagnóstico de binding exige administrador com organização ativa.

## Segurança e decisão

- Nenhum dado fiscal foi alterado, removido ou recebeu ownership presumido.
- Nenhum certificado, chave, token, XML ou payload foi exposto.
- Nenhuma emissão, evento, assinatura produtiva ou chamada SEFAZ foi executada.
- Matriz A/B: cobertura estrutural por RLS/helpers/testes; execução autenticada **NOT RUN**, sem duas identidades fiscais controladas e fixtures determinísticas autorizadas.
- P1 Fiscal: **PASS estrutural / FAIL-CLOSED para legado sem ownership / NO-GO funcional até A/B**.