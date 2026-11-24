export type UiFontSize = 'normal' | 'large' | 'xlarge';

const FONT_SIZE_KEY = 'margarita-ui-font-size';

export const UI_FONT_SIZES: Array<{ id: UiFontSize; label: string }> = [
  { id: 'normal', label: 'Normal' },
  { id: 'large', label: 'Grande' },
  { id: 'xlarge', label: 'Muy grande' }
];

export function readUiFontSize(): UiFontSize {
  try {
    const saved = localStorage.getItem(FONT_SIZE_KEY);
    if (saved === 'large' || saved === 'xlarge') return saved;
  } catch {
    /* Usa normal si localStorage no está disponible. */
  }
  return 'normal';
}

export function applyUiFontSize(size: UiFontSize): void {
  document.documentElement.dataset['fontSize'] = size;
}

export function saveUiFontSize(size: UiFontSize): void {
  applyUiFontSize(size);
  try {
    localStorage.setItem(FONT_SIZE_KEY, size);
  } catch {
    /* El cambio sigue aplicado durante esta sesión. */
  }
}
