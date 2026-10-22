# Validação C2.1 — local, não homologação real

- Vitest candidato: **18/18** (3 arquivos), incluindo seleção de perfis, referências explícitas produtor, CAS/replay e resposta antiga/fence. Transporte simulado.
- PostgreSQL descartável: **30/30**, corpos reais da candidata em schema reduzido; execução de duas transações independentes com o mesmo CAS, guard rejeitando baseline divergente, isolamento de tenant, vínculos, reativação e revogação. Resultado final em `validation-results.txt`.
- Regressões anteriores desta rodada: **53/53**, contexto/cadastro/fichas. Nenhum runtime alterado.
- `frontend.patch`: somente `patch --dry-run`, sem aplicar. Recibo final em `validation-results.txt`.
- Build automático do projeto: `build OK` em 22/10/2026 01:03:23Z; runtime intacto. **Não certifica a candidata isolada.**
- Typecheck independente da candidata: **UNVERIFIED**; não executado manualmente pelo agente, conforme restrição do ambiente. Configuração `tsconfig.json` disponível ao auditor.
- Fluxo autenticado C2, RLS/JWT/REST, UI teste4, finanças cumulativas e integração de toda cadeia hosted: **UNVERIFIED**. Não executar instalação ou cadastro real para obter prova nesta rodada.

Os writers/fields são um recorte administrativo candidato, não ativação integral dos contratos múltiplos perfis. Readiness/provisioning/seletores atuais ainda exigem evolução coerente descrita no inventário. Sem SQL/DML/Edge/publicação, reload ou alteração de sessão.