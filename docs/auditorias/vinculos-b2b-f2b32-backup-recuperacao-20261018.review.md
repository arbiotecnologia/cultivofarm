# F2-B3.2 — backup e recuperação comprováveis

**NO-GO confirmado:** o auditor informa ausência de evidência de snapshot/backup recuperável de produção. Nenhum item abaixo está marcado como realizado. PUC/PTC vazias não dispensam backup; o risco inclui dependências, autorização e indisponibilidade de toda a aplicação.

## Checklist para o proprietário e auditor independente
1. Confirmar no painel e conexão o **ref swzpzcwiasxmjutrmvkm**, região, versão PostgreSQL e horário UTC. Não usar `current_database()`, literal SQL ou GUC como prova de destino. Não incluir tokens/DSN/credenciais nos anexos.
2. Registrar autorização específica, operador, janela e operação exata. Exportar manifesto antigo e ampliado B3.2, versões de migrations e SHA-256 dos arquivos revisados. Guardar artefatos em local privado com responsáveis e acesso limitado; não no repositório público.
3. No painel Supabase, comprovar modalidade disponível (backup diário/PITR), último backup **concluído**, janela de retenção, possibilidade efetiva de restauração e horário-alvo anterior à mudança. Disponibilidade/plano/custo não foram consultados nesta rodada; não prometer PITR ou clonagem gratuita.
4. Registrar ID do backup/snapshot, estado, hora, cobertura, retenção e prazo de expiração. Screenshot de botão habilitado, `success:true` de migration e existência de dump NÃO demonstram recuperabilidade.
5. Exigir cobertura de schema, dados, RLS, grants, owners, funções, triggers, índices, constraints e migrations. Documentar separadamente o que o método cobre de Auth/roles/extensions e o que não cobre. Backup de banco **não significa backup dos objetos Storage**, configuração de provedores ou secrets; guardar cobertura e plano próprios sem exportar secrets para chat.
6. Executar um **ensaio real de restauração** pelo método aprovado pelo proprietário, em destino isolado autorizado, jamais sobrescrever produção para testar. Não reutilizar a homolog divergente como prova de fidelidade. Clonagem contendo Auth/PII exige autorização e controle próprios; para esta tarefa não está autorizada qualquer cópia de usuários/dados privados. Se não houver destino ou método aprovado, manter NO-GO e solicitar decisão do proprietário.
7. No destino restaurado: impedir entregas externas antes de liberar acesso; confirmar serviços OFF, isolamento de rede/operadores e ausência de tráfego de usuários reais. Segredos devem ser tratados pelo procedimento seguro do provedor, não copiados manualmente. A política deste projeto exige validar o destino autorizado antes de qualquer operação; o agente não executa restauração/testes em outro ref.
8. Auditor mede duração real de restauração (**RTO observado**) e ponto de recuperação/perda potencial (**RPO observado**), compara manifests/contagens e verifica funções/ACL/RLS/triggers e leituras autorizadas/negadas com fixtures aprovadas. Registrar falhas, operador, UTC e artefato protegido. SQL privilegiado não prova login/RLS.
9. Definir como recuperar alterações legítimas feitas **após** o snapshot sem transferir dados entre tenants; restaurar backup inteiro pode perder gravações de outras tabelas. Congelamento/janela, reconciliação e responsáveis precisam aceite explícito. Rollback das duas colunas é preferível quando seguro, mas não substitui recuperação de desastre.
10. Antes da execução externa: confirmar backup ainda retido, ensaio aprovado e pronto atendimento. Se expirar antes da janela, obter outro backup e repetir o gate aplicável. Aprovação deve referenciar o backup e o ensaio, não apenas um texto de oito caracteres.

## Registro mínimo de evidência (sem credenciais ou PII)
| Campo | Situação neste turno |
|---|---|
| Ref/origem | Canônico informado pelo usuário; nenhum acesso hospedado novo pelo agente |
| Backup ID/status/UTC/retention | NÃO FORNECIDO |
| Destino/método de restauração autorizado | NÃO FORNECIDO |
| Restore concluído/manifest comparado | NÃO REALIZADO |
| RTO/RPO observados e aceitos | NÃO MEDIDOS |
| Cobertura Storage/Auth/configuração | NÃO VERIFICADA |
| Plano de reconciliação pós-snapshot | PENDENTE |
| Autorização de implantação | NEGADA NESTA FASE |

## Se futuramente optar por metadata neutra
Reexecutar preflight em snapshot consistente read-only; comparar dados/consumers/digests. Na janela de DDL, transação contínua sem pausas, locks ordenados e timeout; qualquer falha aborta tudo, operador encerra a transação e não repete automaticamente. Postflight antes de liberar tráfego/consumidores novos. Ter rollback revisado e restore ensaiado, com critério de escalonamento se o rollback recusar dependências ou valores preenchidos.

**Recomendação atual: adiar as colunas.** Não melhora grant/revoke, revogação, isolamento ou UX; criar campos falsificáveis agora aumenta superfície e trabalho operacional sem desbloquear o desenho B3.3.