/**
 * Acompanhamento da visita técnica — componente de domínio reutilizável.
 *
 * Consome exclusivamente o workspace autoritativo (`rpc_get_visita_workspace`):
 * conduta/orientação, próximo passo, aprovação e comentários permitidos, OS
 * geradas, plano de monitoramento, retornos programados e timeline — sempre
 * respeitando a audiência devolvida pelo servidor (`permissions.can_view_internal`).
 *
 * Nenhuma regra de visibilidade é derivada no front: itens internos simplesmente
 * não chegam para o produtor.
 */
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateDisplay } from "@/lib/date-utils";
import { STATUS_LABEL_REGISTRO } from "@/lib/registroTransitions";
import type { VisitaWorkspace } from "@/hooks/useVisitaWorkspace";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-3 space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </Card>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

export interface AcompanhamentoVisitaProps {
  workspace: VisitaWorkspace | null | undefined;
  isLoading?: boolean;
}

export function AcompanhamentoVisita({ workspace, isLoading }: AcompanhamentoVisitaProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (!workspace) {
    return <Vazio>Acompanhamento indisponível.</Vazio>;
  }

  const interno = !!workspace.permissions?.can_view_internal;
  const registro = (workspace.registro ?? {}) as Record<string, any>;

  return (
    <div className="space-y-3">
      <Section title="Conduta e orientação">
        {registro.acao_realizada || registro.proxima_acao_recomendada ? (
          <div className="space-y-2 text-sm">
            {registro.acao_realizada && (
              <div>
                <p className="text-[11px] uppercase text-muted-foreground">Conduta adotada</p>
                <p className="text-foreground whitespace-pre-line">{registro.acao_realizada}</p>
              </div>
            )}
            {registro.proxima_acao_recomendada && (
              <div>
                <p className="text-[11px] uppercase text-muted-foreground">Próximo passo</p>
                <p className="text-foreground whitespace-pre-line">{registro.proxima_acao_recomendada}</p>
              </div>
            )}
            {registro.data_proxima_visita && (
              <p className="text-xs text-muted-foreground">
                Próxima visita prevista: {formatDateDisplay(registro.data_proxima_visita)}
              </p>
            )}
          </div>
        ) : (
          <Vazio>Nenhuma conduta registrada até o momento.</Vazio>
        )}
      </Section>

      <Section title="Dados de campo (registrados no mobile)">
        {workspace.campo ? (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-[11px] uppercase text-muted-foreground">Área avaliada</p>
              <p className="text-foreground">{(workspace.campo as any).area_avaliada_ha ?? "—"} ha</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground">Fase fenológica</p>
              <p className="text-foreground">{(workspace.campo as any).fase_fenologica || "—"}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground">Estande (plantas/ha)</p>
              <p className="text-foreground">{(workspace.campo as any).estande_plantas_ha ?? "—"}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground">Uniformidade</p>
              <p className="text-foreground">{(workspace.campo as any).uniformidade || "—"}</p>
            </div>
            {(workspace.campo as any).observacoes_campo && (
              <div className="col-span-2">
                <p className="text-[11px] uppercase text-muted-foreground">Observações de campo</p>
                <p className="text-foreground whitespace-pre-line">{(workspace.campo as any).observacoes_campo}</p>
              </div>
            )}
          </div>
        ) : (
          <Vazio>Nenhuma avaliação de campo registrada.</Vazio>
        )}
      </Section>

      <Section title="Plano de monitoramento">
        {workspace.monitoramento.length ? (
          <ul className="space-y-1">
            {workspace.monitoramento.map((m: any) => (
              <li key={m.id} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{m.tipo}</span>
                <span className="text-xs text-muted-foreground">
                  {m.data_referencia ? formatDateDisplay(m.data_referencia) : "—"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Vazio>Nenhum monitoramento ativo.</Vazio>
        )}
      </Section>

      <Section title="Retornos programados">
        {workspace.retornos.length ? (
          <ul className="space-y-1">
            {workspace.retornos.map((r: any) => (
              <li key={r.id} className="flex items-center justify-between text-sm">
                <span className="text-foreground">
                  {r.data_vistoria ? formatDateDisplay(r.data_vistoria) : "Sem data"}
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  {STATUS_LABEL_REGISTRO[r.status as never] || r.status}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <Vazio>Nenhum retorno programado.</Vazio>
        )}
      </Section>

      <Section title="Ordens de serviço">
        {workspace.ordens_servico.length ? (
          <ul className="space-y-1">
            {workspace.ordens_servico.map((os: any) => (
              <li key={os.id} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{os.numero_os || os.id.slice(0, 8)}</span>
                <Badge variant="outline" className="text-[10px]">{os.status}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <Vazio>Nenhuma OS gerada a partir desta visita.</Vazio>
        )}
      </Section>

      {interno && (
        <Section title="Resultado da aprovação">
          {workspace.aprovacoes.length ? (
            <ul className="space-y-2">
              {workspace.aprovacoes.map((ap: any) => (
                <li key={ap.id} className="text-sm">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-[10px]">{ap.status_aprovacao}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {ap.data_aprovacao ? formatDateDisplay(ap.data_aprovacao) : "—"}
                    </span>
                  </div>
                  {ap.comentario_gestor && (
                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">
                      {ap.comentario_gestor}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Vazio>Sem parecer registrado.</Vazio>
          )}
        </Section>
      )}

      {interno && (
        <Section title="Comentários das recomendações">
          {workspace.comentarios.length ? (
            <ul className="space-y-2">
              {workspace.comentarios.map((c: any) => (
                <li key={c.id} className="text-sm">
                  <p className="text-[11px] text-muted-foreground">
                    {c.autor_nome || c.autor_tipo} · {c.created_at ? formatDateDisplay(c.created_at) : ""}
                  </p>
                  <p className="text-foreground whitespace-pre-line">{c.mensagem}</p>
                </li>
              ))}
            </ul>
          ) : (
            <Vazio>Nenhum comentário.</Vazio>
          )}
        </Section>
      )}

      {interno && (
        <Section title="Histórico da visita">
          {workspace.timeline.length ? (
            <ul className="space-y-1">
              {workspace.timeline.map((l: any) => (
                <li key={l.id} className="text-xs">
                  <span className="text-muted-foreground">
                    {l.data_hora || l.created_at ? formatDateDisplay(l.data_hora || l.created_at) : "—"} ·{" "}
                  </span>
                  <span className="text-foreground">{l.descricao || l.acao}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Vazio>Sem eventos registrados.</Vazio>
          )}
        </Section>
      )}
    </div>
  );
}

export default AcompanhamentoVisita;
