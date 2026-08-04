import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { brl } from "@/lib/financial/format";
import {
  CatalogoVolume,
  formatVolumeLabel,
} from "@/hooks/useCatalogoVolumes";

interface Props {
  volumes: CatalogoVolume[];
  onAdd?: () => void;
  max?: number;
}

function LinhaVolume({ v, muted }: { v: CatalogoVolume; muted?: boolean }) {
  return (
    <div className={`grid grid-cols-[auto_1fr] gap-x-2 text-[11px] font-mono-data ${muted ? "text-muted-foreground" : "text-foreground/80"}`}>
      <span className="whitespace-nowrap">{formatVolumeLabel(v)}</span>
      <span className="text-right tabular-nums whitespace-nowrap">{brl(v.preco_brl)}</span>
    </div>
  );
}


export function VolumesChips({ volumes, onAdd, max = 2 }: Props) {
  if (!volumes.length) {
    return onAdd ? (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onAdd(); }}
        className="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center gap-1"
      >
        <Plus className="h-3 w-3" /> adicionar
      </button>
    ) : (
      <span className="text-[11px] text-muted-foreground">—</span>
    );
  }

  const visible = volumes.slice(0, max);
  const extras = volumes.slice(max);

  return (
    <div className="flex flex-col gap-0.5 leading-tight max-w-[210px]">
      {visible.map((v) => (
        <span key={v.id} className="text-[11px] font-mono-data text-foreground/80">
          {linha(v)}
        </span>
      ))}
      {extras.length > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[10px] text-muted-foreground underline decoration-dotted cursor-help w-fit">
                +{extras.length} {extras.length === 1 ? "volume" : "volumes"}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <div className="space-y-0.5">
                {extras.map((v) => (
                  <div key={v.id} className="text-[11px] font-mono-data">{linha(v)}</div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
