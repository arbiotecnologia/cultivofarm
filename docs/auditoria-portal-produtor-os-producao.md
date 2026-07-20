# Fase 9 — Auditoria: Ordens de Serviço vs Produção (Portal do Produtor)

## 1. Rotas analisadas
- `/portal/ordens-servico` → `PortalOrdensServico`
- `/portal/producao` → `PortalProducao`

Registradas em `src/App.tsx` (linhas 315-316), dentro do bloco protegido `PortalLayout` (produtor autenticado via `usePortalCliente`).

## 2. Arquivos analisados
- `src/pages/portal/PortalOrdensServico.tsx` (222 linhas)
- `src/pages/portal/PortalProducao.tsx` (99 linhas)
- `src/pages/portal/PortalLayout.tsx` (guard do portal)
- `src/hooks/usePortalCliente.ts` (resolução de `cliente_id`)

## 3. Componentes usados
| Tela | Componentes de UI |
|---|---|
| Ordens de Serviço | `Card`, `Badge`, `Button`, `Dialog` (Laudo Digital), `Timeline` local com 9 passos (`Bell`, `CheckCircle2`, `FlaskConical`, `Beaker`, `QrCode`) |
| Produção | `Card`, `Badge`, `MobileCard` (`ResponsiveHelpers`), `useIsMobile` |

## 4. Hooks usados
Ambas: `usePortalCliente()` para obter `clienteId`.
Ambas fazem `useEffect` + `useState` chamando `supabase.from(...)` diretamente (sem React Query).

## 5. Tabelas / RPCs consultadas
### Ordens de Serviço
- `ordens_servico` (`select *, fazendas(nome), talhoes(nome), produtos(nome), programacao_producao(lotes(*, controle_qualidade(*))))` filtrado por `cliente_id`)
- `ordens_servico_onfarm` (mesmo shape, filtrado por `cliente_id`)
- Faz merge das duas listas e ordena por `created_at desc`.
- Nenhuma RPC. RLS de `ordens_servico` / `ordens_servico_onfarm` filtra por `cliente_id`.

### Produção
- `ordens_servico` (apenas para obter IDs por `cliente_id`)
- `programacao_producao` (`select *, produtos(nome), microrganismos(nome, nome_cientifico)`) filtrado por `ordem_servico_id.in.(...)` **OR** `ordem_servico_onfarm_id.in.(...)`
- Nenhuma RPC.
- **Observação:** o filtro de OS on-farm compartilha o mesmo pool de IDs de `ordens_servico`, o que pode causar falso-positivo se um `ordens_servico_onfarm.id` coincidir com um `ordens_servico.id`. Não busca `ordens_servico_onfarm` para o cliente separadamente.

## 6. Comparativo OS × Produção

| Aspecto | Ordens de Serviço | Produção |
|---|---|---|
| Objeto de negócio | Atendimento/ordem de serviço do produtor (`ordens_servico` + `ordens_servico_onfarm`) | Etapa produtiva por lote/insumo (`programacao_producao`) |
| Granularidade | 1 registro por OS | N registros por OS (um por bioinsumo programado) |
| Nº exibido | `numero_os` | (não exibe número, apenas produto/microrganismo) |
| Status | 9 fases: aberta → aprovada → programada → em_producao → em_cq → envase → pronto_entrega → entregue → finalizada | 4 fases: aguardando → em_producao → aguardando_cq → aprovado |
| Cliente | Filtrado por `cliente_id`, não exibido | Filtrado indiretamente via OS, não exibido |
| Fazenda / talhão | Sim (`fazendas.nome`, `talhoes.nome`) | Não |
| Produto | Sim (`produtos.nome`) | Sim (`produtos.nome` ou `microrganismos.nome`) |
| Lote | Acessa `programacao_producao.lotes.controle_qualidade` para exibir "Laudo Digital" | Não exibe lote |
| Datas | `data_programada`, `data_recomendada` | `data_programada` |
| Volume | `volume_total_ml`, `area_hectares` | `volume_necessario` (mL) |
| Anexos / laudo | Sim — Dialog com pH, concentração, aparência, odor, contaminação | Não |
| Histórico | Timeline visual das 9 fases | Apenas o status atual |
| Ações do produtor | Ver Laudo Digital (quando fase ≥ envase) | Nenhuma — somente leitura |

### Classificação
**C) Parcialmente sobrepostas.**

Não são duplicadas: representam objetos de negócio diferentes (OS = atendimento; Produção = etapas de fabricação por bioinsumo). Também não são estritamente complementares porque a Timeline da OS já expõe as fases `em_producao`, `em_cq` e `envase`, cobrindo boa parte do que a tela "Produção" mostra de forma mais rasa. O produtor vê o mesmo processo em dois níveis de detalhe, com status divergentes (9 vs 4) e sem cross-link entre as telas.

## 7. Riscos de manter como está
1. **Confusão do produtor** — dois menus para "acompanhar o pedido" com status diferentes.
2. **Divergência de status** — OS pode estar em `envase` enquanto `programacao_producao` ainda mostra `aguardando_cq` (fases não sincronizadas).
3. **Filtro de Produção incompleto/instável** — usa apenas IDs de `ordens_servico`, ignorando `ordens_servico_onfarm` do cliente (bug latente).
4. **Duplicidade de fetch** — ambas fazem queries diretas sem cache; recarrega tudo a cada navegação.
5. **Laudo digital só existe em OS** — se o produtor entra por "Produção" perde o link para o laudo.
6. **Sem histórico/anexos** em "Produção" — tela pobre, oferece pouco valor isolado.

## 8. Recomendação final
**Transformar "Produção" em aba de "Ordens de Serviço"** (opção 4 do enunciado), ou consolidar tudo em uma tela única "Acompanhamento" com abas:

```
/portal/acompanhamento
 ├─ Ordens de Serviço  (default — Timeline atual)
 ├─ Produção           (detalhamento por lote/programação)
 ├─ Entregas           (integrar /portal com entregas)
 └─ Histórico          (OS finalizadas + laudos)
```

Manter as rotas legadas com redirect para `/portal/acompanhamento?tab=...` para não quebrar links salvos.

Alternativa mínima (menor risco): manter as duas telas, mas
- corrigir o filtro de `PortalProducao` (buscar `ordens_servico_onfarm` também);
- adicionar link "Ver ordem de serviço" em cada card de produção;
- renomear "Produção" para "Etapas de Produção" no menu, para deixar claro que é sub-nível da OS.

## 9. Próxima fase sugerida
**Fase 10 — Unificar acompanhamento do produtor em `/portal/acompanhamento` com abas**, seguindo o modelo acima; ou, se o produto preferir manter separado, uma fase menor de correção do filtro de `PortalProducao` e cross-linking com OS.

## 10. Status
**RECOMENDAÇÃO DE UNIFICAÇÃO** — telas parcialmente sobrepostas com risco de divergência de status e bug latente no filtro de Produção. Nenhuma alteração feita nesta fase, conforme escopo.
