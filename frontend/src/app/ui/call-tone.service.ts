import { Injectable, signal } from '@angular/core';

export type CallToneKind = 'incoming' | 'outgoing';

@Injectable({ providedIn: 'root' })
export class CallToneService {
  readonly muted = signal(false);
  private context: AudioContext | null = null;
  private intervalId: number | null = null;
  private kind: CallToneKind | null = null;

  unlock(): void {
    if (typeof window === 'undefined') return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
    } catch { /* El sonido es opcional; el aviso visual sigue disponible. */ }
  }

  start(kind: CallToneKind): void {
    this.stopTimer();
    this.kind = kind;
    if (this.muted()) return;
    this.unlock();
    this.playPattern(kind);
    this.intervalId = window.setInterval(() => this.playPattern(kind), kind === 'incoming' ? 2600 : 3200);
  }

  stop(): void {
    this.stopTimer();
    this.kind = null;
  }

  toggleMuted(): void {
    const muted = !this.muted();
    this.muted.set(muted);
    if (muted) this.stopTimer();
    else if (this.kind) this.start(this.kind);
  }

  private stopTimer(): void {
    if (this.intervalId !== null) window.clearInterval(this.intervalId);
    this.intervalId = null;
  }

  private playPattern(kind: CallToneKind): void {
    const context = this.context;
    if (!context || context.state !== 'running' || this.muted()) return;
    const startAt = context.currentTime + 0.02;
    const notes = kind === 'incoming'
      ? [{ frequency: 740, offset: 0, duration: 0.16 }, { frequency: 880, offset: 0.24, duration: 0.18 }]
      : [{ frequency: 440, offset: 0, duration: 0.42 }, { frequency: 480, offset: 0, duration: 0.42 }];

    for (const note of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const noteStart = startAt + note.offset;
      const noteEnd = noteStart + note.duration;
      oscillator.type = 'sine';
      oscillator.frequency.value = note.frequency;
      gain.gain.setValueAtTime(0, noteStart);
      gain.gain.linearRampToValueAtTime(0.055, noteStart + 0.025);
      gain.gain.setValueAtTime(0.055, noteEnd - 0.035);
      gain.gain.linearRampToValueAtTime(0, noteEnd);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd + 0.01);
    }
  }
}
