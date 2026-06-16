import { Component,computed, HostListener, inject, signal } from '@angular/core';
import { DateRangeFilter } from '../../../shared/components/date-range-filter/date-range-filter';
import { FilterStateService, Segment } from '../../services/filter-state.service';

@Component({
  selector: 'wbct-content-header',
  imports: [DateRangeFilter],
  templateUrl: './content-header.html',
  styleUrl: './content-header.css',
})
export class ContentHeader {
  private readonly filters = inject(FilterStateService);
  readonly workspace = signal<Segment>('wb');
  readonly scrolled = signal(false);
  // private readonly auth = inject(AuthService);
  // readonly userName = computed(() => this.auth.displayName() || 'Guest');
  readonly userName = computed(() =>  'Guest');
  // readonly isAdmin = this.auth.isAdmin;

  /** Switch the workspace segment — updates the local toggle state and pushes
   *  it to the shared filter so every section refetches for that segment. */
  setSegment(segment: Segment) {
    this.workspace.set(segment);
    this.filters.setSegment(segment);
  }

  @HostListener('window:scroll')
  onScroll() { this.scrolled.set(window.scrollY > 2); }
}
