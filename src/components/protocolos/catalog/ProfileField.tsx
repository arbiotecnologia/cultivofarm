import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  readOnly?: boolean;
}

export function ProfileField({ label, value, onChange, rows = 3, readOnly = false }: Props) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label className="text-xs">{label}</Label>
      <Textarea
        className="w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        readOnly={readOnly}
      />
    </div>
  );
}
