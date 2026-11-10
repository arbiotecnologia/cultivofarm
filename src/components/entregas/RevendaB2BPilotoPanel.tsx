import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { Rpc, RetrySnapshot } from "@/lib/entregas/deliveryOperationsFlow";
import { loadPending, savePending, clearPending, markReplayRejected } from "@/lib/entregas/deliveryOperationsFlow";
import {
  loadReserveAttempt, probeResaleCapability, replayResaleGroup, replayResaleReservation, runAtomicResaleGroup, runResaleReservation,
  type ReserveAttempt,
} from "@/lib/entregas/b2bResaleDeliveryFlow";

type OsRow = { id: string; numero_os: string | null; status: string; updated_at: string; origem: string | null; partner_order_id: string | null; produto_id: string | null; partner_orders?: { partner_id: string } | null };
type StockRow = { id: string; quantidade: number | null; status: string; updated_at: string; reservado_para_os_id: string | null; quantidade_reservada: number | null };
const CLOSED_MSG = "Operação de revenda indisponível para esta sessão.";

/**
 * Piloto de revenda B2B: lista OS B2B prontas e oferece reserva/criação de entrega SOMENTE quando a capability
 * exata do servidor (ator/empresa/OS/estoque/operação, concessão vigente) confirma. Nunca grava diretamente;
 * usa os writers atômicos existentes. Confirmação e comprovante continuam nos fluxos canônicos da página.
 */
