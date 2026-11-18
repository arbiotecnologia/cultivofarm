# Evidências — delta aditivo de anexos

## Atualização final root 03:01 — documentos aplicados em HML
Root informou **d7dc4def instalado/released somente HML**, upload e visualização PDF reais browser PASS; **7 checks Auth reais PASS**: lista própria, lista tenant B negada, bytes próprios, SHA256 igual, no-store, B e anon negados. É evidência externa recebida, não nova execução hospedada do agente. Substitui o status antigo de instalação/PDF pendentes abaixo; baseline e documentos aplicados permanecem intactos. Correções segurança e nova montagem continuam deltas revisáveis separados.

Complemento local: montagem documentos/IA para ambos refs explícitos, leituras UTF-8 e saídas LF em todos scripts de texto deste pacote; roundtrip hash acentuado e negativas CP1252/CRLF/ref inválido testados. Detalhes e gates finais em `../release-final/REPORT.md`.

## Atualização root 02:49 — baseline comprovado em HML
Baseline12a580416 instalado/released somente HML, 26 verificações Auth reais, IA Embrapa real com fontes salvas/reabertas e browser real desktop/mobile PASS, conforme relato do root. Não reaplicar baseline. Esses resultados encerram as pendências antigas de Auth/IA do baseline, não homologam este delta de documentos ou as correções read/URL. Consolidação e ordem dos deltas em `../root-audit-delta/REPORT.md`; montagem Edge agora usa binding.ts constante e SQL UTF-8 LF, sem Deno.env.set em runtime.

## Resultado implementado
Anexos próprios na ficha em Fontes e histórico, independentes de produto comercial: título, arquivo privado, versões imutáveis, consulta inline e download de bytes verificados. CAS do microrganismo passa pelo motor canônico; reserva e commit usam identidade/tenant atuais e recibos. Conteúdo/fiscal/IA baseline não foram reescritos. O instalador 12a580416 permanece intacto.

## Execução deste agente
- Catálogo completo: **1017/1017**, 53 arquivos (`bun run test -- src/test/catalogo`); inclui 19 testes novos dos anexos e 14 da ficha.
- PostgreSQL descartável: **32/32** (`python3 documents/test_pg.py`), PRE/INSTALL/POST/reexecução, release separado, rollback idempotente deny-only, versões, atomicidade, replay concorrente, role/tenant negados, atesto client fechado, revogação durante espera observada por pg_blocking_pids e imutabilidade por trigger.
- Edge: **6/6** integridade/stream/cancelamento + **7/7** transporte sintético, incluindo autorização antes/depois dos bytes, revogação, SHA-256, serviço indisponível e binding produção recusado. `deno check` PASS.
- Typecheck automático: exit 0 em `/tmp/exec-logs/bf93b6f2-c9b4-49ac-b8b2-bd4a8026568c.log`; build automático `build OK`, 18/11 02:47:27 UTC. Não executados builds/typechecks manuais duplicados.
- Chromium: **1280×1800 e 390×844**, anexar → consultar Blob verificado → segunda versão → fechar/reabrir → duas versões preservadas. Zero pageerror, zero overflow horizontal, um único diálogo. `browser-local.py` reproduz com componentes reais e Auth/transporte interceptados; **não é prova hosted**.
- Nenhuma conexão a banco hospedado, alteração em produção, bucket hospedado criado, deployment ou publicação. Sem subagentes.

## Limitações das provas locais
PG usa corpos capturados de actor/root e recibo reconstruído conforme baseline; Auth/feature/schema/Storage são sintéticos. Hash real do arquivo é testado pela Edge/browser; não existe objeto Storage hospedado neste ensaio. Relato do root sobre Auth A/B HML e corpos integrais é preservado como relato, não reclassificado como execução deste agente.

## Gates reais para homologação pelo root
1. Captura integral pós-baseline de funções/ACL/owner, fingerprint das relações e bucket privado 10MB na **HML vrlcdwmlytukrjezrrnf**. `capture.sql.review` + helper temporário; `assemble.py` recusa drift, produz cinco artefatos com pins. Não inventar captura HML nem transportar pins divergentes.
2. Revisar/instalar delta fechado, POST, release explícito e Edge `microorganism-documents` HML com `verify_jwt=true`. Configuração/nomes dos secrets em README; nenhuma chave de IA exigida. Disponibilidade de secrets de Storage desta nova Edge não foi consultada.
3. `hosted-qa.py` está pronto para JWT reais EDITOR_A/READER_A/EDITOR_B e fixture sintética designada pelo root. Sem serviço como ator de negócio, sem criar/apagar fixtures. Upload, replay, bytes privados, lista A e negativa B reproduzíveis.
4. Restam executar hosted: revogação durante leitura real dos bytes/locks, negativas de origem Storage GET/list/upload, segunda versão/CAS real e navegador HML autenticado desktop/mobile. **Ausência de DSN/sessão do agente não bloqueou preparação.**

## Riscos explicitamente conservados
Storage e SQL não são uma única transação: falha pode deixar reserva/objeto privado órfão, contado na quota, sem limpeza destrutiva nem falso rollback. Encerrar tentativa local conserva histórico; retry mantém arquivo/chave/argumentos até confirmação. Rollback fecha gate e RPCs, mantém versões/objetos/recibos/policy. Bytes já entregues legitimamente ao navegador não podem ser recolhidos pelo servidor; Blob é revogado no fechamento/mudança do contexto.

## Arquivos
- `src/components/protocolos/MicroorganismFichaEditor.tsx`: integração e exclusão mútua save/anexo.
- `src/components/protocolos/MicroorganismDocuments.tsx`: anexar/consultar/versionar e fences.
- `src/lib/catalogo/microorganismDocuments.ts`: contrato/validação/transporte autenticado.
- `src/test/catalogo/microorganismDocuments.test.ts`: limites/bytes/escopo/CAS.
- `scripts/microorganism-ficha-20261118/documents/`: delta, assembly/pins/rollback, Edge candidata, QA local/hosted e evidências.
- `roadmap.md`: resultado e homologação restante.

**Estado atualizado 03:01: baseline e documentos homologados nos cenários relatados pelo root somente HML; montagem de produção revisável concluída, sem captura/execução de produção; correções segurança e provas adicionais permanecem gates explícitos, sem publicação.**