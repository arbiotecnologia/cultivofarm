import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
const mocks = vi.hoisted(() => ({ generate: vi.fn(), create: vi.fn(() => 'blob:local-preview'), revoke: vi.fn() }));
vi.mock('@/lib/pdfVisita', () => ({ generateVisitaPdf: mocks.generate }));
import { PdfPreviewDialog } from '@/components/visita/PdfPreviewDialog';
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: mocks.create, revokeObjectURL: mocks.revoke }));
  mocks.generate.mockResolvedValue({ output: () => new Blob(['%PDF-1.7 synthetic'], { type: 'application/pdf' }) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
for (const custom of [false, true]) {
  it(`generates one local PDF when opening ${custom ? 'a custom' : 'the default'} trigger and revokes on close`, async () => {
    render(<PdfPreviewDialog data={{} as Parameters<typeof PdfPreviewDialog>[0]['data']} trigger={custom ? <Button>PDF personalizado</Button> : undefined} />);
    fireEvent.click(screen.getByRole('button', { name: custom ? 'PDF personalizado' : 'Visualizar PDF' }));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTitle('PDF Preview')).toHaveAttribute('src', expect.stringContaining('blob:local-preview')));
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.revoke).toHaveBeenCalledWith('blob:local-preview');
  });
}