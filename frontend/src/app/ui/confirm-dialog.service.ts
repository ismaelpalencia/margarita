import { Injectable, signal } from '@angular/core';
export interface ConfirmRequest { title:string; message:string; confirmText?:string; danger?:boolean; }
@Injectable({providedIn:'root'})
export class ConfirmDialogService {
  readonly current=signal<(ConfirmRequest & {id:number})|null>(null); private resolveResult:((value:boolean)=>void)|null=null; private sequence=0; private previousFocus:HTMLElement|null=null;
  confirm(request:ConfirmRequest):Promise<boolean>{ if(this.resolveResult) this.resolveResult(false); this.previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null; return new Promise(resolve=>{this.resolveResult=resolve;this.current.set({...request,id:++this.sequence});}); }
  close(confirmed:boolean):void {const resolve=this.resolveResult;const focus=this.previousFocus;this.resolveResult=null;this.previousFocus=null;this.current.set(null);resolve?.(confirmed);setTimeout(()=>focus?.focus(),0);}
}
