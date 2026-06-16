import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ApiService } from '../../../core/services/api.service';
import { toSlug } from '../../../shared/utilities/slug';

type KptTab = 'knowledge' | 'people' | 'tasks';
type Workspace = 'wb' | 'ifc';
type SortDir = 'asc' | 'desc';
type CollectionSortKey = 'collection' | 'contribution';

interface KpiMetric { value: string; label?: string; delta?: string; }
interface AgentKpi {
  title: string;
  metrics: KpiMetric[];
  sub?: string;
  feedback?: { positive: number; negative: number };
}
interface SupportingCollection { name: string; contribution: number; }
interface PromptCategory { label: string; pct: number; prompts: number; }

interface AgentRecord {
  name: string;
  category: string;
  tagline: string;
  defaultTab: KptTab;
  kpis: AgentKpi[];
  collectionsByTab: Record<KptTab, SupportingCollection[]>;
  categoriesByTab: Record<KptTab, PromptCategory[]>;
}

interface AgentDetailData {
  agents: Record<string, AgentRecord>;
  tabDefs: { id: string; label: string }[];
}

// Map all known incoming slugs to the canonical data record. Multiple slug
// variants (short codes from the Assets canvas + the kebab-case slug of the
// agent's display name) all resolve to the same agent record.
const SLUG_TO_AGENT: Record<string, string> = {
  // Sherlock variants
  'sherlock':                       'sherlock',
  'sherlock-expertise-detective':   'sherlock',
  'sher':                           'sherlock',
  // TOR Genie variants
  'tor-genie': 'tor-genie',
  'tor':       'tor-genie',
  // Lessons Explorer variants
  'lessons-explorer': 'lessons-explorer',
  'less':             'lessons-explorer',
  // WBG Translate variants
  'wbg-translate-tool': 'wbg-translate-tool',
  'translate':          'wbg-translate-tool',
  'wbg':                'wbg-translate-tool',
};

@Component({
  selector: 'wbct-agent-detail',
  imports: [TablerIconComponent, RouterLink],
  templateUrl: './agent-detail.html',
  styleUrl: './agent-detail.css',
})
export class AgentDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);

  /** Agent map, keyed by canonical id — populated from the API. */
  private readonly agents = signal<Record<string, AgentRecord>>({});

  readonly slug = signal<string>(this.route.snapshot.paramMap.get('slug') ?? 'sherlock');

  /** Resolve to the canonical agent record — falls back to Sherlock. */
  readonly agent = computed<AgentRecord | null>(() => {
    const map = this.agents();
    const key = SLUG_TO_AGENT[this.slug()] ?? 'sherlock';
    return map[key] ?? map['sherlock'] ?? null;
  });

  readonly name = computed(() => this.agent()?.name ?? '');
  readonly tagline = computed(() => this.agent()?.tagline ?? '');
  readonly category = computed(() => this.agent()?.category ?? '');

  readonly kpis = computed(() => this.agent()?.kpis ?? []);
  readonly collectionsByTab = computed(
    () => this.agent()?.collectionsByTab ?? { knowledge: [], people: [], tasks: [] },
  );
  readonly categoriesByTab = computed(
    () => this.agent()?.categoriesByTab ?? { knowledge: [], people: [], tasks: [] },
  );

  readonly workspace = signal<Workspace>('wb');
  setWorkspace(w: Workspace) { this.workspace.set(w); }

  /** Generate a URL slug for collection detail links. */
  slugFor(name: string): string { return toSlug(name); }

  // ----- Tabs -----
  readonly activeTab = signal<KptTab>('people');
  readonly tabDefs = signal<{ id: string; label: string }[]>([]);

  constructor() {
    this.api.getAgentDetail<AgentDetailData>().pipe(takeUntilDestroyed()).subscribe(d => {
      this.agents.set(d.agents);
      this.tabDefs.set(d.tabDefs);
      // Default to the agent's natural tab (e.g. TOR Genie → Tasks).
      const a = this.agent();
      if (a) this.activeTab.set(a.defaultTab);
    });
  }

  readonly activeCategories  = computed(() => this.categoriesByTab()[this.activeTab()]);
  readonly activeCollections = computed(() => this.collectionsByTab()[this.activeTab()]);

  // ----- Collections table sort -----
  readonly colSortKey = signal<CollectionSortKey>('contribution');
  readonly colSortDir = signal<SortDir>('desc');
  readonly sortedCollections = computed(() => {
    const key = this.colSortKey();
    const mul = this.colSortDir() === 'asc' ? 1 : -1;
    return [...this.activeCollections()].sort((a, b) => {
      if (key === 'collection') return a.name.localeCompare(b.name) * mul;
      return (a.contribution - b.contribution) * mul;
    });
  });
  toggleColSort(key: CollectionSortKey) {
    if (this.colSortKey() === key) {
      this.colSortDir.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.colSortKey.set(key);
      this.colSortDir.set(key === 'collection' ? 'asc' : 'desc');
    }
  }

  collectionsTitle = computed(() => {
    switch (this.activeTab()) {
      case 'knowledge': return 'Collections Supporting Knowledge';
      case 'people':    return 'Collections Supporting People';
      case 'tasks':     return 'Collections Supporting Tasks';
    }
  });
}
