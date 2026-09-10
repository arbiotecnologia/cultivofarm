# 23 — P1: Autorização explícita recebida e parada técnica fail-closed

Data: 2026-09-10 (UTC)
Autorização: explícita, do responsável pelo projeto, para conectar e executar **somente a onda P1** em produção `navfzbwgwzruipouyfnk`.

## 1. Situação da autorização

A barreira de governança que bloqueava produção foi **liberada** por autorização humana explícita nesta mensagem.
Escopo autorizado: produção `navfzbwgwzruipouyfnk`, apenas P1.
Escopo proibido reafirmado: sandbox `yzszlzjpovmcteuxjznj` (uso vedado em qualquer hipótese); staging `ikaauvsflpmamgxmkhoq` apenas referência.

## 2. Verificação de canal ANTES de qualquer escrita

Checagem executada (somente leitura de ambiente, nenhum SQL):

- `PGHOST` = pooler gerenciado do ambiente Lovable.
- Identidade de conexão do banco gerenciado resolve para o ref **`yzszlzjpovmcteuxjznj` (sandbox proibido)**.
- `.env` do repositório havia derivado para o sandbox; foi restaurado para o baseline de homologação (commit `4cf3e2ae`), junto de `src/integrations/supabase/types.ts` (21.850 linhas).
- CLI `supabase`: **ausente** no ambiente (`which supabase` → não encontrado).
- Nenhum canal, credencial ou variável deste ambiente resolve para `navfzbwgwzruipouyfnk`.

## 3. Decisão

**PARADA FAIL-CLOSED ANTES DA PRIMEIRA ESCRITA.**

A autorização remove o impedimento *de governança*, mas não cria o impedimento *técnico* que falta: este ambiente de execução não possui rota autenticada para o projeto de produção. As ferramentas gerenciadas de banco deste projeto apontam fisicamente para o sandbox proibido, e conectá-las violaria o escopo proibido da própria autorização.

Consequentemente:
- Zero SQL executado.
- Zero migration marcada como aplicada.
- Nenhum ledger, postcheck ou Security Advisor de produção pode ser reportado — não existem leituras reais, e reportá-los seria falsificação de evidência.
- Frontend não publicado; Edge Functions não deployadas; integrações externas e entregas (e-mail, WhatsApp, fiscal, webhook) permanecem desligadas.

## 4. O que exatamente falta (único bloqueio remanescente)

1. Canal autenticado direto ao projeto `navfzbwgwzruipouyfnk` a partir do executor (string de conexão do banco de produção, ou CLI Supabase autenticado com esse ref vinculado).
2. CLI Supabase disponível para `migration repair` do ledger após pós-check.
3. Acesso de leitura ao Security Advisor do projeto de produção.

Enquanto (1) não existir no ambiente de execução, a P1 só pode ser executada **na máquina do operador**, pelo runbook da seção 6 do documento `22-p1-backup-local-real.md`.

## 5. Baseline pré-P1

Backup local declarado pelo operador em `C:/Users/renat/Downloads/AR-BIO_BACKUP_2026-09-10` (origem `navfzbwgwzruipouyfnk`, PostgreSQL 17.6, 33 MB) permanece como baseline pré-P1.
Honestidade da evidência mantida: esse backup é **anterior** à P1 e **não** contém `security_invoker=true` nas 3 views; provar `3/3` é responsabilidade do pós-check da P1.

## 6. Veredito

- Autorização de promoção: **RECEBIDA**.
- Backup pré-P1: **GO**.
- Execução da P1 neste ambiente: **NÃO EXECUTADA — bloqueio técnico de acesso**.
- P2: **NO-GO**.
