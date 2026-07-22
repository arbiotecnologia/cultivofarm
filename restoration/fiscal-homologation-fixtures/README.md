# Fixtures de Homologação Fiscal (Fase 3.17.1)

**Uso exclusivo em STAGING.** Nenhum script deste diretório é aplicado
automaticamente pelo agente Lovable. Nenhum segredo, credencial,
`project ref`, URL, token ou material A1 real está presente aqui.

## Guardas obrigatórios

Antes de qualquer execução em `psql`, o operador humano precisa:

1. Criar a tabela sentinela com o `project_ref` do banco de STAGING:

```sql
CREATE TABLE IF NOT EXISTS public._fiscal_staging_marker (
  marker      text PRIMARY KEY,
  project_ref text NOT NULL
);
INSERT INTO public._fiscal_staging_marker(marker, project_ref)
VALUES ('STAGING', '<project-ref-do-staging>')
ON CONFLICT (marker) DO UPDATE SET project_ref = EXCLUDED.project_ref;
```

2. Registrar um UUID sintético para servir como `created_by` das
   fixtures (não usar usuário real; se preferir, use `gen_random_uuid()`):

```sql
CREATE TABLE IF NOT EXISTS public._fiscal_hml_context (
  marker text PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public._fiscal_hml_context(marker, user_id)
VALUES ('HML_USER', '00000000-0000-0000-0000-0000FISCALHML'::uuid)
ON CONFLICT (marker) DO NOTHING;
```

3. Em cada sessão `psql`, definir a GUC que precisa bater com o marker:

```sql
SET app.fiscal_test_project_ref = '<project-ref-do-staging>';
```

O preflight aborta se qualquer um destes itens estiver ausente ou
divergente. Nunca há fallback silencioso, nunca há uso automático de
usuário real. O nome do banco por si só não é suficiente para
liberar a execução.

## Ordem de execução (manual)

1. `01-preflight.sql` — valida marker, GUC de sessão, ambiente,
   `production_enabled = false` e presença das migrations
   `20260724000000` e `20260725000000`.
2. `02-seed.sql` — cria as fixtures descritas abaixo e registra
   cada objeto criado em `public._fiscal_hml_inventory`.
3. `03-verify.sql` — provas: zero produção, zero
   AUTHORIZED/ISSUED/TRANSMITTED, `document_origin='MANUAL_RECORD'`,
   itens reais nos rascunhos válidos e snapshots preenchidos.
4. `04-cleanup.sql` — remove exclusivamente objetos listados no
   inventário. Salvaguarda adicional de prefixo `FISCAL_HML_` em
   `nome`/`notes`. Sem `TRUNCATE`, sem `CASCADE`, sem `DROP`.

## Escopo real das fixtures

O seed cria **apenas**:

- Dois clientes sintéticos (`FISCAL_HML_CLIENTE_A` e
  `FISCAL_HML_CLIENTE_B`) com `codigo_cliente` obrigatório também
  prefixado.
- Um rascunho **NF-e** válido (`FISCAL_HML_NFE_OK`) com um item real
  em `fiscal_invoice_items` (`item_kind='PRODUCT'`), snapshots
  preenchidos e `homologation_validation_status='READY'`.
- Um rascunho **NFS-e** válido (`FISCAL_HML_NFSE_OK`) com um item real
  (`item_kind='SERVICE'`), snapshots preenchidos e
  `homologation_validation_status='READY'`.
- Um rascunho **NF-e incompleto** (`FISCAL_HML_NFE_INCOMPLETO`) sem
  snapshots, com `homologation_validation_status='INCOMPLETE'`.

O seed **não** cria:

- Empresa fiscal (`company_fiscal_settings`).
- Perfis fiscais de produto/serviço/cliente
  (`product_fiscal_profiles`, `service_fiscal_profiles`,
  `customer_fiscal_profiles`).
- Certificado digital (`fiscal_certificates`) ou material
  criptográfico (`fiscal_certificate_material`).
- Usuário real em `auth.users`.

Consequência: a Central de Homologação continua reportando itens
`INCOMPLETE` para empresa, NF-e/NFS-e configuradas, perfis prontos
e certificado. Esse comportamento é intencional — o operador
completa manualmente cada peça pelo próprio produto durante a
homologação.

## Colunas usadas (auditoria 3.17.1)

- `public.clientes(nome, cpf_cnpj, codigo_cliente, ativo)` — o
  `codigo_cliente` é `NOT NULL` no schema real.
- `public.fiscal_invoices(invoice_type, document_model,
  document_origin, environment, provider, status, normalized_status,
  homologation_validation_status, customer_id, notes,
  fiscal_profile_snapshot, tax_snapshot, draft_version, created_by,
  total_amount)` — `origin` **não existe**; usa-se
  `document_origin='MANUAL_RECORD'`.
- `public.fiscal_invoice_items(fiscal_invoice_id, item_sequence,
  item_kind, description, quantity, commercial_unit, unit_value,
  gross_value, net_value, fiscal_profile_snapshot, tax_snapshot)` —
  `invoice_id` **não existe**; a coluna real é `fiscal_invoice_id`.

## Cleanup

`04-cleanup.sql` é limitado ao inventário (`public._fiscal_hml_inventory`)
com salvaguarda adicional de prefixo `FISCAL_HML_` em `nome`/`notes`.
Não usa `TRUNCATE`, não usa `CASCADE`, e não toca em nenhum dado
fora do inventário. Nenhum dado real de produção é afetado.
