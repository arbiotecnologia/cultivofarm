import { describe,it,expect } from 'vitest';
import { cockpitReaderStatus } from '@/lib/cockpit/readerStatus';
describe('canonical reader parent status, never action authority',()=>{
 it('waiting child cannot imply programmed open OS',()=>expect(cockpitReaderStatus('aberta','programada')).toBe('aberta'));
 it('waiting child cannot imply programmed approved OS',()=>expect(cockpitReaderStatus('aprovada','programada')).toBe('aprovada'));
 it('keeps downstream canonical stage',()=>expect(cockpitReaderStatus('envase','estoque_reservado')).toBe('estoque_reservado'));
 it('does not invent status without parent or stage',()=>expect(cockpitReaderStatus(null,null)).toBeNull());
});