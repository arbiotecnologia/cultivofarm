# Plano D51.2 — E2E controlado

Status: **NÃO INICIADO / BLOQUEADO**  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`  
Este documento prepara o gate; não autoriza execução, criação de conta, envio de e-mail, processamento de pedido, alteração operacional, publicação ou avanço para D52.

## 1. Objetivo

Validar, em ambiente canônico e com identidades exclusivamente controladas, o fluxo SaaS completo do pedido de criação da empresa até onboarding, autenticação, recuperação, isolamento por tenant, concorrência e auditoria. O D51.2 deverá produzir evidência reproduzível de que o pipeline é idempotente, fail-closed e não mistura organizações, sem testar qualquer cliente, produtor ou parceiro real.

## 2. Pré-condições obrigatórias

O gate só pode começar quando todas as condições abaixo estiverem comprovadas no mesmo registro de execução:

- [ ] **Leaked Password Protection** habilitada no projeto canônico.
- [ ] Linter reexecutado sem o warning `Leaked Password Protection Disabled`.
- [ ] Suíte global verde no commit candidato ao teste.
- [ ] Sete migrations no-op reconciliadas 1:1 entre ledger e repositório, com conteúdo exclusivo `SELECT 1`.
- [ ] Forward-fix que substitui `raw_user_meta_data` por `raw_app_meta_data.provisioning_request_id` confirmado no banco canônico.
- [ ] Nenhum P0/P1 D51/SaaS aberto.
- [ ] Endereço de e-mail e conta de teste controlados explicitamente aprovados pelo responsável.
- [ ] Janela de teste, responsáveis, critérios de parada e limpeza aprovados.
- [ ] Entregas externas continuam bloqueadas até o instante autorizado do teste SMTP controlado.
- [ ] Snapshot lógico pré-teste das contagens e estados-alvo coletado sem segredos.

Falha em qualquer pré-condição resulta em **NO-GO**, sem execução parcial.

## 3. Dados e identidades de teste

### Regras

- Usar somente conta e endereço de e-mail controlados, dedicados ao gate e explicitamente aprovados.
- Nunca selecionar, convidar, alterar ou reutilizar cliente, produtor, parceiro ou usuário real.
- Usar nomes com prefixo inequívoco `TESTE D51.2` ou `HOMOLOGAÇÃO D51.2`.
- Usar organização isolada criada especificamente para o gate; não reaproveitar tenant operacional.
- Não incluir CPF, CNPJ, telefone, endereço ou dado fiscal real de terceiro.
- Se um identificador formal válido for indispensável, ele deve ser previamente aprovado e documentado como dado de homologação.
- Registrar IDs internos somente no artefato privado da execução e mascará-los no relatório compartilhável.
- Não registrar senha, token, OTP, link completo, chave, cookie ou Authorization header.

### Conjunto mínimo planejado

- Superadmin de teste/controlado, sem papel operacional.
- Tenant A: `HOMOLOGAÇÃO D51.2 TENANT A`.
- Administrador A: endereço controlado aprovado.
- Tenant B: `HOMOLOGAÇÃO D51.2 TENANT B`, somente para isolamento cruzado.
- Administrador B: segundo endereço controlado aprovado quando o cenário exigir duas identidades.
- Um plano sem fiscal e um plano com fiscal já aprovados para homologação, sem cobrança real.

### Limpeza reversível

Antes de criar qualquer objeto, registrar a intenção de teste e a lista exata de recursos esperados. Ao final:

1. desabilitar o acesso das contas de teste;
2. cancelar/inativar os tenants de homologação pelo fluxo suportado, preservando auditoria;
3. revogar sessões e links ainda válidos;
4. desativar vínculos, convites e assinaturas de teste sem apagar histórico;
5. remover Auth user somente se ele tiver sido criado exclusivamente pelo gate, estiver comprovadamente ligado à intenção de teste e a remoção tiver autorização explícita;
6. nunca apagar ou alterar dados preexistentes;
7. comparar contagens e estados finais com o inventário pré-teste;
8. registrar qualquer resíduo esperado e seu prazo de retenção.

## 4. Matriz E2E obrigatória

Cada cenário exige resultado esperado, resultado observado e evidência sanitizada.

| ID | Cenário | Resultado obrigatório |
|---|---|---|
| E01 | Criação de empresa | Um único `organization_id` definitivo, estado inicial válido e auditoria correspondente. |
| E02 | Convite do administrador | Um único job/intenção vinculado à organização correta; superadmin permanece sem papel operacional. |
| E03 | Entrega SMTP | Uma mensagem chega somente ao endereço aprovado; remetente, assunto e destino corretos; nenhum segredo nos logs. |
| E04 | Primeiro acesso | Usuário autenticado é direcionado ao bloqueio de primeiro acesso e não alcança módulos operacionais. |
| E05 | Definição/troca de senha | Admin API altera a senha antes da limpeza transacional; sucesso limpa o bloqueio uma vez. |
| E06 | Recovery | Link controlado redefine acesso, limpa URL/history e não aceita redirect fora da allowlist. |
| E07 | Reenvio | Reutiliza a mesma conta e intenção; não cria Auth user, convite ou tenant adicional. |
| E08 | Link usado/vencido | Link reutilizado ou expirado falha de forma sanitizada, sem liberar acesso ou mudar tenant. |
| E09 | Concorrência | Duas execuções para o mesmo e-mail serializam; apenas uma cria/progride. |
| E10 | Lease maior que a duração | Execução expirada não finaliza e deixa estado retomável, sem corrupção. |
| E11 | Takeover/fencing | Novo lease recebe token distinto; execução antiga não finaliza nem marca falha após takeover. |
| E12 | Hard crash Auth↔Postgres | Crash controlado após Auth e antes do vínculo preserva intenção e permite retomada segura. |
| E13 | Retomada sem duplicar usuário | Reconhece somente a conta com origem server-side comprovada; e-mail isolado não autoriza adoção. |
| E14 | Reenvio simultâneo | Duas solicitações de reenvio não criam nova conta nem convite extra. |
| E15 | Tenant A/B | Administrador A não lê, altera, convida, recupera ou administra recursos de B, e vice-versa. |
| E16 | Superadmin sem papel operacional | Superadmin administra plataforma, mas não recebe `administrador` nem vínculo operacional. |
| E17 | Plano sem fiscal: cadastro geral | Organização e cadastro geral são criados normalmente. |
| E18 | Plano sem fiscal: emissor | Nenhuma identidade/emissor fiscal é criado; tentativa direta é negada no servidor. |
| E19 | Plano com fiscal | Identidade fiscal é criada somente após dados válidos, entitlement e vínculo tenant corretos. |
| E20 | `completed` terminal | Job concluído retorna idempotentemente e nunca volta a provisionar. |
| E21 | Auditoria completa | Estados, ator, tenant, timestamps, tentativas e erros sanitizados permitem reconstruir a execução. |

## 5. Critérios de segurança

Todos são obrigatórios e binários:

- zero senha, token, OTP ou link completo em logs, auditoria, screenshots e relatório;
- zero open redirect em convite, primeiro acesso e recovery;
- zero leitura, escrita ou inferência cross-tenant;
- zero duplicidade de Auth user para a mesma intenção controlada;
- zero convite adicional durante retomada ou reenvio;
- zero `service_role` no cliente, bundle, rede do navegador ou armazenamento local;
- autorização de plataforma validada no servidor e restrita ao superadmin;
- tenant derivado no servidor, nunca confiado a partir de `organization_id` enviado pelo cliente;
- conta retomada somente por origem server-side comprovada em `raw_app_meta_data`;
- falha após atualização de senha mantém comportamento seguro e auditável;
- logs e respostas externas contêm apenas códigos/etapas sanitizados.

Qualquer violação é P0, interrompe o gate e proíbe novas tentativas até correção e revisão.

## 6. Evidências obrigatórias

Coletar sem segredos:

- timestamp UTC de início e fim de cada cenário;
- commit SHA e versão ativa de cada Edge Function envolvida;
- IDs internos mascarados no relatório compartilhável;
- status HTTP, código sanitizado e etapa da resposta;
- contagens antes/depois de Auth users, organizações, perfis, papéis, convites/jobs, assinaturas, configuração fiscal e auditoria;
- screenshots recortadas sem query string, token, OTP, senha, cookie ou e-mail não mascarado;
- logs sanitizados das Edge Functions e eventos de autenticação;
- estados de banco antes, durante e depois, incluindo status, lease, token de fencing apenas como presença/igualdade mascarada, tentativas e timestamps;
- comprovação da ausência de `service_role` no bundle e nas requisições do navegador;
- evidência negativa de tenant A/B e de open redirect;
- comprovante de limpeza e resíduos intencionais preservados.

O relatório final deve distinguir evidência observada, inferência e item não testado. Não declarar 100% sem evidência direta.

## 7. Rollback e cleanup

### Critérios para iniciar cleanup

- todos os cenários terminaram; ou
- ocorreu condição de parada; ou
- a janela autorizada expirou.

### Procedimento

1. bloquear novos reenvios e novas execuções do conjunto de teste;
2. registrar o estado final antes de qualquer limpeza;
3. revogar sessões e invalidar links controlados;
4. inativar/cancelar organização, assinatura e identidade fiscal de teste pelos fluxos suportados;
5. desativar perfis e papéis operacionais de teste;
6. remover conta Auth exclusivamente de teste apenas com autorização explícita e prova de origem;
7. preservar auditoria, IDs de correlação e histórico de estados;
8. confirmar que nenhum dado de tenant real foi tocado;
9. reexecutar contagens e testes negativos essenciais;
10. documentar resíduos, owner e ação de forward-fix quando rollback não for seguro.

Não usar `DROP`, exclusão em massa, edição de schemas reservados ou remoção manual do ledger. Preferir inativação e forward-fix.

## 8. Critério GO/NO-GO

### GO para encerrar D51 e solicitar avanço à D52

Somente quando:

- todas as pré-condições estiverem satisfeitas;
- E01–E21 passarem com evidência;
- critérios de segurança tiverem zero violação;
- limpeza tiver sido concluída ou resíduos explicitamente aceitos;
- suíte global, testes D51 e linter final estiverem verdes para o escopo;
- não houver P0/P1 D51/SaaS aberto;
- o relatório D51.2 receber revisão e aprovação explícita.

### NO-GO

Qualquer cenário obrigatório não executado, evidência incompleta, divergência de ledger, falha de limpeza, warning de leaked password, P0/P1 aberto ou risco de atingir dado real mantém D51 aberto e impede D52.

## 9. Ordem exata de execução

1. Obter autorização específica do Gate D51.2 e das identidades/endereço controlados.
2. Habilitar Leaked Password Protection pelo mecanismo oficial e confirmar o linter sem o warning.
3. Confirmar commit candidato, suíte global verde, sete no-ops 1:1 e forward-fix `raw_app_meta_data` ativo.
4. Aprovar janela, operadores, plano de parada e cleanup.
5. Inventariar contagens/estados pré-teste e validar que nomes/e-mails não pertencem a dados reais.
6. Confirmar flags de entrega externa desativadas; liberar somente o canal SMTP e somente na janela/cenário E03 autorizado.
7. Executar E01–E02: tenant A e convite, sem abrir o link ainda.
8. Executar E03–E08: SMTP, primeiro acesso, senha, recovery, reenvio e links inválidos.
9. Executar E09–E14 em intenções controladas: concorrência, lease, takeover, crash, retomada e reenvio simultâneo.
10. Criar o mínimo necessário para tenant B e executar E15–E16.
11. Executar E17–E20 para planos sem/com fiscal e terminalidade.
12. Validar E21, logs, ausência de segredos, bundle/rede e contagens finais.
13. Desativar imediatamente a entrega externa liberada para o teste.
14. Executar cleanup reversível e validar isolamento pós-limpeza.
15. Rodar certificação final e produzir relatório D51.2 com decisão GO/NO-GO.
16. Parar e aguardar aprovação; não avançar automaticamente para D52.

## 10. Checklist de parada imediata

Interromper novas ações, preservar evidências e iniciar contenção segura se ocorrer qualquer item:

- [ ] senha, token, OTP, cookie, link completo ou `service_role` apareceu em log, UI, screenshot ou rede;
- [ ] usuário, organização, convite, assinatura ou emissor duplicado;
- [ ] acesso ou mutação cross-tenant;
- [ ] superadmin recebeu papel ou vínculo operacional;
- [ ] conta foi adotada apenas por coincidência de e-mail;
- [ ] execução com lease vencido finalizou após takeover;
- [ ] job `completed` voltou a provisionar;
- [ ] reenvio criou conta ou convite adicional;
- [ ] open redirect aceito;
- [ ] plano sem fiscal criou identidade emissora;
- [ ] falha deixou acesso operacional liberado antes do onboarding;
- [ ] dado real foi selecionado, alterado ou recebeu mensagem;
- [ ] resposta/log não sanitizado impede contenção segura;
- [ ] diferença inesperada entre contagens antes/depois;
- [ ] qualquer P0/P1 novo ou suspeita razoável de impacto real.

Após parada: não repetir automaticamente, não apagar evidência, desabilitar entrega externa, revogar sessões controladas, registrar o último passo concluído e aguardar revisão.