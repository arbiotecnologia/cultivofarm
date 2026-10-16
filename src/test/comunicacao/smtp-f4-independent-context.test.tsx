import {act,render,screen,waitFor} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import TenantSenderVerification from '@/pages/configuracoes/TenantSenderVerification';
import type {F4Result} from '@/lib/configuracoes/tenantSmtp';

describe('independent F4 context fencing',()=>{
 it('does not show verification from a replaced transport context',async()=>{
  let resolveOld!:(value:F4Result)=>void;
  const old=vi.fn(()=>new Promise<F4Result>(resolve=>{resolveOld=resolve;}));
  const current=vi.fn(async():Promise<F4Result>=>({code:'F4_STATUS',status:{version:2,sender_verified:false,active:false,dispatch_enabled:false,challenge:null}}));
  const view=render(<TenantSenderVerification version={1} connectionReady blocked={false} send={old}/>);
  view.rerender(<TenantSenderVerification version={2} connectionReady blocked={false} send={current}/>);
  await act(async()=>resolveOld({code:'F4_STATUS',status:{version:1,sender_verified:true,active:false,dispatch_enabled:false,challenge:null}}));
  expect(screen.queryByText('Remetente verificado')).toBeNull();
  await waitFor(()=>expect(current).toHaveBeenCalled());
 });
});
