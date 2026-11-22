import { Component } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Ruta desconocida: devuelve a cada rol a su propio resumen. Antes el
 * comodín mandaba siempre al dashboard de administrador y un agente
 * terminaba viendo una pantalla que no le corresponde.
 */
@Component({
  selector: 'app-not-found-page',
  standalone: true,
  template: ''
})
export class NotFoundPage {
  constructor(router: Router) {
    const path = window.location.pathname;

    if (path.startsWith('/panel/agent')) {
      void router.navigateByUrl('/panel/agent/dashboard', { replaceUrl: true });
      return;
    }

    if (path === '/panel') {
      /** Sin prefijo de rol hay que preguntar al servidor quién entró. */
      void fetch('/panel/shell', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { role?: string } | null) => {
          const target = data?.role === 'AGENT' ? '/panel/agent/dashboard' : '/panel/admin/dashboard';
          return router.navigateByUrl(target, { replaceUrl: true });
        })
        .catch(() => router.navigateByUrl('/panel/admin/dashboard', { replaceUrl: true }));
      return;
    }

    void router.navigateByUrl('/panel/admin/dashboard', { replaceUrl: true });
  }
}
