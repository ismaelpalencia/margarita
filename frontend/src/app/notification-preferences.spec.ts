import { describe, expect, it } from 'vitest';
import { formatNotificationTitle, isNotificationSoundType, NOTIFICATION_SOUNDS } from './notification-preferences';

describe('preferencias de notificación', () => {
  it('muestra el total de mensajes sin leer en el título de la pestaña', () => {
    expect(formatNotificationTitle(1)).toBe('(1) Margarita');
    expect(formatNotificationTitle(17)).toBe('(17) Margarita');
    expect(formatNotificationTitle(0)).toBe('Margarita');
  });

  it('ofrece sonidos conocidos y acepta el tono anterior como predeterminado', () => {
    expect(NOTIFICATION_SOUNDS.map(({ id }) => id)).toEqual(['classic', 'gentle', 'bell', 'double']);
    expect(isNotificationSoundType('classic')).toBe(true);
    expect(isNotificationSoundType('unknown')).toBe(false);
  });
});
