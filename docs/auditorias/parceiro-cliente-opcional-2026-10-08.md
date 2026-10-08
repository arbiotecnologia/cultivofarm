# Cadastro de parceiro — cliente opcional

## Alteração solicitada
Cliente deixa de ser obrigatório na criação e edição do parceiro. Quando informado, precisa pertencer à empresa do ator. Não altera provisão de login, papéis, fluxos B2B contidos, preços ou emissão fiscal.

## Implementação
- Formulário e mutations aceitam `client_id=null`, mantendo Auth, readiness, lock e fencing existentes.
- Migration oficial `20261008181641_e016ad2e-d9b8-47c0-b963-42a1c579ba44.sql`, canônico `swzpzcwiasxmjutrmvkm`: adiciona `commercial_owner_organization_id`, preenchido pelo trigger com a empresa da sessão ativa. Ownership não pode ser movido pelo caller.
- RLS mantém isolamento pelo owner comercial, distinto do tenant próprio do parceiro. Cliente selecionado continua validado por empresa.
- Registros antigos não receberam preenchimento em massa. Edição individual só preserva ownership derivável do cliente OLD comprovado. Órfãos continuam fechados. Leitura direta posterior confirmou zero owners persistidos, pois nenhum cadastro foi criado para teste.
- Rollback exige successor que preserve owner e registros; não remover coluna após novos cadastros nem restaurar política que perca o isolamento.

## Evidências e limites
- 33/33 testes locais em cinco arquivos PASS: criação e edição sem cliente, cliente cruzado negado no formulário, sessão e callbacks antigos protegidos.
- Lint focal hooks/testes PASS; scanners fiscal-secrets/integration e diff-check PASS; build automático18:17:33 OK. Typecheck manual NOT RUN por restrição ambiental.
- RLS/trigger e campo confirmados por consulta live read-only; não equivalem a JWT/API/browser autenticado. Nenhuma fixture/Auth/envio/publicação/dado real inserido. E2E autenticado UNVERIFIED.
- 405 alertas de segurança preexistentes informados pela ferramenta; nenhum introduzido pela migration. Não corrigidos fora deste recorte.

Auditorias e contenções B2B anteriores permanecem vigentes; este ajuste cadastral não certifica ou reabre seus fluxos.