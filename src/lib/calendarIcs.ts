
/**
 * Helper para gerar arquivos .ics (iCalendar) para agendamentos.
 */

export interface IcsEvent {
  title: string;
  description: string;
  location?: string;
  start: Date;
  durationMinutes: number;
  alarmDaysBefore?: number;
}

export function generateIcs(event: IcsEvent): string {
  const formatDate = (date: Date) => {
    return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  };

  const end = new Date(event.start.getTime() + event.durationMinutes * 60000);
  
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cultivo Farm//Cultivo Farm//PT",
    "BEGIN:VEVENT",
    `DTSTAMP:${formatDate(new Date())}`,
    `DTSTART:${formatDate(event.start)}`,
    `DTEND:${formatDate(end)}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${event.description.replace(/\n/g, "\\n")}`,
    event.location ? `LOCATION:${event.location}` : null,
    "STATUS:CONFIRMED",
    event.alarmDaysBefore ? [
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:Lembrete: ${event.title}`,
      `TRIGGER:-P${event.alarmDaysBefore}D`,
      "END:VALARM"
    ].join("\n") : null,
    "END:VEVENT",
    "END:VCALENDAR"
  ].filter(Boolean);

  return lines.join("\n");
}

export function downloadIcs(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = window.URL.createObjectURL(blob);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
