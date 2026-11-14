# Gestão supervisionada de dossiês por produto

## Aplicação efetiva

Destino canônico: `swzpzcwiasxmjutrmvkm`. Gestão da plataforma recebeu a aba Dossiês por produto. Usa vínculos reais, escolha explícita de microrganismo, detalhe canônico por produto, edição com revisão observada, checklist, anexos e submissão para revisão. Não cria aprovação/publicação. Nenhum cadastro ou arquivo real do Bombarbio foi criado pelo agente.

Migrações instaladas pela ferramenta:
- `20261114013656_c514c6e5-ee29-42bd-a363-18e9bbcc50fc.sql`: contratos supervisionados, produto individual, reservas/atestação documental e guards.
- `20261114013721_7121ee78-8ad0-4a97-bb66-ddaf8d063a09.sql`: políticas negativas nas tabelas privadas.
- `20261114014211_c1d6b4bb-7efe-47d6-96e0-472251c608af.sql`: descarte CANCELLING serializado com finalização, exclusão de confirmados e validação de datas.

A tentativa inicial da terceira migração falhou com `42703: column "u.state='CANCELLED'" does not exist`; ausência do novo contrato foi verificada e a correção aplicada pela ferramenta. Nenhuma instalação parcial dessa tentativa foi alegada.

Função `product-regulatory-document` implantada, verify_jwt=true; hash submetido final `0b6a81b64a770947120a69f2d3ee5ece2db30c7c952d34a98589864a2a3477c4`. OPTIONS respondeu 200 e GET sem sessão 401. Esses resultados não comprovam upload autenticado.

## Testes executados

- Vitest: 36/36 em productDossierManagement, productRegulatoryDossiers e regulator ioContencao (arquivo `regulatorioContencao.test.tsx`). Administração de empresa sem leitores da plataforma; seleção explícita; leitura canônica; edição/CAS/reconsulta; conflito preservando rascunho; limite 20 MiB, formato, hash/nome.
- PostgreSQL 17 descartável: 24 checks PASS, incluindo múltiplos microrganismos/produtos, vínculo estrangeiro negado, criação idempotente, separação do legado, revisão observada, checklist, reserva/finalização únicas, atestação negada ao caller, pendência bloqueando submit, cancelamento versus finalização, bloqueio de publicado e zero permits residuais. Usa identidade sintética de fixture, não JWT hosted.
- Deno: 4/4 para magic bytes PDF/PNG/JPEG, HTML disfarçado, limite 20 MiB, vazio e SHA-256 conhecido. `deno check` da função passou.
- Compilação/typecheck automáticos: última entrada verificada `build OK`.
- ACL hosted consultada: wrappers públicos INVOKER, anon sem EXECUTE; attest/cancel service-only sem EXECUTE authenticated. Linter da migração final não apontou novas ocorrências; 499 ocorrências anteriores permanecem fora deste ajuste.

## Limitações e próximos testes reais

Sessão externa não gerenciada: não foi possível executar gestão autenticada nem upload/download real ou revogação JWT/Storage entre empresas. A navegação Playwright sem sessão em `/plataforma` apresentou tela vazia e zero pageerror; não certifica o fluxo nem seu estado signed-out. Testes React usam transporte simulado. Testes locais não certificam autorização hospedada, concorrência distribuída, limpeza Storage real ou continuidade após revogação.

Anexos incompletos permanecem como reservas recuperáveis, não documentos concluídos; descarte sem confirmação permanece pendente. Revisão e publicação usam contratos anteriores, sem abertura nova. Frontend não publicado; emissão, cobrança, A1 e NFS-e não alterados.