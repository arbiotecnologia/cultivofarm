# Adequação final do binding CultivoFarm

## Objetivo
Alinhar o frontend, a proteção fiscal e as validações locais ao projeto CultivoFarm `swzpzcwiasxmjutrmvkm`, sem tocar banco, dados, regras de negócio, layout ou funções publicadas.

## Alterações
1. Trocar o binding fiscal canônico do staging antigo para CultivoFarm, mantendo bloqueio explícito do projeto de produção anterior e falha fechada para referências desconhecidas ou divergentes.
2. Atualizar o identificador local do projeto em `supabase/config.toml`, sem qualquer implantação.
3. Atualizar o gate estático de binding e os dois testes solicitados para exigir CultivoFarm e provar rejeição de bindings divergentes.
4. Revisar referências ao staging antigo apenas em arquivos ativos de conexão/binding; preservar documentação, auditorias, migrations, rollbacks e harnesses históricos.
5. Executar typecheck, testes específicos de binding, suíte Vitest e build; corrigir somente regressões relacionadas ao binding.

## Limites de segurança
- Nenhum SQL ou migration será executado.
- Nenhum schema, RLS, policy, dado, usuário, Storage ou segredo será alterado.
- Nenhuma Edge Function será implantada e nenhuma publicação será feita.
- A emissão fiscal de produção continuará bloqueada; esta mudança apenas reconhece o backend CultivoFarm como binding canônico atual.

## Critérios de aceite
- `.env`, cliente frontend, configuração local, guarda fiscal e gates apontam consistentemente para CultivoFarm.
- Binding ausente, antigo, sandbox ou produção anterior falha de forma fechada.
- Typecheck, testes de binding e build terminam sem erros.
