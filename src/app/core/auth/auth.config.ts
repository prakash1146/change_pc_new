import {
  BrowserCacheLocation,
  IPublicClientApplication,
  InteractionType,
  LogLevel,
  PublicClientApplication,
} from '@azure/msal-browser';
import {
  MsalGuardConfiguration,
  MsalInterceptorConfiguration,
} from '@azure/msal-angular';

/**
 * Entra ID (Azure AD) tenant + app registration values.
 * Override per environment by editing this file, or wire to an env loader later.
 */
export const AUTH_CONFIG = {
  clientId: 'acd3cd9f-1495-4bd7-bfa7-294f5b4194af',
  tenantId: '9495d6bb-41c2-4c58-848f-92e52cf3d640',
  redirectUri: typeof window !== 'undefined' ? window.location.origin : '/',
  postLogoutRedirectUri: typeof window !== 'undefined' ? window.location.origin : '/',
  apiScopes: ['User.Read'] as string[],
  protectedApiBase: '/api',
  // App-role identifiers — must match the "value" field of App Roles configured
  // on the Azure AD app registration. The ID token's `roles` claim ships these
  // automatically once a user is assigned (no extra scope required).
  // For local dev without App Roles configured, override via:
  //   localStorage.setItem('wbct:devRole', 'Admin')   // or 'User'
  roles: {
    ADMIN: 'Admin',
    USER:  'User',
  },
} as const;

export type AppRole = (typeof AUTH_CONFIG.roles)[keyof typeof AUTH_CONFIG.roles];

const isIE =
  typeof navigator !== 'undefined' &&
  (navigator.userAgent.indexOf('MSIE ') > -1 || navigator.userAgent.indexOf('Trident/') > -1);

// Single shared instance. msal-browser v3+ requires the application to be
// explicitly initialize()-d (and the redirect promise handled) BEFORE MsalGuard
// runs — otherwise the guard fails with "unable to activate". We create the
// instance once here so the app initializer (see app.config.ts) can await its
// initialization before the router/guard activates.
let _instance: IPublicClientApplication | null = null;

export function msalInstanceFactory(): IPublicClientApplication {
  if (_instance) return _instance;
  _instance = new PublicClientApplication({
    auth: {
      clientId: AUTH_CONFIG.clientId,
      authority: `https://login.microsoftonline.com/${AUTH_CONFIG.tenantId}`,
      redirectUri: AUTH_CONFIG.redirectUri,
      postLogoutRedirectUri: AUTH_CONFIG.postLogoutRedirectUri,
      navigateToLoginRequestUrl: true,
    },
    cache: {
      cacheLocation: BrowserCacheLocation.LocalStorage,
      storeAuthStateInCookie: isIE,
    },
    system: {
      loggerOptions: {
        loggerCallback: (level, message) => {
          if (level === LogLevel.Error) {
            console.error('[MSAL]', message);
          }
        },
        logLevel: LogLevel.Warning,
        piiLoggingEnabled: false,
      },
    },
  });
  return _instance;
}

export function msalGuardConfigFactory(): MsalGuardConfiguration {
  return {
    interactionType: InteractionType.Redirect,
    authRequest: { scopes: AUTH_CONFIG.apiScopes },
  };
}

export function msalInterceptorConfigFactory(): MsalInterceptorConfiguration {
  const protectedResourceMap = new Map<string, string[] | null>([
    [AUTH_CONFIG.protectedApiBase, AUTH_CONFIG.apiScopes],
    ['https://graph.microsoft.com/v1.0/me', ['User.Read']],
  ]);
  return {
    interactionType: InteractionType.Redirect,
    protectedResourceMap,
  };
}
