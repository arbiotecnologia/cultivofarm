import { formatDateTimeDisplay } from "@/lib/date-utils";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { StickyNote, Plus, Trash2 } from "lucide-react";

const NOTES_HEADER = "### Notas rápidas";

export interface QuickNote {
  ts: string;
  text: string;
}

/**
 * Notas rápidas são serializadas dentro de `observacoes_tecnicas` num bloco
 * "### Notas rápidas" para evitar mudança de schema. Esta função extrai as notas
 * e devolve o texto técnico "limpo" do bloco.
 */
export function parseNotes(observacoes: string | null | undefined): { notes: QuickNote[]; clean: string } {
  if (!observacoes) return { notes: [], clean: "" };
  const idx = observacoes.indexOf(NOTES_HEADER);
  if (idx < 0) return { notes: [], clean: observacoes };
  const before = observacoes.slice(0, idx).trimEnd();
  const block = observacoes.slice(idx + NOTES_HEADER.length).trim();
  const notes: QuickNote[] = [];
  for (const line of block.split("\n")) {
    const m = line.match(/^- \[(.+?)\]\s+(.+)$/);
    if (m) notes.push({ ts: m[1], text: m[2] });
  }
  return { notes, clean: before };
}

export function serializeNotes(clean: string, notes: QuickNote[]): string {
  const base = (clean || "").trimEnd();
  if (!notes.length) return base;
  const lines = notes.map((n) => `- [${n.ts}] ${n.text}`).join("\n");
  return `${base}\n\n${NOTES_HEADER}\n${lines}`.trim();
}

interface NotasRapidasProps {
  notes: QuickNote[];
  onChange: (notes: QuickNote[]) => void;
  disabled?: boolean;
}

export function NotasRapidas({ notes, onChange, disabled }: NotasRapidasProps) {
  const [text, setText] = useState("");

  const sorted = useMemo(
    () => [...notes].sort((a, b) => (a.ts < b.ts ? 1 : -1)),
    [notes]
  );

  const addNote = () => {
    const t = text.trim();
    if (!t) return;
    onChange([...notes, { ts: new Date().toISOString(), text: t }]);
    setText("");
  };

  const removeNote = (ts: string) => {
    onChange(notes.filter((n) => n.ts !== ts));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-primary" />
          Notas rápidas
          <Badge variant="outline" className="ml-auto text-[10px]">{notes.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ex: pressão mais forte no canto sul"
            rows={2}
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                addNote();
              }
            }}
          />
          <Button onClick={addNote} disabled={disabled || !text.trim()} size="icon" className="shrink-0 h-auto">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Sem notas ainda. Use Ctrl/Cmd + Enter para adicionar rápido.</p>
        ) : (
          <ul className="space-y-1.5 max-h-48 overflow-auto">
            {sorted.map((n) => (
              <li key={n.ts} className="flex items-start gap-2 text-xs rounded border bg-muted/40 px-2 py-1.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {formatDateTimeDisplay(n.ts)}
                  </p>
                  <p className="mt-0.5 break-words">{n.text}</p>
                </div>
                {!disabled && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0"
                    onClick={() => removeNote(n.ts)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
