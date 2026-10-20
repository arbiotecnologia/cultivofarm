# Revisão13a01 — ativação local, sem publicação

## Resultado liberador (política ativa, sem skips/todo/exclusão/neutralização)
- Candidato: config integral 1077 + anteriores 41 + novos 17 = **1135/1135**, zero pendentes (`candidate-active.json`).
- Runtime sem alias de fonte: `bun run test src/test/config`: **1077/1077**, 70 arquivos (`runtime-config.json`).
- Runtime: anteriores 41 + novos 17 = **58/58**, zero pendentes (`runtime-58.json`).
- Types candidata/app/node: EXIT0. Compilação automática do projeto: build OK; sem comando build manual.
- Nenhum teste liberador foi neutralizado. Harness removeu a opção de política OFF e normalizou separadores Windows.

## Delta dos testes (somente scaffolding)
Seis arquivos (cinco config e uma regressão) agora devolvem 503 **somente na primeira consulta fresca de perfil da tentativa automática**. Select exato `user_id, organization_id, ativo`: não intercepta select do probe com senha_provisoria nem loader select(*). Assim a política realmente agenda/executa a tentativa, esgota orçamento, mantém pausa, e permite exercitar o botão Retry e singleflight. A restauração posterior do par rearma valid; os dois testes específicos esgotam também essa nova tentativa antes do clique. Todos os asserts antigos foram preservados byte a byte (`assertions-preserved.json`); assertions adicionais comprovam execução automática. Originais estão em `originals/`, sem alteração. Isolamento, rotas, cache, rascunhos, offline, corridas, hung e resposta tardia permanecem exercitados. Os 17 novos provam sucesso automático sem falha injetada e falham no baseline em seis casos conforme revisão anterior.

As primeiras execuções falharam por scaffolding que confundia o select de Retry com o select maior do probe: corrigido para igualdade exata, sem alterar fonte candidata ou asserts. Restaram duas expectativas de restauração do par: o orçamento legítimo havia rearmado; preparação passou a esgotá-lo novamente. Nenhuma regressão de runtime foi ocultada.

## Instabilidade administrador (não mascarada)
Repetições integrais de retryLoadingRace no candidato: 17/17, 16/17, 17/17. Única falha: admin após RTT8s e Retry, tela ainda `Verificando seu acesso` no instante fixo do assert final. Mesmo teste dirigido na baseline também falhou no mesmo ponto; seleção dirigida contém pendentes e é SOMENTE diagnóstico, nunca resultado liberador. A suíte integral liberadora e runtime passaram sem exclusões. Preservado assert, tempo e fonte admin. Histórico anterior já registrava intermitência em baseline/candidato. Risco mantido: estabilidade de recuperação admin e latência não certificadas; RTT8s sustentado segue limitação, lease15s inalterada.

## Fontes e rollback
- useAuth SHA256: b3a65696cad65ebe08e861d525c68e55982bf79a49b3e21b448ec09f18d0e63b.
- helper SHA256: b6d7f4e42ec858b0be5105986ef2c110994849419d88a8a630805e7ec788ef8d.
- Baseline conferida antes de copiar: ace8f12d59a041f7ee5db03992198cb123f8efc04c11807c41559fed4f737dc4.
- Rollback python existente validado apenas em /tmp: restaura baseline exata, remove helper, verifica CQ e gates antes/depois. Runtime não sofreu rollback.
- manifesto inclui apenas duas fontes runtime; seis testes com scaffolding e documentos separados. CQ nullable, ParametrosCQPage, core monitor, demais gates preservados por hash. Nenhum SQL, DML, sessão, recarga, publicação ou contrato/OS modificado.
- Não foi criado commit por comando Git: estado/commits geridos pelo ambiente. Delta desta rodada está no patch separado para revisão.

Testes de AuthProvider/monitor/probe/boundary reais com transporte/relógio simulados; não JWT/RLS hospedado, sessão real ou certificação do gateway/anexos. Publicação e homologação real continuam com o operador.
