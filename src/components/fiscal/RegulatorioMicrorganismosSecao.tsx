/**
 * Fase F2 — Seção de cadastro regulatório e fiscal auditável de microrganismos.
 *
 * Esta seção NÃO infere nada. Ela apenas:
 *  - exibe fatos já registrados no dossiê versionado;
 *  - exibe pendências acionáveis vindas do motor único do servidor;
 *  - registra decisões humanas (confirmação de checklist, aprovação de
 *    NCM, revisões e publicação) via RPCs auditadas.
 *
 * Nenhum NCM, CEST, CFOP, CST, origem, GTIN ou unidade é sugerido pelo
 * cliente. Ausência de dado é sempre "não informado", nunca um palpite.
 */
import { useMemo, useState } from "react";
import {
  useMicroorganismRegulatoryOverview,
  type RegulatoryOverviewRow,
} from "@/hooks/useMicroorganismRegulatory";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Loader2, ShieldOff } from "lucide-react";
import { ProductRegulatoryNavigation } from "./ProductRegulatoryNavigation";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";

const NOT_INFORMED = "não informado";

function text(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : NOT_INFORMED;
}

/**
 * Tradução dos códigos de erro do servidor (Fase F2 — correção pós-auditoria).
 * O servidor sempre falha fechado; aqui apenas explicamos ao operador o que
 * precisa ser feito. Nenhuma regra é reimplementada no cliente.
 */
const SERVER_ERROR_MESSAGES: Record<string, string> = {
  permission_denied: "Sem permissão para esta ação.",
  microorganism_required: "Selecione um microrganismo antes desta ação.",
  // Fonte oficial de NCM
  REGULATORY_NCM_SOURCE_REQUIRED:
    "Candidato de NCM exige fonte oficial: informe uma fonte cadastrada ativa ou uma URL oficial (gov.br), com data de consulta e justificativa de no mínimo 20 caracteres.",
  REGULATORY_NCM_SOURCE_NOT_OFFICIAL:
    "A URL informada não é de fonte oficial. Use a TIPI/Receita Federal, CONFAZ ou outra fonte oficial cadastrada.",
  REGULATORY_NCM_CONSULTED_AT_REQUIRED:
    "Informe a data em que a fonte oficial foi consultada.",
  REGULATORY_NCM_OFFICIAL_SOURCE_REQUIRED:
    "Para aprovar o NCM é obrigatória fonte oficial cadastrada, a descrição oficial do código e a versão/data da tabela.",
  REGULATORY_NCM_CANDIDATE_OTHER_DOSSIER:
    "O candidato de NCM aprovado precisa pertencer a este mesmo dossiê.",
  // GTIN
  REGULATORY_GTIN_CHECK_DIGIT_INVALID:
    "GTIN inválido: o dígito verificador GS1 não confere. Confira o código impresso na embalagem.",
  REGULATORY_GTIN_MUTUALLY_EXCLUSIVE:
    "Escolha uma opção: informar o GTIN ou declarar 'sem GTIN' com justificativa.",
  REGULATORY_GTIN_ABSENT_REASON_REQUIRED:
    "Declarar 'sem GTIN' exige justificativa registrada em auditoria.",
  // Storage escopado
  REGULATORY_STORAGE_PATH_INVALID:
    "Caminho do arquivo fora do padrão. Use dossiers/<dossiê>/<documento>/<arquivo>.",
  REGULATORY_STORAGE_PATH_OUT_OF_SCOPE:
    "O arquivo pertence a outro dossiê. Envie o documento dentro da pasta deste dossiê.",
  REGULATORY_STORAGE_OBJECT_MISSING:
    "O arquivo não foi encontrado no repositório privado. Faça o upload antes de registrar o documento.",
  REGULATORY_STORAGE_IMMUTABLE:
    "Documento de dossiê validado ou publicado não pode ser alterado nem excluído.",
  // Segregação de funções
  REGULATORY_SEGREGATION_OF_DUTIES:
    "Segregação de funções: a mesma pessoa não pode aprovar mais de uma camada do mesmo dossiê. Acione outro responsável.",
  REGULATORY_APPROVALS_INCOMPLETE:
    "Publicação exige as três camadas aprovadas (técnica, regulatória e fiscal) por identidades distintas.",
  REGULATORY_OVERRIDE_FORBIDDEN:
    "Somente administrador pode conceder override emergencial de segregação.",
  REGULATORY_OVERRIDE_JUSTIFICATION_WEAK:
    "Override emergencial exige justificativa detalhada (mínimo de 40 caracteres); o ato fica registrado em auditoria.",
};

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return SERVER_ERROR_MESSAGES[err.message] ?? err.message;
  }
  return "Falha inesperada.";
}


