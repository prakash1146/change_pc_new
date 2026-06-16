import { Injectable, computed, signal } from '@angular/core';

/** Workspace segment for the top-bar toggle.
 *  'ops' → Operational Staff (a subset) */
export type Segment = 'wb' | 'ops';

/** Resolved global filter selection driven by the content-header controls
 *  (date range + segment toggle). Dates are ISO `YYYY-MM-DD`; either may be
 *  null when no explicit range is set (the backend then treats it as the full
 *  snapshot). */
export interface DashboardFilter {
  startDate: string | null;
  endDate: string | null;
  segment: Segment;
}

/**
 * Single source of truth for the dashboard-wide filters shown in the content
 *
 * The date-range filter and the segment toggle write here; `ApiService` reads
 * the current value (and reacts to changes) so every data request carries the
 * active filter as query params. Components don't need to know about the filter
 * at all — they keep their existing `api.getX().subscribe(...)`, which now
 * re-emits whenever the filter changes.
 */
@Injectable({ providedIn: 'root' })
export class FilterStateService {
 
  private readonly _filter = signal<DashboardFilter>(defaultFilter());

  /** Read-only view of the active filter. */
  readonly filter = this._filter.asReadonly();

  /** The filter as a plain query-param object for HTTP requests. Null dates are
   *  omitted so the backend falls back to the full-snapshot identity. */
  readonly queryParams = computed<Record<string, string>>(() => {
    const f = this._filter();
    const params: Record<string, string> = { segment: f.segment };
    if (f.startDate) params['start_date'] = f.startDate;
    if (f.endDate) params['end_date'] = f.endDate;
    return params;
  });

  /** Replace the date range (segment unchanged). Pass null/null to clear. */
  setDateRange(startDate: string | null, endDate: string | null): void {
    this._filter.update(f => ({ ...f, startDate, endDate }));
  }

  /** Switch the workspace segment (date range unchanged). */
  setSegment(segment: Segment): void {
    this._filter.update(f => ({ ...f, segment }));
  }
}

/** ISO `YYYY-MM-DD` for a date `monthsBack` months before today (today when 0). */
export function isoMonthsAgo(monthsBack: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  return toIso(d);
}

export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultFilter(): DashboardFilter {
  return { startDate: isoMonthsAgo(3), endDate: isoMonthsAgo(0), segment: 'wb' };
}
