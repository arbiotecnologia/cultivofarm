# Pré-requisitos para a prova positiva real da entrega — atualizado 30/10

Estado LIVE da AR Bio informado pelo proprietário:
- 0 OS, 0 lotes, 0 estoque e 3 clientes;
- o único estoque existente é de outro tenant (não usar).

Sessão real AR Bio:
- preflight de comprovação → 403/42501;
- PNG sintético → 403 AccessDenied;
- bucket com 0 objetos.

Isso é negativo/fechado, não positivo. Nenhuma consulta hosted foi feita.

## O que já existe LIVE (captura `delivery-atomic-hardening-20261030/capture/current.json`)
- `rpc_aprovar_os_v1`, `rpc_programar_os_v1`, `rpc_cockpit_gerar_lote_v1`: EXECUTE `authenticated`.
- CQ manual: núcleo privado `platform_private.manual_cq_v1` via `rpc_avancar_esteira_laboratorio` (overload com `p_cq`), referência produto-only (`microrganismo_id` nullable) e guards de lote/CQ/pai.
- `rpc_cockpit_registrar_envase_v1`: **somente service_role** (sem acesso de cliente).
- Guard `guard_manual_cq_parent_v1`: OS manual `em_cq` congelada. Hoje **nenhum caminho** a tira de `em_cq`; por isso envase e entrega ficam inalcançáveis.

## Resolvido no candidato v2 (`stock-envase-recovery-20261027`, não aplicado)
- Rebase sobre o motor atual (`44b150bf`, split preservado); o pin antigo `c71a9e84` foi abandonado.
- Transição em_cq→envase→pronto_entrega por autoridade transacional específica (`manual_envase_transition_v1`), sem ticket de CQ, GUC ou status forçado. Mantém os critérios de CQ: lote aprovado e último CQ aprovado.
- A entrega consome a reserva inteira da própria OS sem liberar/re-reservar; reservas de outra OS ou tenant são negadas.
- Gate único antes do primeiro recurso; 40P01/55P03 testados.
- Resultado: 37 PASS em PG com restauração completa.

## Referência de CQ (diagnóstico)
A aprovação LIVE exige:
- `dados_sinteticos=true`;
- responsável `DADOS FICTICIOS SEM VALOR COMERCIAL`;
- uma referência ativa **completa** do produto: pH mín/máx, concentração mínima, aparência/odor/contaminação esperados;
- medidas dentro dessa referência.

Para o fluxo sintético isso basta: uma referência marcada, criada pelo canal administrativo já proposto em `manual-cq-recovery-20261020/fictional-reference-admin.sql.review`, é suficiente.

**Não inferível:** padrões reais de qualidade de produtos reais. Isso é decisão técnica/comercial do responsável de qualidade e não é necessário para a prova sintética.

## Dependências restantes, em ordem
1. **Revisão e instalação do v2.** É técnica, não decisão humana.
2. **Abertura de envase para clientes.** `rpc_cockpit_registrar_envase_v1` é service-only. Abrir para todos os elegíveis seria liberação global; o mesmo vale para a capability. **Não autorizado.** A prova real com sessão AR Bio exige essa decisão de liberação, que fica fora deste lote (sem arquitetura de rollout agora). Este é o bloqueio material atual.
3. **Migração do caller de UI.** `useEsteiraLaboratorio` chama `enviar_envase`/`concluir_envase` via `rpc_avancar_esteira_laboratorio`, o que para OS manual é negado pelo guard já LIVE. O equivalente canônico passa a ser `rpc_cockpit_registrar_envase_v1`, que conclui e transita. A troca de caller deve acompanhar o grant; não pode ser publicada antes.
4. **Dados sintéticos AR Bio** (já autorizados): produto fabricável marcado, referência CQ marcada e OS do fluxo canônico. Execução hosted só depois da revisão.
5. **Recapturar pins da capability** depois do v2.

## Roteiro (quando 1–5 existirem)
1. Leituras prévias de controle: recebíveis 5 / `9c1f86a6…`, fiscal e outbox.
2. Fixture `E2E-FIXTURE-ENTREGA-20261030` pelo fluxo canônico: OS → aprovar → programar → lote → CQ sintético → envase de 1 unidade.
3. Grupo de 1 item consumindo a reserva da OS.
4. Comprovante no Storage.
5. Negativos FSF e anon.
6. Cancelamento.
7. Leituras posteriores iguais.

Resíduo permanente: entrega cancelada, movimentações, envase, eventos e objeto no Storage. Tudo leva o marcador da fixture.
