import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info';
export interface ToastMessage { id:number; kind:ToastKind; message:string; }
@Injectable({ providedIn:'root' })
export class ToastService {
  readonly items=signal<ToastMessage[]>([]); private sequence=0; private timers=new Map<number,ReturnType<typeof setTimeout>>();
  show(message:string,kind:ToastKind='info'):void { const id=++this.sequence; this.items.update(items=>[...items,{id,kind,message}]); this.schedule(id); }
  dismiss(id:number):void { const timer=this.timers.get(id); if(timer) clearTimeout(timer); this.timers.delete(id); this.items.update(items=>items.filter(item=>item.id!==id)); }
  pause(id:number):void { const timer=this.timers.get(id); if(timer) clearTimeout(timer); this.timers.delete(id); }
  resume(id:number):void { if(!this.timers.has(id)) this.schedule(id); }
  private schedule(id:number):void { this.timers.set(id,setTimeout(()=>this.dismiss(id),5000)); }
}
