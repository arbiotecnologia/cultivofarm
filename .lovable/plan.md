# Fase 07 — visita para laboratório

## Escopo
- Manter o candidato local, sem aplicação remota, publicação, fixtures reais ou alteração do gate de ownership.
- Reaproveitar somente `encaminhar_para_os = true`; nunca ordenar por data para escolher recomendação.
- Exigir exatamente uma recomendação encaminhada e fabricável: produto biológico XOR microrganismo.
- Rejeitar antes de qualquer escrita: nenhuma seleção, múltiplas seleções, químico/adubo, família nula, duas referências ou conflito legado.
- Preservar uma OS por visita, resposta singular, guard tenant já aplicado, lock/replay, índice e histórico.

## Implementação
- Adicionar ao SQL07 um preflight do hash vigente `e152db390d27e7d21934451cf10bcad7` e o corpo candidato de `rpc_converter_visita_em_os`.
- Bloquear a visita antes de status/replay, travar sua linha e selecionar pelo flag explícito.
- Copiar `produto_id` ou `microrganismo_id` corretamente para a OS e registrar a recomendação escolhida em logs/retorno.
- Tratar `convertido_os` como encaminhamento à OS; manter solicitação mista em acompanhamento, sem marcá-la como produzida/concluída.
- Ajustar apenas o aviso/chave do wizard para impedir encaminhamento de opções não fabricáveis conhecidas.

## Provas e documentação
- Criar harness PGlite executável com stubs para erro, bio, micro, químico/adubo, NULL, referência dupla, misto, múltiplos, sem flag, replay, FSF/inexistente e concorrência serializada.
- Reexecutar os testes focais da fase07 e os testes de UI relacionados; registrar claramente que stubs não provam Auth/RLS real.
- Atualizar manifesto, roteiro e relatório, mantendo SQL13/SQL12 como evidência independente informada e ownership/candidato07 separados e OFF.
