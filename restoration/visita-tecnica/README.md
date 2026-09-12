# Visita Técnica — auditoria pontual (preparado, não aplicado)

Nada aqui foi executado. Não houve acesso a banco, migrations aplicadas, dados,
secrets, GitHub ou publicação.

## Corrigido agora (somente frontend + testes)

1. **Data pt-BR sem deslocamento** — o cabeçalho reformatava uma data já em
   `DD/MM/YYYY`, e `new Date("12/09/2026")` era lida como mês/dia (09/12/2026).
   `src/lib/date-utils.ts` agora reconhece a string brasileira e a devolve
   intacta.
2. **Máquina de etapas** (`src/lib/visita/etapasVisita.ts`) — ordem única e pura:
   identificação (cliente → fazenda → talhão → data) → visita salva → check-in →
   diagnóstico (problema, descrição, % 0–100) → desfecho. A mensagem exibida é
   sempre a do primeiro requisito bloqueante.
3. **Finalizar** — deixa de ser oferecido em visita nova
   (`resolveVisitaAcoes.showFinalize = false` quando `isNew`) e, quando clicado,
   valida a ordem canônica antes de qualquer consulta ao servidor.
4. **PDF e envio** — só habilitados com a visita persistida e finalizada.
5. **% da área afetada** — limitada a 0–100 na digitação (`clampPercentualArea`).
6. **Dupla submissão** — `finalizandoRef` cobre também a checagem assíncrona de
   retorno duplicado; falha devolve mensagem tratada e libera nova tentativa.

Testes: `src/test/visita/etapasVisita.test.ts` (novo) e ajuste em
`src/test/visita/acoesPersistencia.test.ts`.

## Preparado, aguardando aplicação coordenada

`PREPARADO_rpc_registrar_recomendacao_visita_v1.sql`

- Motivo: ao finalizar com "emitir recomendação", o frontend grava a
  recomendação, atualiza o status e insere o log em chamadas separadas, sem
  transação. Falha no meio deixa registro parcial.
- Conteúdo: RPC `SECURITY DEFINER` com `search_path` fixo, autenticação,
  escopo por atribuição, `FOR UPDATE`, idempotência por `client_uuid`, grants
  mínimos; e `CHECK` de 0–100 para `percentual_area_afetada` (`NOT VALID`).
- O frontend **não** foi trocado para esse contrato: a RPC não existe no banco e
  os tipos não a conhecem. Trocar apenas depois de aplicar e regenerar tipos.
- Pré-requisitos listados no rodapé do próprio arquivo SQL.

## Regras ambíguas — não decididas aqui

- Se gestor/administrador pode finalizar visita atribuída a outro consultor
  (hoje o escopo do servidor permite; a interface não distingue).
- Se "liberar ao produtor" sem aprovação técnica deve exigir perfil específico.
- Se visita finalizada pode receber novas evidências (hoje o anexo continua
  disponível após a finalização).
- Tamanho/tipo máximo de anexo não é validado no servidor, apenas na interface.
- Check-in sem coordenadas (GPS negado) é aceito; não há política definida de
  distância máxima entre check-in e a fazenda.
