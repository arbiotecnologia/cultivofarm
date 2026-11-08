import { useEffect, useRef, useState } from 'react';
import { ClipboardPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { createOsRequest, type Ack, type Fence, type OrderIntent, type Rpc } from './osRequest';

// Review only: not imported by App/routes. Mount only after audited isolated
// client binding and server capability. The capability never grants authority.
export function ResaleOsAction({ intent, fence, available, onConfirmed }: {
  intent: OrderIntent; fence: Fence; available: boolean; onConfirmed: (ack: Ack) => void;
}) {
  const live = useRef(fence); live.current = fence;
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const submit = useRef(createOsRequest(async (name, args) => {
    const { data, error } = await supabase.rpc(name as never, args as never);
    return { data, error };
  }, () => live.current));
  return <div>
    <Button disabled={!available || !fence.ready || pending} onClick={async () => {
      if (!available || !live.current.ready) return;
      setPending(true); setMessage('');
      try { const ack = await submit.current(intent); if (mounted.current) onConfirmed(ack); }
      catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : 'Resultado não confirmado.'); }
      finally { if (mounted.current) setPending(false); }
    }}><ClipboardPlus className="mr-2 h-4 w-4" />Preparar OS de revenda</Button>
    {message && <p role="alert" className="text-sm text-muted-foreground">{message}</p>}
  </div>;
}