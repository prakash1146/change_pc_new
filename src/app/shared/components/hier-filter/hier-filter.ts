import {
  Component, ElementRef, HostListener, computed, effect, input, output, signal, viewChild,
} from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';
import { HierGroup } from './hier-filter-catalog';

@Component({
  selector: 'wbct-hier-filter',
  imports: [TablerIconComponent],
  templateUrl: './hier-filter.html',
  styleUrl: './hier-filter.css',
})
export class HierFilter {
  /** Trigger placeholder (e.g. "Select Region/Country"). */
  readonly placeholder = input<string>('Select');
  /** Grouped options to display. */
  readonly groups = input<HierGroup[]>([]);
  /** Optional initial selection — leaf ids to pre-select on first render.
   *  Used when arriving from a country/region drawer with a pre-applied filter. */
  readonly initialSelected = input<string[]>([]);

  /** Emits the array of selected leaf ids whenever the selection changes. */
  readonly selectionChange = output<string[]>();

  readonly open = signal(false);
  readonly query = signal('');

  /** Leaf ids currently selected. */
  readonly selectedLeaves = signal<Set<string>>(new Set());

  /** Expanded group ids (collapsed by default). */
  readonly expanded = signal<Set<string>>(new Set());

  private readonly root = viewChild<ElementRef<HTMLElement>>('rootEl');
  private seeded = false;

  constructor() {
    // Seed selectedLeaves from `initialSelected` on first non-empty arrival,
    // then leave user interaction alone. Also auto-expand any group whose
    // children are pre-selected so the seeded state is visible at a glance.
    effect(() => {
      const initial = this.initialSelected();
      if (this.seeded || initial.length === 0) return;
      this.seeded = true;
      this.selectedLeaves.set(new Set(initial));
      const groupsToExpand = new Set<string>();
      for (const g of this.groups()) {
        if (g.children.some(c => initial.includes(c.id))) groupsToExpand.add(g.id);
      }
      this.expanded.set(groupsToExpand);
    });
  }

  // ---- Selection helpers ----
  /** All leaf ids in a group. */
  private leafIds(g: HierGroup): string[] {
    return g.children.map(c => c.id);
  }

  groupState(g: HierGroup): 'none' | 'some' | 'all' {
    const ids = this.leafIds(g);
    const sel = this.selectedLeaves();
    const count = ids.filter(id => sel.has(id)).length;
    if (count === 0) return 'none';
    if (count === ids.length) return 'all';
    return 'some';
  }

  isLeafSelected(leafId: string): boolean {
    return this.selectedLeaves().has(leafId);
  }

  toggleGroup(g: HierGroup) {
    const state = this.groupState(g);
    this.selectedLeaves.update(prev => {
      const next = new Set(prev);
      const ids = this.leafIds(g);
      if (state === 'all') ids.forEach(id => next.delete(id));
      else                 ids.forEach(id => next.add(id));
      return next;
    });
    this.emitSelection();
  }

  toggleLeaf(id: string) {
    this.selectedLeaves.update(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else              next.add(id);
      return next;
    });
    this.emitSelection();
  }

  private emitSelection() {
    this.selectionChange.emit(Array.from(this.selectedLeaves()));
  }

  toggleExpand(groupId: string, ev?: Event) {
    ev?.stopPropagation();
    this.expanded.update(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else                   next.add(groupId);
      return next;
    });
  }

  isExpanded(groupId: string): boolean {
    return this.expanded().has(groupId);
  }

  toggleOpen() { this.open.update(o => !o); }
  close()      { this.open.set(false); }

  clearAll() {
    this.selectedLeaves.set(new Set());
    this.emitSelection();
  }

  // ---- Filtered view for search ----
  readonly filteredGroups = computed<HierGroup[]>(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.groups();
    return this.groups()
      .map(g => {
        // Group matches → include all children.
        if (g.label.toLowerCase().includes(q)) return g;
        const kids = g.children.filter(c => c.label.toLowerCase().includes(q));
        return kids.length ? { ...g, children: kids } : null;
      })
      .filter((g): g is HierGroup => g !== null);
  });

  // ---- Display label ----
  /** Count of "selected entities" — a fully-selected group counts as 1,
   *  partials add 1 per selected country. Matches the user's mental model. */
  readonly selectedDisplay = computed<string>(() => {
    const sel = this.selectedLeaves();
    if (sel.size === 0) return this.placeholder();
    let groupsAll = 0;
    let loose = 0;
    let firstLabel = '';
    for (const g of this.groups()) {
      const state = this.groupState(g);
      if (state === 'all') {
        groupsAll++;
        if (!firstLabel) firstLabel = g.label;
      } else if (state === 'some') {
        for (const c of g.children) {
          if (sel.has(c.id)) {
            loose++;
            if (!firstLabel) firstLabel = c.label;
          }
        }
      }
    }
    const totalEntities = groupsAll + loose;
    if (totalEntities === 1) return firstLabel;
    return `${totalEntities} selected`;
  });

  // ---- Outside-click close ----
  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent) {
    if (!this.open()) return;
    const root = this.root()?.nativeElement;
    if (root && !root.contains(ev.target as Node)) {
      this.close();
    }
  }
}
