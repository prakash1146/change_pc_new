import { AfterViewInit, Component, ElementRef, OnDestroy, inject, viewChildren } from '@angular/core';
import { Dashboard } from '../../../features/dashboard/dashboard';
import { Assets } from '../../../features/assets/assets';
import { Prompts } from '../../../features/prompts/prompts';
import { Performance } from '../../../features/performance/performance';
import { Users } from '../../../features/users/users';
import { ScrollNavService } from '../../../shared/services/scroll-nav.service';


@Component({
  selector: 'wbct-home',
  imports: [Dashboard, Assets, Prompts, Users, Performance],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements AfterViewInit, OnDestroy {
  private readonly nav = inject(ScrollNavService);
  private readonly sections = viewChildren<ElementRef<HTMLElement>>('section');
  private observer?: IntersectionObserver;

  ngAfterViewInit(): void {
    // Only auto-scroll when the sidebar explicitly asked us to land on a section
    // (set via ScrollNavService.pendingTarget before navigating back to Home).
    //
    // A plain page reload — even on an alias route like /assets — must NOT
    // auto-scroll. Doing so honours the target section's scroll-margin-top
    // (112px, to clear the sticky topbar) and pushes the page DOWN into empty
    // space, which is the unwanted auto-scroll users were seeing on reload.
    const pending = this.nav.pendingTarget();
    this.nav.pendingTarget.set(null);

    // Defer to allow child components' content to mount before measuring.
    requestAnimationFrame(() => {
      if (pending) this.scrollTo(pending, 'auto');
      this.observeSections();
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private scrollTo(id: string, behavior: ScrollBehavior) {
    const el = document.getElementById(`section-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior, block: 'start' });
  }

  private observeSections() {
    const els = this.sections().map((r) => r.nativeElement);
    if (!els.length) return;
    this.observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry closest to the top of the viewport that is at least partially visible.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) {
          const id = (visible.target as HTMLElement).dataset['sectionId'];
          if (id) this.nav.activeSection.set(id);
        }
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 },
    );
    els.forEach((el) => this.observer!.observe(el));
  }
}
