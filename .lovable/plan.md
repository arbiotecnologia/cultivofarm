# Correção das 3 falhas antigas de nomenclatura de migração

## Causa confirmada (lida no código)

Três testes estáticos exigem que toda migration em `supabase/migrations` posterior a `20260905000000` tenha sufixo `_h<número>` (convenção das fases de homologação):

- `src/test/estoque/estoque-fase28b-auditoria.test.ts` ("nenhuma migration nova além do baseline de hardening digest")
- `src/test/estoque/estoque-contratos-fase28c.test.ts` ("nenhuma migration nova nesta frente")
- `src/test/catalogo/catalogo-fase28a-pos-certificacao.test.ts` ("a última migration segue sendo o hardening do digest")

Um único arquivo quebra a regra: `supabase/migrations/20261027000000_commercial_simulator_hardening_v1.sql` (do simulador comercial). É migration **pendente** — nunca aplicada no banco (registro em `restoration/commercial-package/verification.md`, gate NO-GO). Nenhuma outra migration viola o padrão.

## O que será alterado

Somente os três testes acima. Em cada um:

- A verificação continua exigindo que toda migration pós-baseline siga o padrão `_h<número>`.
- Acrescenta uma lista explícita de exceções conhecidas, contendo apenas `20261027000000_commercial_simulator_hardening_v1.sql`, com comentário apontando o gate pendente em `restoration/commercial-package/verification.md`.
- Qualquer outro arquivo novo sem o padrão continua falhando — a trava não é afrouxada, apenas reconhece essa migration legítima.

## O que NÃO será alterado

- O arquivo SQL da migration (nome e timestamp preservados; `commercial-package.test.tsx` lê o caminho exato).
- O banco, o Lovable Cloud, GitHub, publicação — nada disso.
- O manifesto H7P (`h7p-repo-only-migrations.static.test.ts`), que já passa e continua intocado.

## Validação

- `vitest run src/test/estoque/estoque-fase28b-auditoria.test.ts src/test/estoque/estoque-contratos-fase28c.test.ts src/test/catalogo/catalogo-fase28a-pos-certificacao.test.ts src/test/comercial src/test/security/h7p-repo-only-migrations.static.test.ts`
- Typecheck e build (harness).
- Resultado esperado: bateria completa sem falhas (4.737 + as 3 recuperadas).
