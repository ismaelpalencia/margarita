import { Injectable } from '@angular/core';
@Injectable({ providedIn:'root' })
export class CallFeatureService {
  readonly enabled = false;
  async startCall(conversationId:string):Promise<void> { void conversationId; }
}
