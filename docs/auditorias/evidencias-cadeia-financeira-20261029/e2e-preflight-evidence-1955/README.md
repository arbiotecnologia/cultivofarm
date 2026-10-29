# Revisão 1955 do preflight (OFFLINE, nada executado)
Validador de evidência fornecida (não verifica runtime/rede/credenciais). JSON com chaves únicas e igualdade exata; resultado por escopo READONLY/WRITE_SCENARIOS; produção nunca escrita; homolog escrita exige pré-requisitos confirmados.
Testes 21/21 (`preflight-tests.txt`): flag repetida 5x e contraditória = DENY, "false" string = DENY, chave faltando = BLOCKED, ref observado de produção com modo homolog = DENY, ref/commit por substring rejeitados, URL de produção em homolog = DENY, sem automações = BLOCKED escrita, automação ligada = DENY, sem conferência humana = BLOCKED, sem rg/raiz errada = DENY.
Sem evidência: READONLY=BLOCKED WRITE_SCENARIOS=BLOCKED (`preflight-sem-evidencia.txt`).
