# Agenda Técnica — correções aplicadas e migration preparada

## Aplicado no front-end (sem tocar em banco)

1. **Navegação do calendário** — a página deixou de repassar à grade a lista já
   filtrada pelo período (`hoje`/`semana`/`mês`). A grade recebe
   `filteredSemPeriodo` (apenas status e urgência) e navega livremente com o
   próprio cursor; o filtro de período continua valendo para lista e mapa.
   A mensagem "nenhuma visita nesse período" deixou de aparecer sobre a grade.
2. **Limites de horário centralizados** — `src/lib/agenda/grid.ts` define
   `HOUR_START`, `HOUR_END`, `SLOT_HEIGHT`, `isWithinGridRange`,
   `resolveDropSlot` e `resolveDropDate`. O drop é sempre truncado para um
   horário que a grade consegue exibir (19:00 é o último; 19:30 não existe mais).
3. **Concorrência** — o handler ignora novos reagendamentos enquanto houver um
   pendente, os blocos ficam não arrastáveis (`isMoving`) e o cache é
   invalidado também em falha, restaurando o estado real.
4. **Ordem do reagendamento** — a atualização de `portal_solicitacoes` vem
   primeiro; o log em `visitas_logs` só é gravado depois e a sincronização
   externa acontece por último, best-effort.

Testes: `src/test/agenda/agenda-grid.test.ts`.

## Preparado, não aplicado

`PREPARADO_rpc_reagendar_visita_v1.sql` — RPC transacional que faz o update e o
log na mesma transação, com `auth.uid()`, autorização por perfil/atribuição,
validação de faixa de horário e bloqueio de status não reagendável.
Não foi aplicada porque o contrato ainda não existe em `types.ts`; trocar o
front-end antes quebraria a compilação do preview. Após aplicar a migration e
regenerar os tipos, substituir as duas chamadas do `moveMutation` por
`supabase.rpc("rpc_reagendar_visita_v1", { p_solicitacao_id, p_nova_data })`,
mantendo o `sync-calendar-event` apenas após sucesso.

## Regras ambíguas registradas (não alteradas)

- Gestor/administrador pode reagendar e iniciar visita atribuída a outro
  consultor — mantido como está, tanto no front-end quanto na RPC preparada.
- `confirmacao_produtor` volta a `pendente` em qualquer reagendamento, mesmo
  em mudanças de poucos minutos.
- Não há verificação de conflito de horário entre visitas; o front-end apenas
  trata a mensagem `CONFLITO_AGENDA` caso o banco a produza.
