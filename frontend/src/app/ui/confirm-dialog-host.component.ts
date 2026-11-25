import { Component, ElementRef, ViewChild, effect, inject } from '@angular/core';
import { ConfirmDialogService } from './confirm-dialog.service';
import { ConfirmDialogComponent } from './confirm-dialog.component';
@Component({selector:'ui-confirm-dialog-host',standalone:true,imports:[ConfirmDialogComponent],template:`@if(service.current();as request){<ui-confirm-dialog [open]="true" [title]="request.title" [message]="request.message" [danger]="request.danger||false" [confirmText]="request.confirmText||'Confirmar'" (confirm)="service.close(true)" (cancel)="service.close(false)"/>}`})
export class ConfirmDialogHostComponent {protected readonly service=inject(ConfirmDialogService);}
