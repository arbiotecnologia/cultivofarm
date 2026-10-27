# Estoque e envase — pacote revisável INATIVO

Destino único `swzpzcwiasxmjutrmvkm`. Capturas LIVE somente leitura em 27/10/2026. Sem migrations, aplicação, publicação, mudança de runtime, sessões ou dados produtivos. Preparação autorizada como dependência do pacote de entrega, **não como liberação operacional**.

## Entrega do pacote

- `live/catalog.json`: 54 pinos de funções com OID/ACL/config/owner e oito tabelas com ACL/RLS/policies/gatilhos. `live/functions.json`: 57 fontes exatas; as fontes CQ/lote/binding/delete são dependências, nunca reaplicadas.
- `candidate.sql.review`: seis corpos existentes e um helper privado; gerado offline por `assemble.py`. Nenhum GRANT de cliente. Motor e batch já têm EXECUTE authenticated no LIVE; envase e cancelamento cockpit continuam fechados.
- `preflight.sql`/`postflight.sql`: consultas somente leitura com hashes/ACL/OIDs/config e fingerprints; não executadas hosted. `local-post-hashes.json` vem de `pg_get_functiondef` no banco descartável, não de hash aproximado do texto.
- `containment.sql.review`: apenas revoga entrada de cliente nos endpoints alterados; não restaura vulnerabilidades. **Impacto explícito:** conter motor/batch interrompe operações hoje disponíveis. Não aplicar sem revisão do auditor.
- `release.sql.review`: recusa a liberação. Nenhuma migration duplicada foi criada.

## Falhas reproduzidas e candidato

1. `fn_envase_material_imutavel` LIVE aceita `app.estoque_purge_fixture=on` dentro de SECURITY DEFINER: `current_user` é postgres. Reproduzido com Auth sintética e privilégio transacional/local. Candidato remove o escape, sem exceção por role/GUC e sem rollback que o restaure. ACL LIVE de envase é SELECT-only para authenticated; portanto o teste não demonstra PATCH real disponível hoje.
2. Motor LIVE trava item antes do advisory; batch trava advisory antes dos itens. Candidato usa gate global exclusivo antes dos recursos, elimina o primeiro lock redundante do motor e reautoriza após advisory/row. Não afirmar que todos os writers antigos cooperam.
3. Envase LIVE verifica papel antes de espera, replay pode ocorrer antes do escopo, vínculos de item usam AND e volume não finito pode passar. Candidato exige escopo ativo explícito manual de empresa/cliente/OS/programação/lote, identidade de produto **e** micro, após esperas e antes do replay. Exige features envase/ordens_producao/estoque_embalagens; bloqueia origens não compostas. Finitude e linha sem quantidade são rejeitadas.
4. Cancelamento cockpit fazia merge de saldos com locks próprios e GUC; candidato delega ao motor canônico com chave determinística vinculada ao ator/item/OS/motivo. Mantém override gestor. Não retorna replay como autorização para cancelar nova geração: chave antiga com item novamente reservado é PT409 e requer revisão. **Mudança semântica revisável:** não funde registros de saldo principal; a liberação fica no próprio registro, pelo contrato do motor. Não homologado para substituir a UI/entrega ainda.
5. Guardas manuais de CQ/lote/OS não autorizam conclusão de envase. Não emitir ticket de CQ fictício nem mexer nesses corpos: candidato mantém estoque/envase atômicos, mas retorna `avanco.success=false`, `ENVASE_TRANSITION_REVIEW_PENDING`, preservando OS. Isso é contenção explícita, não conclusão da cadeia.

## Testes executados

**46/46 PostgreSQL17.9 descartável** e **49/49 Vitest existentes em quatro arquivos**.

```text
python3 scripts/stock-envase-recovery-20261027/assemble.py
python3 scripts/stock-envase-recovery-20261027/test-local.py
python3 scripts/stock-envase-recovery-20261027/build-checks.py
bun run test -- src/test/envase/consulta.test.ts src/test/estoque/stock-context-hardening.test.ts src/test/estoque/stock-numeric-hardening.test.ts src/test/estoque/stock-caller-compatibility.test.ts
```

Ensaio carrega motor/batch/envase LIVE, testa hashes de seis corpos; usa **motor real**, guardas P1 de lote/estoque/movimentos, append-only, logger, CQ e volume reais. Fluxo positivo: CQ aprovado → envase 2 frascos de 1000mL → estoque reservado 2 unidades/2L → expedição → replay → estorno → cancelamento pelo motor; verifica saldo e livro. Conflito de payload, tenant B/anon, CQ reprovado, volume excedido/NaN, quantidade ausente, falha de ledger com rollback de envase/estoque/recibo, duas conexões uma gravação/um replay, revogação enquanto aguarda lote, ambos ordenamentos de gate, timeout3s sem escrita, contexto GUC forjado substituído.

**Limites:** Auth, SaaS e transporte de hash são sintéticos; schema reutiliza captura histórica de colunas, sem todos defaults/FKs/RLS. Seleção real de gatilhos testada está explícita em `test-local.py`: CQ/volume/tenant, P1/logger/append-only. Não montou refresh views, gatilhos de transição manual, integridade fiscal, todos writers de catálogo, reserva parcial, batch positivo completo ou entrega inteira. Teste de row revogação usa writer local que deliberadamente contorna gate para comprovar releitura; não reproduz um writer produtivo. Não são provas JWT/RLS/browser reais nem fabricação física. Testes Vitest preservam contratos atuais; runtime não mudou.

## NO-GO ainda necessário

- Gate candidato EXCLUSIVO serializa operações globalmente; precisa revisão de custo e cooperação de todos writers, inclusive recursos de autorização/feature. Timeout limita espera de lock, não total da transação.
- Conciliar entrega candidata SHARE com motor EXCLUSIVE: confirmação/cancelamento podem promover lock, duas transações podem deadlock. **Não montar os pacotes juntos** até uniformizar gate antes do primeiro lock da entrega e testar 40P01/55P03 bounded. Nenhum patch da entrega foi feito neste lote.
- Fechar geração completa de conclusão manual mediante contrato de transição existente revisado, sem alterar contenções de CQ/lote; hoje o avanço é explicitamente indisponível.
- Validar estados permitidos da OS/programação e reapresentação de recibos versus novo envase; matriz B2B/onfarm e snapshots não homologados, candidato manual-only.
- Envase usa contexto GUC para rótulo do logger; motor usa contexto privado txid. Ainda precisa ticket de operação específico para envase e proteção de todos writers indiretos antes de alegar canonical-write-only completo. Não abrir helpers/legados para contornar isso.
- Fechar reserva parcial/split/merge com corpos íntegros, batch positivo, relações históricas e triggers/FKs reais; harmonizar a mudança semântica do cancelamento. Chave determinística não autoriza gerações novas.
- Reconciliar cadastro e evidências de CQ reais: lote/testes já existentes preservados; nenhum backfill, produto-micro inventado ou fixture hospedada.
- Homologação real A/B, papéis, revogação e efeitos completos ficam com auditor após revisão. Contabilidade real, emissão/cobrança e SU-518022 permanecem pendentes; comunicações OFF.

Portanto: o pacote reduz bloqueios com provas locais mais completas que o anterior, mas **não libera estoque/envase nem torna entrega pronta**. Revisão/instalação/publicação independentes, sem restauração de escape por rollback.