import { Component, computed, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ScrollNavService } from '../../../shared/services/scroll-nav.service';
// import {  AppRole } from '../../auth/auth.config';
// import { AuthService } from '../../auth/auth.service';

interface NavLink {
  label: string;
  /** Tabler icon name — used for footer links (Help) and the sidebar toggle. */
  icon?: string;
  /** Path to a custom SVG (under public/), used for main section nav. */
  svg?: string;
  sectionId?: string;
  roles?: ( string)[];
}

@Component({
  selector: 'wbct-sidebar',
  imports: [TablerIconComponent],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  /** Driven by the parent shell so the layout margins and labels stay in sync. */
  readonly expanded = input(false);
  /** Emitted when the collapse/expand toggle is clicked. */
  readonly toggleExpanded = output<void>();
  // private readonly auth = inject(AuthService);
  // readonly isAuthenticated = this.auth.isAuthenticated;
  // readonly userName = computed(() => this.auth.displayName() || 'Guest');
  // readonly userInitials = computed(() => this.auth.initials() || 'G');

  readonly isAuthenticated = signal(true);
  readonly userName = computed(() =>   'Guest');
  readonly userInitials = computed(() =>   'G');

  readonly allNav: NavLink[] = [
   { label: 'Usage',       svg: 'assets/icons/prompts.svg',     sectionId: 'dashboard' },
    { label: 'Collections', svg: 'assets/icons/usage.svg',       sectionId: 'collections' },
    { label: 'Tasks',       svg: 'assets/icons/tasks.svg',       sectionId: 'agents' },
    { label: 'Performance', svg: 'assets/icons/performance.svg', sectionId: 'performance' },
  ];

    /** Nav links filtered against the current user's roles. Reactive — re-runs
   *  when `AuthService.roles` changes (e.g. token refresh, dev-mode override). */
  readonly nav = computed<NavLink[]>(() =>
    // this.allNav.filter(item => !item.roles || this.auth.hasAnyRole(...item.roles))
   this.allNav.filter(item => !item.roles )
  );

  readonly footerLinks: NavLink[] = [
    { label: 'Help', icon: 'help-circle' },
  ];

  private readonly router = inject(Router);
  private readonly scrollNav = inject(ScrollNavService);
  readonly activeSection = this.scrollNav.activeSection;

  toggle() {
    this.toggleExpanded.emit();
  }

  goToSection(id: string) {
    // Detail pages (e.g. /assets/collection/foo) aren't part of the one-page
    // scroll. From there, route back to Home and remember which section to
    // land on; otherwise smooth-scroll in place.
    const onHome = this.router.url === '/' || /^\/(assets|prompts|users|feedback)(\?|$)/.test(this.router.url);
    if (!onHome) {
      this.scrollNav.pendingTarget.set(id);
      this.router.navigateByUrl('/');
      return;
    }
    const el = document.getElementById(`section-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.scrollNav.activeSection.set(id);
  }
}
