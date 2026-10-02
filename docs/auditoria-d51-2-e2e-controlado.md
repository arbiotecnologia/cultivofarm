# Auditoria D51.2 — E2E controlado

Data da tentativa: 2026-10-02  
Supabase canônico exclusivo: `swzpzcwiasxmjutrmvkm`  
Commit candidato confirmado no início do gate: `3e8fdae27bbbc3cab2d49fadb014725728665bf0`

## 1. Decisão

**NO-GO — execução interrompida no pré-gate, antes de E01 e antes de qualquer mutação.**

Foram encontrados dois bloqueios para uma execução E2E fiel ao plano:

1. **P1 — o fluxo de convite não envia SMTP.** A função atual cria a conta e gera um link por `generateLink`, mas apenas devolve o link à interface para cópia manual. Portanto, E03 não pode comprovar envio, aceitação pelo provedor e entrega da mensagem como parte do mesmo fluxo.
2. **Bloqueio operacional — sessão autenticada indisponível.** O ambiente de teste está classificado como Supabase externo não gerenciado e não disponibilizou sessão autenticada do superadmin. As operações E01/E02 devem comprovar a autorização server-side do ator real e não podem ser executadas anonimamente nem com credencial improvisada.

Conforme o checklist de parada, não foi tentada execução parcial, não foi criado usuário/tenant/convite e nenhum e-mail foi enviado. Não houve publicação nem avanço para D52.

## 2. Pré-condições

| Pré-condição | Status | Evidência sanitizada |
|---|---|---|
| Binding canônico | PASS | `supabase/config.toml` aponta exclusivamente para `swzpzcwiasxmjutrmvkm`; consultas canônicas responderam. |
| Commit candidato | PASS | `3e8fdae27bbbc3cab2d49fadb014725728665bf0`, coletado antes do início dos testes. |
| Suíte global verde | PASS | `npx vitest run`: exit 0; 342 arquivos aprovados, 1 ignorado; 5.281 testes aprovados, 4 ignorados. |
| Sete no-ops 1:1 | PASS | Ledger retornou as sete versões esperadas; os sete arquivos locais normalizam exclusivamente para `select1`. |
| Forward-fix Auth | PASS | Função canônica `platform_finalize_org_admin_provisioning` usa `raw_app_meta_data` e não usa `raw_user_meta_data`. |
| Grants internos | PASS | `claim`, `finalize`, `fail` e guard de senha sem EXECUTE para `anon`/`authenticated`; EXECUTE para `service_role`. |
| Leaked Password Protection | EXCEÇÃO ACEITA | Linter confirmou `Leaked Password Protection Disabled`; permanece **ADIADA / RISCO ACEITO TEMPORARIAMENTE**, não resolvida e não homologada. |
| E-mail controlado | PASS | `teste@refilinformatica.com.br` autorizado e sem supressão global observada. |
| Infraestrutura SMTP do fluxo | FAIL / P1 | Nenhum domínio de envio está configurado; principalmente, o convite atual não despacha mensagem, apenas gera link para cópia manual. |
| Sessão superadmin controlada | BLOQUEADO | Ambiente sem sessão autenticada disponível; nenhuma credencial foi solicitada, lida ou registrada. |

## 3. Contagens pré-teste e pós-parada

Leitura inicial sanitizada:

| Objeto | Antes | Depois da parada |
|---|---:|---:|
| Auth users | 6 | 6 |
| Profiles | 6 | 6 |
| Organizations | 2 | 2 |
| Subscriptions | 2 | 2 |
| Convites/jobs | 1 | 1 |
| Configurações fiscais | 1 | 1 |
| Pedidos B2B | 0 | 0 |
| Auth user do endereço controlado | 0 | 0 |
| Convite do endereço controlado | 0 | 0 |
| Organizações com prefixo D51.2 | 0 | 0 |

Estado dos jobs após a parada: 1 `ativo`, zero leases ativos. Não houve registro novo do gate.

## 4. Matriz E01–E21

Todos os cenários foram classificados como **NOT RUN** porque a parada ocorreu no pré-gate, antes da primeira mutação.

| ID | Status | Evidência/justificativa |
|---|---|---|
| E01 | NOT RUN | Nenhuma organização D51.2 criada. |
| E02 | NOT RUN | Nenhum convite criado. |
| E03 | NOT RUN | Fluxo não possui despacho SMTP; zero evento de entrega para o destinatário autorizado na janela. |
| E04 | NOT RUN | Nenhuma conta de teste criada. |
| E05 | NOT RUN | Nenhuma senha foi solicitada, lida ou alterada. |
| E06 | NOT RUN | Recovery depende da conta controlada e do fluxo autenticado. |
| E07 | NOT RUN | Sem convite inicial para reenviar. |
| E08 | NOT RUN | Sem link controlado criado; nenhum token foi exposto. |
| E09 | NOT RUN | Concorrência real não iniciada após condição de parada. |
| E10 | NOT RUN | Lease não foi criado ou expirado pelo gate. |
| E11 | NOT RUN | Takeover/fencing não executado. |
| E12 | NOT RUN | Fault injection não iniciada para evitar órfão sem sessão e cleanup comprovados. |
| E13 | NOT RUN | Retomada não iniciada. |
| E14 | NOT RUN | Reenvio simultâneo não iniciado. |
| E15 | NOT RUN | Segundo e-mail não autorizado; não foi inventada identidade B. |
| E16 | NOT RUN | Leitura estrutural encontrou zero superadmins com papel operacional, mas não substitui E2E. |
| E17 | NOT RUN | Nenhum tenant/plano de teste criado. |
| E18 | NOT RUN | Nenhuma tentativa de emissor executada. |
| E19 | NOT RUN | Nenhuma identidade fiscal criada. |
| E20 | NOT RUN | Terminalidade não exercitada com dado do gate. |
| E21 | NOT RUN | Não houve execução funcional para reconstruir; somente auditoria do pré-gate. |

