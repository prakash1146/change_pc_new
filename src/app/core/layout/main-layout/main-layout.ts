import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AiChatService } from '../../../shared/services/ai-chat.service';
import { Sidebar } from '../sidebar/sidebar';
import { AiPanel } from '../ai-panel/ai-panel';
import { ContentHeader } from '../content-header/content-header';

@Component({
  selector: 'wbct-main-layout',
  imports: [RouterOutlet, Sidebar, AiPanel, ContentHeader],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.css',
})
export class MainLayout {
  protected readonly title = signal('control-tower');

  /** Drives the .shell layout margins; passed down to the sidebar. */
  readonly expanded = signal(false);

  private readonly router = inject(Router);

  // Ask AI open-state lives in the shared service so any page can open it; the
  // shell only reads it to apply the .is-ai-open margin.
  private readonly chat = inject(AiChatService);
  readonly aiOpen = this.chat.isOpen;

  /** True on the one-page-scroll landing routes (/, /prompts, /assets, /users,
   *  /feedback, /performance). False on level-2 detail pages like
   *  /assets/collection/:slug, /assets/agent/:slug, /prompts/analysis. */
  readonly isLandingPage = signal(this.computeIsLanding(this.router.url));

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.isLandingPage.set(this.computeIsLanding(e.urlAfterRedirects)));
  }

  private computeIsLanding(url: string): boolean {
    return url === '/' || /^\/(assets|prompts|users|feedback|performance)(\?|$)/.test(url);
  }

  toggleSidebar() {
    this.expanded.update((v) => !v);
  }
}
