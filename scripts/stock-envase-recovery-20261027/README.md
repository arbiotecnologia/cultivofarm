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
## v2 — rebase sobre o estado aplicado (30/10), NÃO aplicado

Gerado por `assemble_v2.py` a partir de `capture/current.json` e `post-expected.json` (pós-`a566faa4`). Substitui o candidato de 27/10, cujo pin do motor (`c71a9e84`) ficou obsoleto.

- **Motor:** corpo aplicado `44b150bf` (split preservado) com o gate único inserido antes do primeiro lock de linha. O batch recebe o mesmo gate.
- **Envase:** escopo manual, gate antes da idempotência/locks, reautorização após cada espera, NaN/linha inválida. A conclusão chama `platform_private.stock_envase_complete_v1`, que:
  - exige lote aprovado, último CQ aprovado (critério existente), envase do lote e cobertura da necessidade (ou override de gestor);
  - emite o ticket privado `manual_envase_transition_v1`;
  - leva a OS em_cq→envase→pronto_entrega e consome o ticket.
- **Guard pai de CQ:** um ramo aditivo, só de status, para esse ticket. Os demais ramos ficam byte-idênticos.
- **Entrega em grupo:** consome a reserva inteira desta OS (manual, mesmo cliente, sem parceiro), expedindo sem liberar/re-reservar. Lotes livres continuam no batch; reserva de outra OS, parcial ou de outro tenant → `DELIVERY_RESERVATION_NOT_OWNED`.
- **Imutabilidade do material:** sem o escape de purge; volumes finitos.
- **Rollback deny-only:** transição sempre fechada; guard, motor, batch e grupo voltam aos corpos aplicados exatos; o escape não volta.
- Sem grants a clientes.

**Resultado:** `run_bounded_v2.py` → `test_v2_pg.py` com **37 PASS / 0 FAIL**, 248 s, exit 0. Restauração completa, `release-combined` exato e POST de comprovação. Logs e resultados em `test_v2_pg-current.log.txt` e `test-v2-results.json`. Cobertura:
- drift/POST forçado/COMMIT/rerun;
- helper/ticket negados ao cliente; UPDATE direto e spoof de GUC negados;
- tenant B; CQ reprovado; linha inválida; envase parcial sem transição; envase completo (papel produção); replay;
- reserva de outra OS e parcial negadas; corrida com uma única entrega; misto reservado+livre; ledger;
- gate 55P03 e inversão 40P01 sem resíduo; zero financeiro/fiscal/comunicação; rollback preservando histórico.

Os grants de harness são só locais. O cancelamento de reserva do cockpit (`rpc_cockpit_cancelar_reserva_v1`) fica fora do v2, sem alteração.

**Limites:** dados de upstream são carregados estaticamente (replica) para estágios já LIVE. Não é prova JWT/RLS/Storage hosted. Ver `LOT-GUARD-INVENTORY.md` e `../delivery-group-capability-20261030/PREREQUISITES.md`.

## Revisão 3bb53cc — repetição exata antes das exigências de envio novo (30/10)

**Defeito corrigido:** no grupo do v2, a checagem do estado do estoque (`reservado`/`disponivel`) vinha antes da leitura do recibo. Depois do commit, o estoque fica `expedido`, e a repetição exata falhava com `DELIVERY_STOCK_UNAVAILABLE`. O mesmo valia para a CAS da OS depois do lock.

**Nova ordem:** ator/tenant → OS no escopo (antes da trava) → fingerprint → trava advisory da requisição → reautenticação → gate → OS `FOR UPDATE` com escopo (org/B2B/origem) → **recibo**. No recibo:
- fingerprint igual, senão `DELIVERY_REPLAY_CONFLICT`;
- cliente inalterado durante a espera e ainda no tenant;
- toda entrega do recibo pertence a esse tenant/OS/cliente;
- reautorização imediatamente antes do retorno.

Somente depois vêm CAS, status, cliente e estado do estoque do envio novo. A checagem de CAS antes do lock foi removida, porque a mesma checagem existe depois do lock.

**`stock_envase_complete_v1`:** nova reautorização após as esperas de programação/lote/CQ e imediatamente antes da primeira mutação. A repetição com OS já `pronto_entrega` só responde depois de reautorizar.

**Resultados (PG descartável, restauração completa):**
- `test_v2_pg.py`: **48 PASS / 0 FAIL**, 240 s. Novos casos:
  - repetição exata dos grupos misto, só reservado e só livre: mesmos IDs e zero mutações (hash de entregas/estoque/movimentos/recibos/OS);
  - repetição depois de a OS mudar de revisão;
  - mesma chave com payload diferente → conflito;
  - tenant B → `DELIVERY_SCOPE_DENIED`; ator inativo → negado, sem mutação;
  - cancelamento: repetição exata (`replay=true`, zero mutações) e motivo diferente → conflito;
  - repetição do grupo depois do cancelamento devolve o recibo original sem recriar nada.
- `test_atomic_with_v2.py` (atômico → comprovação → v2): **97 PASS / 0 FAIL / 0 BLOCKED**, com resultados gravados desta execução.
  - Uma caracterização muda por desenho: quem trava a linha diretamente e depois chama o lote (agora com gate) contra o grupo (com gate) → o PostgreSQL resolve um impasse (40P01); o lote confirmou, o grupo abortou, sem efeito parcial.
  - Isso só ocorre com quem trava a linha diretamente, o que clientes não podem fazer. Três writers legados `service_role` (`reservar_estoque_item`, `rpc_cockpit_cancelar_reserva_v1`, criação `/5`) travam a linha sem gate; o `/5` só é chamado dentro do grupo, que já tem o gate.
- `test_proof_with_v2.py`: **103 PASS / 0 FAIL**. Restaura os artefatos do pacote de comprovação que ele reescreve.
- **Falha corrigida no harness:** `test_atomic_with_proof.py` (pacote de comprovação) lia `test-results.json` gravado só sob `__main__`, ou seja, um arquivo possivelmente antigo. Os wrappers novos gravam os checks da própria execução. O total antigo daquele wrapper não deve ser tomado como prova.
