import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ScrollNavService {
  // The section currently in view; sidebar uses this for active highlighting.
  readonly activeSection = signal<string>('dashboard');

  // Set by the sidebar when the user is on a detail route and asks to jump to a
  // section — Home reads it on mount, scrolls, then clears it.
  readonly pendingTarget = signal<string | null>(null);
}
