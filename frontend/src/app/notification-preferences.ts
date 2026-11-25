export const NOTIFICATION_SOUNDS = [
  { id: 'classic', label: 'Clásico' },
  { id: 'gentle', label: 'Suave' },
  { id: 'bell', label: 'Campanilla' },
  { id: 'double', label: 'Doble' },
  { id: 'chime', label: 'Campanilla doble' },
  { id: 'drop', label: 'Gota suave' },
  { id: 'marimba', label: 'Marimba cálida' },
  { id: 'pulse', label: 'Pulso corto' },
] as const;

export type NotificationSoundType = (typeof NOTIFICATION_SOUNDS)[number]['id'];

const SOUND_NOTES: Record<NotificationSoundType, Array<{ frequency: number; start: number; duration: number; waveform: OscillatorType }>> = {
  classic: [{ frequency: 660, start: 0, duration: 0.18, waveform: 'sine' }],
  gentle: [
    { frequency: 523, start: 0, duration: 0.15, waveform: 'sine' },
    { frequency: 659, start: 0.13, duration: 0.2, waveform: 'sine' },
  ],
  bell: [{ frequency: 880, start: 0, duration: 0.32, waveform: 'triangle' }],
  double: [
    { frequency: 784, start: 0, duration: 0.1, waveform: 'sine' },
    { frequency: 784, start: 0.17, duration: 0.1, waveform: 'sine' },
  ],
  chime: [
    { frequency: 740, start: 0, duration: 0.13, waveform: 'sine' },
    { frequency: 988, start: 0.12, duration: 0.2, waveform: 'sine' },
  ],
  drop: [
    { frequency: 740, start: 0, duration: 0.08, waveform: 'sine' },
    { frequency: 523, start: 0.07, duration: 0.18, waveform: 'sine' },
  ],
  marimba: [{ frequency: 587, start: 0, duration: 0.22, waveform: 'triangle' }],
  pulse: [
    { frequency: 494, start: 0, duration: 0.08, waveform: 'sine' },
    { frequency: 494, start: 0.12, duration: 0.08, waveform: 'sine' },
  ],
};

export function isNotificationSoundType(value: unknown): value is NotificationSoundType {
  return NOTIFICATION_SOUNDS.some((sound) => sound.id === value);
}

export function normalizeNotificationSoundType(value: unknown): NotificationSoundType {
  return isNotificationSoundType(value) ? value : 'classic';
}

export function playNotificationSound(type: NotificationSoundType | string): void {
  try {
    const context = new AudioContext();
    const notes = SOUND_NOTES[normalizeNotificationSoundType(type)];
    for (const note of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + note.start;
      const end = start + note.duration;
      oscillator.type = note.waveform;
      oscillator.frequency.setValueAtTime(note.frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.08, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(end + 0.01);
    }
    const duration = Math.max(...notes.map((note) => note.start + note.duration));
    window.setTimeout(() => void context.close(), (duration + 0.1) * 1000);
  } catch {
    // El sonido es opcional y no debe afectar la atención de conversaciones.
  }
}

export function formatNotificationTitle(unread: number): string {
  const count = Number.isFinite(unread) ? Math.max(0, Math.floor(unread)) : 0;
  return count > 0 ? `(${count}) Margarita` : 'Margarita';
}
