import { Component, input } from '@angular/core';
@Component({ selector:'ui-skeleton', standalone:true, template:`<div class="skeleton-wrap" [attr.aria-label]="label()" role="status"><span class="ui-skeleton" [style.width]="width()" [style.height]="height()"></span></div>`, styles:[`.skeleton-wrap{display:block}.ui-skeleton{display:block}`] })
export class SkeletonComponent { readonly width=input('100%'); readonly height=input('16px'); readonly label=input('Cargando contenido'); }
