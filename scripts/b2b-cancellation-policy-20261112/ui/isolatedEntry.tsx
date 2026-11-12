import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@/components/ui/button";
import { OrderDetailCandidate } from "./OrderFinanceCandidate";
import "@/index.css";
function IsolatedEntry() {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const orderId = new URLSearchParams(location.search).get("order");
  if (!orderId) return null;
  return <main className="p-6 bg-background text-foreground min-h-screen">
    <h1 className="text-2xl font-semibold mb-4">Pedido B2B</h1>
    <Button onClick={() => setOpen(true)}>Detalhe do pedido</Button>
    {confirmed && <p role="status">Cancelamento confirmado</p>}
    <OrderDetailCandidate orderId={orderId} scopeKey="disposable-actor-30" open={open} onOpenChange={setOpen} onConfirmed={() => setConfirmed(true)} empresaNome="AR Bio — fixture local" />
  </main>;
}
const root = document.getElementById("root");
if (root) createRoot(root).render(<IsolatedEntry />);