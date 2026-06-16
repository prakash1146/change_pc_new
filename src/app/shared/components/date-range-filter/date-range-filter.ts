import {
  Component, ElementRef, HostListener, computed, signal, viewChild,
} from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';

type Preset = 'last-month' | 'last-2-months' | 'last-3-months' | 'custom';

interface PresetOption {
  id: Preset;
  label: string;
  /** ISO month range (current date is 2026-05-23) — computed lazily. */
  rangeLabel: string;
}

@Component({
  selector: 'wbct-date-range-filter',
  imports: [TablerIconComponent],
  templateUrl: './date-range-filter.html',
  styleUrl: './date-range-filter.css',
})
export class DateRangeFilter {
  readonly open = signal(false);
  readonly selected = signal<Preset>('last-3-months');
  readonly customStart = signal<string>('');
  readonly customEnd = signal<string>('');

  private readonly root = viewChild<ElementRef<HTMLElement>>('rootEl');

  readonly presets: PresetOption[] = [
    { id: 'last-month',    label: 'Last month',    rangeLabel: this.computeRangeLabel(1) },
    { id: 'last-2-months', label: 'Last 2 months', rangeLabel: this.computeRangeLabel(2) },
    { id: 'last-3-months', label: 'Last 3 months', rangeLabel: this.computeRangeLabel(3) },
  ];

  readonly triggerLabel = computed<string>(() => {
    const s = this.selected();
    if (s === 'custom') {
      const a = this.customStart();
      const b = this.customEnd();
      if (a && b) return `${a} – ${b}`;
      return 'Custom date range';
    }
    return this.presets.find(p => p.id === s)?.label ?? 'Date range';
  });

  private computeRangeLabel(months: number): string {
    const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
    const today = new Date();
    const start = new Date(today);
    start.setMonth(start.getMonth() - months);
    return `${fmt.format(start)} – ${fmt.format(today)}`;
  }

  toggleOpen() { this.open.update(o => !o); }
  close()      { this.open.set(false); }

  pickPreset(id: Preset) {
    this.selected.set(id);
    if (id !== 'custom') this.close();
  }

  applyCustom() {
    if (this.customStart() && this.customEnd()) {
      this.selected.set('custom');
      this.close();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent) {
    if (!this.open()) return;
    const root = this.root()?.nativeElement;
    if (root && !root.contains(ev.target as Node)) {
      this.close();
    }
  }
}
