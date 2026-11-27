let savedScrollY: number | null = null;
let savedBodyStyles: Partial<CSSStyleDeclaration> | null = null;

/** Bloquea el scroll del documento sin cambiar la posición de la bandeja. */
export function lockPreviewScroll(): void {
  if (savedScrollY !== null) return;

  const body = document.body;
  savedScrollY = window.scrollY;
  savedBodyStyles = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    paddingRight: body.style.paddingRight
  };

  body.style.position = 'fixed';
  body.style.top = `-${savedScrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  if (scrollbarWidth > 0) {
    const existingPadding = Number.parseFloat(getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${existingPadding + scrollbarWidth}px`;
  }
}

/** Restaura el scroll donde estaba antes de abrir la vista previa. */
export function unlockPreviewScroll(): void {
  if (savedScrollY === null || !savedBodyStyles) return;

  const scrollY = savedScrollY;
  const body = document.body;
  body.style.position = savedBodyStyles.position || '';
  body.style.top = savedBodyStyles.top || '';
  body.style.left = savedBodyStyles.left || '';
  body.style.right = savedBodyStyles.right || '';
  body.style.width = savedBodyStyles.width || '';
  body.style.paddingRight = savedBodyStyles.paddingRight || '';
  savedScrollY = null;
  savedBodyStyles = null;
  window.scrollTo(0, scrollY);
}
