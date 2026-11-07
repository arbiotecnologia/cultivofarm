import { useEffect, useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFinishedProductPurchaseCapability } from "@/hooks/useFinishedProductPurchase";
import { FinishedProductPurchaseEntryForm } from "./FinishedProductPurchaseEntryForm";
import type { FinishedProductPurchaseAck } from "@/lib/estoque/finishedProductPurchase";

interface Props {
  open: boolean;
  biologicalEntry: ReactNode;
  onSuccess: (ack: FinishedProductPurchaseAck) => void;
}

/** A capability é somente compatibilidade; o wrapper reautoriza toda gravação. */
export function FinishedProductPurchaseEntrySection({ open, biologicalEntry, onSuccess }: Props) {
  const [entryMode, setEntryMode] = useState<"envase" | "revenda">("envase");
  const capability = useFinishedProductPurchaseCapability(open);
  const available = capability.data?.available === true;

  useEffect(() => {
    if (!open || !available) setEntryMode("envase");
  }, [open, available]);

  if (!available) return biologicalEntry;
  return (
    <Tabs value={entryMode} onValueChange={(value) => setEntryMode(value as "envase" | "revenda")}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="envase">Envase biológico</TabsTrigger>
        <TabsTrigger value="revenda">Compra para revenda</TabsTrigger>
      </TabsList>
      <TabsContent value="envase">{biologicalEntry}</TabsContent>
      <TabsContent value="revenda">
        <FinishedProductPurchaseEntryForm onSuccess={onSuccess} />
      </TabsContent>
    </Tabs>
  );
}