export function RegulatorioMicrorganismosSecao() {
  const access=useStorageAccessScope('regulatory-section');
  return <RegulatorySection key={access.scope}/>;
}

function RegulatorySection() {
  const overview = useMicroorganismRegulatoryOverview();
  const [selected, setSelected] = useState<RegulatoryOverviewRow | null>(null);

  const rows = useMemo(() => overview.data ?? [], [overview.data]);

  if (!overview.ready || overview.isLoading) {
    return (
      <Card data-testid="regulatorio-micro-loading">
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Carregando dossiês regulatórios…
        </CardContent>
      </Card>
    );
  }

  if (overview.isError) {
    const denied = overview.error instanceof Error && overview.error.message === "permission_denied";
    return (
      <Alert variant="destructive" data-testid="regulatorio-micro-error">
        <ShieldOff className="h-4 w-4" aria-hidden />
        <AlertTitle>
          {denied ? "Sem permissão para ler dossiês regulatórios" : "Falha ao carregar dossiês"}
        </AlertTitle>
        <AlertDescription>
          {denied
            ? "Solicite acesso ao administrador."
            : "Nenhum estado regulatório é presumido enquanto a leitura falhar."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card data-testid="regulatorio-micro-secao">
      <CardHeader>
        <CardTitle className="text-base">
          Cadastro regulatório e fiscal de microrganismos
        </CardTitle>
        <CardDescription>
          Dossiê versionado com evidência documental, checklist obrigatório de 12 itens
          e tripla aprovação (técnica, regulatória e fiscal). Nada é presumido:
          o que não foi confirmado aparece como pendência acionável.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">

        <Alert data-testid="regulatorio-regras">
          <AlertTitle>Regras obrigatórias deste cadastro</AlertTitle>
          <AlertDescription className="text-xs space-y-1">
            <div>
              <strong>Fonte oficial:</strong> todo candidato de NCM exige fonte cadastrada
              ativa ou URL oficial (gov.br), data de consulta e justificativa. Para aprovar,
              também são exigidas a descrição oficial do código e a versão/data da tabela.
            </div>
            <div>
              <strong>Segregação de funções:</strong> a mesma pessoa não aprova mais de uma
              camada do mesmo dossiê. Publicar exige as três camadas aprovadas por identidades
              distintas — ou override emergencial de administrador, justificado e auditado.
            </div>
            <div>
              <strong>Evidências:</strong> arquivos ficam em repositório privado no caminho
              dossiers/&lt;dossiê&gt;/&lt;documento&gt;/&lt;arquivo&gt;. Arquivo de outro dossiê
              é recusado e documento de dossiê validado ou publicado não pode ser alterado
              nem excluído.
            </div>
          </AlertDescription>
        </Alert>

        <Separator />



        <ul className="divide-y" data-testid="regulatorio-micro-lista">
          {rows.length === 0 && (
            <li className="py-6 text-sm text-muted-foreground">
              Nenhum microrganismo ativo encontrado.
            </li>
          )}
          {rows.map((row) => (
            <li
              key={row.microorganism_id}
              className="py-3 flex flex-col md:flex-row md:items-center gap-3"
              data-testid={`regulatorio-row-${row.microorganism_id}`}
            >
              <div className="md:flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{row.nome}</span>
                  {row.codigo && (
                    <span className="text-xs text-muted-foreground">{row.codigo}</span>
                  )}
                  {row.quarantined && (
                    <Badge variant="destructive">Quarentena</Badge>
                  )}
                  {row.fiscally_ready && <Badge variant="secondary">Apto fiscal</Badge>}
                </div>

              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelected(row)}
                aria-label={`Abrir dossiê regulatório de ${row.nome}`}
              >
                Produtos vinculados
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>

      <RegulatoryNavigationSheet
        key={selected?.microorganism_id ?? 'none'}
        row={selected}
        open={Boolean(selected)}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
      />
    </Card>
  );
}

interface DossierSheetProps {
  row: RegulatoryOverviewRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function RegulatoryNavigationSheet({row,open,onOpenChange}:DossierSheetProps) {
  const access=useStorageAccessScope('regulatory-navigation');
  return <Sheet open={open && access.ready} onOpenChange={onOpenChange}>
    <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" data-testid="regulatorio-produtos-sheet">
      <SheetHeader><SheetTitle>{row?.nome ?? 'Produtos vinculados'}</SheetTitle><SheetDescription>Produtos comerciais</SheetDescription></SheetHeader>
      {row && <ProductRegulatoryNavigation key={`${row.microorganism_id}:${access.scope}`} microId={row.microorganism_id}/>}
      <SheetFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Fechar</Button></SheetFooter>
    </SheetContent>
  </Sheet>;
}

export default RegulatorioMicrorganismosSecao;