## 5. P0/P1 e correções

### P1 confirmado — ausência de SMTP no convite

O fluxo `platform-invite-org-admin` usa Admin API para criar/retomar a conta e `generateLink` para produzir um link de recovery. `generateLink` não envia mensagem. A interface exibe o link completo e a senha temporária para cópia manual. Assim, o cenário E03 previsto não representa o comportamento implementado.

Nenhuma correção funcional foi aplicada nesta tentativa: incluir entrega SMTP altera o fluxo de autenticação e comunicação e exige desenho/revisão específica, preservando as flags de comunicação e o destinatário único. O gate permaneceu fail-closed.

### Bloqueio operacional — autenticação do executor

O E2E precisa de uma sessão controlada do superadmin para provar autorização negativa/positiva pela mesma fronteira usada pela aplicação. O projeto usa Supabase externo e esta sessão não estava disponível no ambiente. Não foi usado `service_role` como identidade chamadora e não foi solicitado segredo ao responsável.

## 6. SMTP

- Gerado: **não**.
- Aceito pelo provedor: **não testado**.
- Entregue: **não testado**.
- Link usado: **não**.
- Eventos visíveis para `teste@refilinformatica.com.br` desde o início do gate: **zero**.
- Supressão global do destinatário: **não encontrada**.
- Domínio de envio configurado no projeto: **não**.

Nenhum e-mail foi enviado nesta tentativa.

## 7. Auth, recovery e primeiro acesso

Não executados. O endereço autorizado tinha zero Auth users e zero convites antes do gate e permaneceu assim após a parada. Não houve criação, login, recovery, troca de senha, leitura de OTP ou revogação de sessão.

## 8. Concorrência, lease, fencing e hard crash

Não executados dinamicamente. A inspeção prévia confirmou os contratos estruturais — lock por e-mail, lease, token de fencing, validação de lease na finalização/falha e origem por `raw_app_meta_data` — mas isso não foi contabilizado como PASS E2E.

## 9. Isolamento A/B

Não executado. Não há segundo endereço autorizado e nenhuma identidade foi inventada. O cenário E15 continua pendente, salvo adaptação futura que demonstre isolamento sem criar segunda conta e seja aprovada antes da execução.

A leitura canônica encontrou zero superadmins simultaneamente associados ao papel operacional `administrador`.

## 10. Fiscal e planos

E17–E19 não foram executados. Nenhum cadastro geral, assinatura ou identidade fiscal de teste foi criado ou alterado.

## 11. Auditoria, logs e segredos

- Logs de Auth e Edge Functions na janela do gate: nenhum evento relacionado à execução.
- Eventos de e-mail para o destinatário autorizado: nenhum.
- Busca no frontend de produção por `SUPABASE_SERVICE_ROLE_KEY`/`service_role_key`: zero ocorrência.
- Nenhuma senha, token, OTP, cookie, Authorization, chave privilegiada ou link completo foi coletado ou registrado.
- Nenhuma screenshot foi produzida, pois não havia fluxo autenticado seguro a comprovar.

## 12. Leaked Password Protection

O linter antes da tentativa retornou 492 achados históricos, incluindo exatamente 1 warning `Leaked Password Protection Disabled`. O warning permanece aberto após a parada, sem mascaramento e sem declaração de resolução.

Status: **ADIADO / RISCO ACEITO TEMPORARIAMENTE**. A exceção não cobre nenhum outro P0/P1 de autenticação ou senha.

## 13. Cleanup

Não houve dado do gate para inativar ou remover. A contenção consistiu em não iniciar E01, E02 ou qualquer fault injection. As contagens e estados controlados permaneceram inalterados; auditoria histórica foi preservada.

## 14. Riscos e ações necessárias

1. Corrigir ou aprovar formalmente uma adaptação do E03 que realmente envie uma mensagem de autenticação ao único destinatário autorizado e permita observar aceitação sem expor o link.
2. Disponibilizar uma sessão autenticada controlada do superadmin na prévia; não fornecer credenciais por mensagem.
3. Definir uma adaptação aprovada para E15 sem segundo e-mail ou fornecer posteriormente um segundo endereço controlado.
4. Preparar fault injection e cleanup comprovadamente reversíveis antes de E09–E14.
5. Manter Leaked Password Protection visível como risco aceito e aberto.

## 15. Decisão objetiva

**NO-GO para encerrar D51 e NO-GO para considerar D52.**

O D51.2 foi iniciado apenas até o pré-gate e corretamente interrompido. Uma nova execução exige correção/revisão do caminho SMTP e sessão superadmin controlada. Não publicar e não avançar para D52.