import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { brl } from "@/lib/financial/format";
import { splitVolumeLabel } from "@/lib/envaseFormat";

import {
  CatalogoVolume,
  formatVolumeLabel,
} from "@/hooks/useCatalogoVolumes";

interface Props {
  volumes: CatalogoVolume[];
  onAdd?: () => void;
  max?: number;
}

const GRID_VOLUMES = "grid grid-cols-[auto_auto_1fr] items-baseline gap-x-1 gap-y-0.5 text-[11px] font-mono-data";

function CelulasVolume({ v }: { v: CatalogoVolume }) {
  const solid = (v as unknown as { medida?: string }).medida === "embalagem";
  const { numero, unidade } = solid ? { numero: v.rotulo ?? "Embalagem", unidade: "" } : splitVolumeLabel(formatVolumeLabel(v));
  return (
    <>
      <span className="text-right tabular-nums whitespace-nowrap text-foreground/80">{numero}</span>
      <span className="text-left whitespace-nowrap text-muted-foreground">{unidade ?? ""}</span>
      <span className="text-right tabular-nums whitespace-nowrap pl-3 text-foreground/80">{solid ? "" : brl(v.preco_brl)}</span>
    </>
  );
}




export function VolumesChips({ volumes, onAdd, max = 2 }: Props) {
  if (!volumes.length) {
    return onAdd ? (
      <Button variant="ghost" size="sm"
        type="button"
        onClick={(e) => { e.stopPropagation(); onAdd(); }}
        className="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center gap-1"
      >
        <Plus className="h-3 w-3" /> adicionar
      </Button>
    ) : (
      <span className="text-[11px] text-muted-foreground">—</span>
    );
  }

  const visible = volumes.slice(0, max);
  const extras = volumes.slice(max);

  return (
    <div className="flex flex-col gap-0.5 leading-tight w-full max-w-[210px]">
      <div className={GRID_VOLUMES}>
        {visible.map((v) => (
          <CelulasVolume key={v.id} v={v} />
        ))}
      </div>
      {extras.length > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[10px] text-muted-foreground underline decoration-dotted cursor-help w-fit">
                +{extras.length} {extras.length === 1 ? "volume" : "volumes"}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <div className={`${GRID_VOLUMES} min-w-[140px]`}>
                {extras.map((v) => (
                  <CelulasVolume key={v.id} v={v} />
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>

  );
}
