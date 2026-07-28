## Diagnóstico (verificado no staging `ikaauvsflpmamgxmkhoq`)

**Os dados estão íntegros.** Consultas read-only confirmaram:
- 14 usuários em `auth.users`, 14 registros em `profiles` (1:1, nenhum órfão, todos `ativo = true`).
- 3 vínculos em `partner_users`, todos do parceiro "FSF Agro Homologação LTDA", todos com profile e papel (`user_roles`) correspondentes:
  - `parceiro@arbio.com` — Parceiro B2B Gestor Teste (`parceiro_b2b`)
  - `parceiro.tecnico@arbio.com` — Parceiro B2B Técnico Teste (`parceiro_b2b_tecnico`)
  - `fagner@arbio.com` — Fagner Furtado (`parceiro_b2b`)
- `partner_contacts` está vazio para esse parceiro (ou seja, não há "contato" sendo confundido com usuário).

Logo, a divergência é **de interface, não de banco**. A causa está em um join incorreto de coluna: a tabela `profiles` tem **duas** colunas de UUID — `id` (chave primária da própria linha) e `user_id` (o ID do usuário de autenticação). `partner_users.user_id` referencia o **`user_id`**, mas duas telas do Portal do Parceiro fazem o casamento pela coluna errada (`id`):

- `src/pages/portal-parceiro/UsuariosClientesB2B.tsx` — busca profiles com `.in("id", ids)`; como nenhum profile casa, a lista mostra usuários **sem nome e sem e-mail**, aparentando ser alguém que "não existe" no sistema.
- `src/pages/portal-parceiro/TecnicosProdutores.tsx` — mesmo erro, e ainda pior: usa `user_id: p.id`, ou seja, os vínculos técnico↔produtor podem ser gravados/lidos com o identificador errado.

A tela administrativa (Configurações → Usuários) e o hook `usePartnerUsers` já usam `user_id` corretamente — por isso a lista do sistema está certa e a do parceiro é que diverge.

## Correção proposta (sem alterar banco, rotas ou permissões)

1. **`UsuariosClientesB2B.tsx`**: trocar a consulta para `.select("user_id, nome, email").in("user_id", ids)` e indexar o `Map` por `user_id`. Nenhuma outra lógica muda.
2. **`TecnicosProdutores.tsx`**: mesma correção; e montar a lista a partir de `partner_users` (fonte da verdade do vínculo), enriquecendo com nome/e-mail do profile — mantendo `user_id` sempre como o ID de autenticação, para não corromper `partner_technician_clients`.
3. **Fallback de exibição**: quando o profile não for encontrado, exibir "Usuário sem cadastro no sistema" em vez de campo vazio, para que qualquer inconsistência futura fique explícita em vez de silenciosa.
4. **Varredura preventiva**: revisar os demais pontos que consultam `profiles` para garantir que o casamento com IDs de usuário use `user_id` (ex.: seleção de consultores em `ParceiroB2BFormDialog.tsx`, que hoje seleciona `id, user_id` — confirmar qual é usado no valor salvo).
5. **Teste automatizado**: adicionar caso em Vitest garantindo que o mapeamento partner_users → profiles usa `user_id`, evitando regressão.

## Validação
- `tsgo` (typecheck), `build` e `vitest run` completos.
- Verificação read-only no staging de que as três contas do parceiro aparecem com nome e e-mail corretos e batem 1:1 com Configurações → Usuários.

## Escopo e segurança
- Somente frontend. Nenhuma migration, nenhuma alteração de RLS, rotas ou papéis.
- Produção (`navfzbwgwzruipouyfnk`) não é tocada.
