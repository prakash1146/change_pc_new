import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AppRole } from './auth.config';
import { AuthService } from './auth.service';

/**
 * Route guard factory — allow activation only if the signed-in user holds at
 * least one of the supplied app roles. Unauthorized users are redirected to
 * `/home` rather than blocked outright so the redirect-after-login flow stays
 * coherent.
 */
export function roleGuard(allowedRoles: (AppRole | string)[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (auth.hasAnyRole(...allowedRoles)) return true;
    return router.parseUrl('/home');
  };
}