export function RevendaB2BPilotoPanel({ actorId, orgId }: { actorId: string | null; orgId: string | null }) {
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  const session = `${actorId}:${orgId}`;
  const sessionRef = useRef(session); sessionRef.current = session;
  const [osList, setOsList] = useState<OsRow[]>([]);
  const [selected, setSelected] = useState<OsRow | null>(null);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [caps, setCaps] = useState<Record<string, { reserve: boolean; deliver: boolean }>>({});
  const [qty, setQty] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingReserve, setPendingReserve] = useState<ReserveAttempt | "corrupt" | null>(null);
  const [pendingGroup, setPendingGroup] = useState<RetrySnapshot | "corrupt" | null>(null);

  const fenceFor = (captured: string) => () => { if (sessionRef.current !== captured) throw new Error("stale"); };
  const store = typeof localStorage !== "undefined" ? localStorage : null;

  useEffect(() => {
    setOsList([]); setSelected(null); setStock([]); setCaps({}); setNotice(null);
    if (!actorId || !orgId) return;
    const captured = session; let alive = true;
    (supabase as any).from("ordens_servico")
      .select("id, numero_os, status, updated_at, origem, partner_order_id, produto_id, partner_orders(partner_id)")
      .eq("origem", "b2b").eq("status", "pronto_entrega").order("updated_at", { ascending: false }).limit(50)
      .then(({ data, error }: any) => { if (!alive || sessionRef.current !== captured) return; if (error) { setNotice("Não foi possível listar as OS de revenda."); return; } setOsList((data ?? []) as OsRow[]); });
    return () => { alive = false; };
  }, [actorId, orgId, session]);

  const loadOs = useCallback(async (os: OsRow) => {
    if (!actorId || !orgId || !os.produto_id) return;
    const captured = session; setSelected(os); setCaps({}); setNotice(null);
    setPendingReserve(store ? loadReserveAttempt(store, actorId, orgId, os.id) : "corrupt");
    const pg = store ? loadPending(store, actorId, orgId) : "corrupt";
    setPendingGroup(pg && pg !== "corrupt" && pg.osId !== os.id ? null : pg);
    const { data, error } = await (supabase as any).from("estoque_produto")
      .select("id, quantidade, status, updated_at, reservado_para_os_id, quantidade_reservada")
      .eq("produto_id", os.produto_id).not("origem_estoque", "is", null).in("status", ["disponivel", "reservado"]).limit(100);
    if (sessionRef.current !== captured) return;
    if (error) { setNotice("Não foi possível listar o estoque."); return; }
    const rows = ((data ?? []) as StockRow[]).filter(r => r.status === "disponivel" || r.reservado_para_os_id === os.id);
    setStock(rows);
    const next: Record<string, { reserve: boolean; deliver: boolean }> = {};
    for (const r of rows) {
      const reserve = r.status === "disponivel" ? !!(await probeResaleCapability(rpc, os.id, [r.id], orgId, "reserve")) : false;
      const deliver = r.status === "reservado" ? !!(await probeResaleCapability(rpc, os.id, [r.id], orgId, "delivery_create")) : false;
      next[r.id] = { reserve, deliver };
    }
    if (sessionRef.current === captured) setCaps(next);
  }, [actorId, orgId, session]); // eslint-disable-line react-hooks/exhaustive-deps

  const reserve = async (r: StockRow) => {
    if (!actorId || !orgId || !selected || !store || !selected.partner_order_id || !selected.partner_orders?.partner_id) return;
    const n = Number(qty[r.id] ?? "");
    const captured = session; setBusy(true); setNotice(null);
    try {
      const out = await runResaleReservation(rpc, store, { key: crypto.randomUUID(), actor: actorId, org: orgId, osId: selected.id, stockId: r.id, qty: n, partnerId: selected.partner_orders.partner_id, partnerOrderId: selected.partner_order_id }, fenceFor(captured));
      if (out.status === "confirmed") { await loadOs(selected); setNotice("Reserva registrada."); }
      else if (out.status === "closed") setNotice(CLOSED_MSG);
      else if (out.status === "rejected") setNotice(`Reserva recusada pelo servidor (${out.code}). Nada foi reservado.`);
      else if (out.status === "uncertain") { setPendingReserve(out.attempt); setNotice("Resultado incerto: a reserva pode ter sido gravada. Use “Consultar mesma reserva”; nenhuma nova reserva será enviada."); }
    } catch (e: any) { setNotice(e?.message ?? "Reserva inválida. Nada foi enviado."); } finally { setBusy(false); }
  };

  const replayReserve = async () => {
    if (!store || !pendingReserve || pendingReserve === "corrupt" || !selected) return;
    const captured = session; setBusy(true);
    try {
      const out = await replayResaleReservation(rpc, store, pendingReserve, fenceFor(captured));
      if (out.status === "confirmed") { setPendingReserve(null); await loadOs(selected); setNotice("Reserva confirmada pelo recibo da mesma chave."); }
      else if (out.status === "uncertain") setNotice(out.replayRejected ? `Consulta recusada (${out.replayRejected}). Isso não prova que a reserva original falhou; a tentativa continua retida.` : "Ainda sem recibo. A tentativa continua retida; nenhuma nova reserva foi enviada.");
    } finally { setBusy(false); }
  };

  const createDelivery = async (r: StockRow) => {
    if (!actorId || !orgId || !selected || !store) return;
    const captured = session; setBusy(true); setNotice(null);
    try {
      let attempt: RetrySnapshot | null = null;
      const out = await runAtomicResaleGroup(rpc, {
        requestKey: crypto.randomUUID(), expectedOrg: orgId, osId: selected.id, osTipo: "padrao", osPartnerOrderId: selected.partner_order_id,
        osObservedUpdatedAt: selected.updated_at,
        itens: [{ itemId: r.id, quantidade: Number(r.quantidade_reservada), observedUpdatedAt: r.updated_at, status: r.status, reservadoParaOsId: r.reservado_para_os_id, quantidadeReservada: r.quantidade_reservada, quantidadeTotal: r.quantidade }],
        dados: {},
      }, fenceFor(captured), (s) => { savePending(store, actorId, orgId, s); attempt = s; });
      if (out.status === "confirmed") { if (attempt) clearPending(store, actorId, orgId, attempt); setNotice("Entrega criada. Envio, comprovante e confirmação seguem na lista de entregas."); }
      else if (out.status === "closed") setNotice(CLOSED_MSG);
      else if (out.status === "rejected") { if (attempt) clearPending(store, actorId, orgId, attempt); setNotice(`Entrega recusada pelo servidor (${out.code}).`); }
      else if (out.status === "uncertain") { setPendingGroup(out.retry); setNotice("Resultado incerto da entrega. Somente a repetição exata do mesmo envio está disponível."); }
    } catch (e: any) { setNotice(e?.message ?? "Entrega inválida. Nada foi enviado."); } finally { setBusy(false); }
  };

  const replayGroup = async () => {
    if (!store || !actorId || !orgId || !pendingGroup || pendingGroup === "corrupt") return;
    const captured = session; setBusy(true);
    try {
      const out = await replayResaleGroup(rpc, pendingGroup, fenceFor(captured));
      if (out.status === "confirmed") { clearPending(store, actorId, orgId, pendingGroup); setPendingGroup(null); setNotice("Entrega confirmada pela repetição exata."); }
      else if (out.status === "rejected") { setPendingGroup(markReplayRejected(store, actorId, orgId, pendingGroup, out.code)); setNotice(`Repetição recusada (${out.code}); o envio original pode ter sido gravado. Tentativa mantida.`); }
      else setNotice("Ainda incerto. Tentativa mantida; nenhum novo envio.");
    } finally { setBusy(false); }
  };

  return (
    <Card aria-label="Revenda B2B (piloto)">
      <CardHeader><CardTitle className="text-base">Revenda B2B (piloto)</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {notice && <p role="status">{notice}</p>}
        {osList.length === 0 ? <p className="text-muted-foreground">Nenhuma OS de revenda pronta para entrega.</p> : (
          <ul className="space-y-1">{osList.map(os => (
            <li key={os.id}><Button variant={selected?.id === os.id ? "default" : "outline"} size="sm" onClick={() => loadOs(os)}>OS {os.numero_os ?? os.id.slice(0, 8)}</Button></li>
          ))}</ul>
        )}
        {selected && pendingReserve === "corrupt" && <p role="alert">Registro local de reserva inválido. Nenhuma reserva será enviada.</p>}
        {selected && pendingReserve && pendingReserve !== "corrupt" && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={replayReserve}>Consultar mesma reserva</Button>
        )}
        {selected && pendingGroup && pendingGroup !== "corrupt" && pendingGroup.osId === selected.id && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={replayGroup}>Repetir mesmo envio</Button>
        )}
        {selected && (
          <table className="w-full"><tbody>{stock.map(r => (
            <tr key={r.id} aria-label={`Estoque ${r.id}`}>
              <td>{r.status === "reservado" ? `Reservado: ${r.quantidade_reservada ?? "—"} emb.` : `Disponível: ${r.quantidade ?? "—"} emb.`}</td>
              <td>{r.status === "disponivel" && (
                <span className="flex gap-2">
                  <Input aria-label="Quantidade de embalagens" className="w-20" inputMode="numeric" value={qty[r.id] ?? ""} onChange={e => setQty({ ...qty, [r.id]: e.target.value })} />
                  <Button size="sm" disabled={busy || !caps[r.id]?.reserve || !!pendingReserve} onClick={() => reserve(r)}>Reservar (piloto)</Button>
                </span>
              )}
              {r.status === "reservado" && <Button size="sm" disabled={busy || !caps[r.id]?.deliver || !!pendingGroup} onClick={() => createDelivery(r)}>Criar entrega (piloto)</Button>}
              {caps[r.id] && !caps[r.id].reserve && !caps[r.id].deliver && <span className="text-muted-foreground ml-2">{CLOSED_MSG}</span>}
              </td>
            </tr>))}</tbody></table>
        )}
      </CardContent>
    </Card>
  );
}
