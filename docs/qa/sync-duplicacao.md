# Roteiro de QA: Sincronização sem duplicatas

Cenários para validar manualmente que `useOfflineSync` + `MobileCheckin` +
`MobileRegistrarOcorrencia` nunca duplicam dados — cobrindo React 18 StrictMode
em dev, múltiplas abas, falhas de upload e reenvios.

## Pré-condições comuns

- App rodando em dev (`npm run dev`) — StrictMode ativo, efeitos rodam 2x.
- DevTools aberto: console + Network (para alternar Offline/Online).
- Usuário consultor logado.
- Conferir antes de cada teste que a fila offline está vazia (badge no
  `OfflineIndicator` zerada).

---

## 1. Ocorrência criada offline (caminho feliz)

1. DevTools → Network → **Offline**.
2. App → "Registrar ocorrência" → preencher tipo, problema e adicionar
   **2 fotos**.
3. Salvar. Esperado: toast "Ocorrência salva offline" e badge mostrando 1 item
   pendente.
4. DevTools → **Online**.
5. Observar `OfflineIndicator`:
   - Barra de progresso vai de 0 → 100%.
   - Contador `✔ 1 / ✕ 0`.
6. No banco:
   ```sql
   select count(*) from registros_consultor where client_uuid = '<uuid mostrado no console>';
   ```
   Resultado esperado: **1**.
7. Conferir `registros_consultor_arquivos`: 2 linhas, ambas com
   `client_uuid` distinto.

---

## 2. StrictMode dev — double mount

1. Repetir o cenário 1 até a etapa 3 (item pendente, ainda offline).
2. Voltar online. Em paralelo, recarregar a página (Cmd+R / Ctrl+R) durante o
   sync (StrictMode + remount disparam efeito 2x).
3. Esperado:
   - Console mostra no máximo 1 log de "tentativa" para o registro.
   - Banco continua com **count = 1** para o `client_uuid`.

---

## 3. Múltiplas abas

1. Criar ocorrência offline (cenário 1, etapas 1-3).
2. Abrir o app em **outra aba** (mesmo usuário) e voltar Online em ambas
   simultaneamente.
3. Esperado:
   - Apenas uma aba processa o item; a outra ignora silenciosamente
     (`claimPendingRegistro` retorna `false`).
   - Banco: **count = 1**.
   - Caso ocorra corrida (ambas chamarem `insert` antes do claim resolver),
     o segundo insert recebe `23505` e é tratado como sucesso idempotente.
     Confirmar via log: `mensagem_erro: "idempotente — registro já existia"`.

---

## 4. Check-in offline com mesma chave

1. Em uma fazenda, fazer check-in offline.
2. Antes de voltar online, recarregar a página → o check-in continua na fila.
3. Voltar online — o item sincroniza.
4. Esperado: 1 linha em `visitas_checkin` com `client_uuid` único.
5. Refazer um sync manual via `OfflineIndicator` (botão Sync) — não deve criar
   nova linha.

---

## 5. Falha de upload de mídia

1. Criar ocorrência offline com 1 foto.
2. **Antes** de voltar online: no Supabase Dashboard, renomear temporariamente
   o bucket `consultor-arquivos` para `consultor-arquivos-x` (simula bucket
   ausente).
3. Voltar online. Esperado:
   - Registro **não** é removido da fila.
   - `OfflineIndicator` mostra `✕ 1`.
   - `AuditoriaSync` → aba "Mídias travadas" lista a foto com `lastUploadError`.
4. Restaurar nome do bucket.
5. Acionar "Sincronizar" novamente.
6. Esperado: foto sobe (mesmo path determinístico, `upsert: true`), registro
   sai da fila. Sem duplicar nada.

---

## 6. Limite de tentativas

1. Forçar uma foto a falhar 3 vezes (mantendo bucket renomeado e clicando
   "Sincronizar" 3x).
2. Ao 4º clique, esperado: log de "máximo de tentativas excedido"; foto fica
   marcada para gerência manual em `AuditoriaSync` (descartar ou reenfileirar).

---

## 7. Visita técnica — checklist visual

1. Criar nova visita pelo `MobileVisita`.
2. Salvar rascunho.
3. Abrir aba "Final" → card de checklist deve mostrar **0/2** com:
   - ✕ Problema principal
   - ✕ Descrição técnica
4. Tab "Diag." deve exibir badge vermelho com "2".
5. Botão "Finalizar visita" deve estar **desabilitado** com tooltip explicando.
6. Preencher "Problema principal" → checklist sobe para 1/2; badge mostra 1.
7. Preencher "Descrição técnica" → card vira verde "Pronto para finalizar";
   botão habilita.

---

## Checklist final do reviewer

- [ ] Banco nunca tem duplicatas com mesmo `client_uuid`.
- [ ] `sync_log` tem 1 entrada de sucesso por item, ou 1 de "idempotente".
- [ ] Mídias com falha permanecem rastreáveis em `AuditoriaSync`.
- [ ] Botão "Finalizar visita" só habilita quando o checklist está completo.
