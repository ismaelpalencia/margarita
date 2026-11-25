import { Component, input, output } from '@angular/core';
import { IconComponent } from './icon.component';
@Component({ selector:'ui-empty-state', standalone:true, imports:[IconComponent], template:`<section class="ui-empty"><ui-icon [name]="icon()" [size]="28"/><h2>{{ title() }}</h2><p>{{ description() }}</p>@if(action()){<button class="ui-btn ui-btn-secondary" type="button" (click)="actionClick.emit()">{{ action() }}</button>}</section>`, styles:[`:host{display:block}.ui-empty h2{margin:10px 0 5px;font-size:18px}.ui-empty p{margin:0 0 14px;font-size:14px}`] })
export class EmptyStateComponent { readonly icon=input('inbox'); readonly title=input.required<string>(); readonly description=input.required<string>(); readonly action=input(''); readonly actionClick=output<void>(); }
