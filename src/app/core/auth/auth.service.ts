import { Injectable, computed, inject, signal } from '@angular/core';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import {
  AccountInfo,
  AuthenticationResult,
  EventMessage,
  EventType,
  InteractionStatus,
  RedirectRequest,
} from '@azure/msal-browser';
import { filter } from 'rxjs/operators';
import { AUTH_CONFIG, AppRole } from './auth.config';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly msal = inject(MsalService);
  private readonly broadcast = inject(MsalBroadcastService);

  private readonly _account = signal<AccountInfo | null>(null);
  private readonly _ready = signal(false);

  readonly account = this._account.asReadonly();
  readonly ready = this._ready.asReadonly();
  readonly isAuthenticated = computed(() => this._account() !== null);
  readonly displayName = computed(() => this._account()?.name ?? this._account()?.username ?? '');
  readonly initials = computed(() => {
    const name = this.displayName();
    if (!name) return '';
    return name
      .split(/[\s.@]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('');
  });

  // App roles, drawn from the ID token's `roles` claim. Falls back to a
  // localStorage override (`wbct:devRole`) when claims are absent — useful for
  // local dev where Azure AD App Roles haven't been configured. Anonymous
  // (signed-out) users get no roles.
  readonly roles = computed<string[]>(() => {
    const account = this._account();
    if (!account) return [];
    const claims = account.idTokenClaims as Record<string, unknown> | undefined;
    const claimRoles = Array.isArray(claims?.['roles']) ? (claims['roles'] as string[]) : [];
    if (claimRoles.length > 0) return claimRoles;
    try {
      const dev = localStorage.getItem('wbct:devRole');
      if (dev) return dev.split(',').map(r => r.trim()).filter(Boolean);
    } catch {
      // localStorage can throw in privacy mode / sandboxed iframes — fall through.
    }
    return [AUTH_CONFIG.roles.USER];
  });

  readonly isAdmin = computed(() => this.roles().includes(AUTH_CONFIG.roles.ADMIN));

  hasRole(role: AppRole | string): boolean {
    return this.roles().includes(role);
  }

  hasAnyRole(...roles: (AppRole | string)[]): boolean {
    const mine = this.roles();
    return roles.some(r => mine.includes(r));
  }

  init(): void {
    this.broadcast.msalSubject$
      .pipe(filter((m: EventMessage) => m.eventType === EventType.LOGIN_SUCCESS || m.eventType === EventType.ACQUIRE_TOKEN_SUCCESS))
      .subscribe((m: EventMessage) => {
        const payload = m.payload as AuthenticationResult | null;
        if (payload?.account) {
          this.msal.instance.setActiveAccount(payload.account);
        }
        this.refreshAccount();
      });

    this.broadcast.inProgress$
      .pipe(filter((status: InteractionStatus) => status === InteractionStatus.None))
      .subscribe(() => {
        this.refreshAccount();
        this._ready.set(true);
      });
  }

  login(): void {
    const request: RedirectRequest = { scopes: AUTH_CONFIG.apiScopes };
    this.msal.loginRedirect(request);
  }

  logout(): void {
    this.msal.logoutRedirect({ postLogoutRedirectUri: AUTH_CONFIG.postLogoutRedirectUri });
  }

  private refreshAccount(): void {
    const active = this.msal.instance.getActiveAccount();
    if (active) {
      this._account.set(active);
      return;
    }
    const accounts = this.msal.instance.getAllAccounts();
    if (accounts.length > 0) {
      this.msal.instance.setActiveAccount(accounts[0]);
      this._account.set(accounts[0]);
    } else {
      this._account.set(null);
    }
  }
}
