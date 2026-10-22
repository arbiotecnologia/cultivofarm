# Validação C2.1 — local, não homologação real

- Vitest candidato: **18/18** (3 arquivos), incluindo seleção de perfis, referências explícitas produtor, CAS/replay e resposta antiga/fence. Transporte simulado.
- PostgreSQL descartável: **30/30**, corpos reais da candidata em schema reduzido; execução de duas transações independentes com o mesmo CAS, guard rejeitando baseline divergente, isolamento de tenant, vínculos, reativação e revogação. Resultado final em `validation-results.txt`.
- Regressões anteriores desta rodada: **53/53**, contexto/cadastro/fichas. Nenhum runtime alterado.
- `frontend.patch`: somente `patch --dry-run`, sem aplicar. Recibo final em `validation-results.txt`.
- Build automático do projeto: `build OK` em 22/10/2026 01:03:23Z; runtime intacto. **Não certifica a candidata isolada.**
- Revisão independente `15bd79dd`, executada pelo **auditor**: **18/18 Vitest PASS**, mas **tsc original FALHOU** com quatro TS2339 (`toBeChecked`/`toBeInTheDocument`). A execução com `--types vitest/globals,@testing-library/jest-dom` passou; não constitui PASS da configuração original.
- Correção local: `tsconfig.json` inclui ambos os tipos. `tsgo --noEmit -p scripts/contracts-c2-20261022/tsconfig.json` executado **sem override de types**, PASS em 22/10/2026; validação da configuração corrigida, não da original.
- Histórico candidato: primeira página20, limite máximo50, cursor `(at,id)`, escopo parceiro/alvo/tenant antes e depois; ator UUID e whitelist de perfis/vigência/revogação/versão, sem payload bruto, recibo ou segredo.
- Após complemento: **19/19 Vitest e40/40 PostgreSQL locais PASS**; testes novos cobrem ator/antes/depois, whitelist, log de outro tenant/alvo, limites0/51, cursor parcial, timestamps iguais sem perda/duplicação e paginação→troca de ator. `frontend.patch` regenerado e dry-run PASS; nenhum runtime promovido.
- **NO-GO locks/triggers completos**: teste atual usa `acquire_gate` sintético e schema reduzido; duas transações CAS não certificam a cadeia completa. Antes de produção executar corpos/statement+row triggers completos de profiles/user_roles/partner_users/user_clientes/Auth em instância descartável compatível, provar concorrência writer/revogação/movimento tenant, timeout/deadlock e rollback sem efeito parcial. Nenhuma instalação autorizada por este recibo.
- Fluxo autenticado C2, RLS/JWT/REST, UI teste4, finanças cumulativas e integração de toda cadeia hosted: **UNVERIFIED**. Não executar instalação ou cadastro real para obter prova nesta rodada.

Os writers/fields são um recorte administrativo candidato, não ativação integral dos contratos múltiplos perfis. Readiness/provisioning/seletores atuais ainda exigem evolução coerente descrita no inventário. Sem SQL/DML/Edge/publicação, reload ou alteração de sessão.