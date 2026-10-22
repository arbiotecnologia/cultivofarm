export function ownOrderIndicators(rows: readonly { status: string }[]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  return {
    observed: rows.length,
    atLimit: rows.length === 100,
    byStatus: [...counts].map(([status, count]) => ({ status, count })),
  };
}