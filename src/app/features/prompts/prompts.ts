import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import {
  REGION_GROUPS, VPU_GROUPS, regionCountrySelectionFromParams,
} from '../../shared/components/hier-filter/hier-filter-catalog';
import { ApiService } from '../../core/services/api.service';

type KptTab = 'knowledge' | 'people' | 'tasks';
type TmMode = 'volume' | 'repeat';
type Workspace = 'wb' | 'ifc';
type FrictionDomain = 'knowledge' | 'people' | 'task';
type FrictionDirection = 'up' | 'down';

/** What kind of friction this signal represents — drives the headline metric + tone. */
type FrictionKind =
  | 'dislike'         // High share of dislikes on the answer
  | 'clarify'         // Users re-asking with corrected intent
  | 'low-expert'      // People search returning few / dropping expert visits
  | 'low-download'    // Task output not being saved / downloaded
  | 'outdated';       // Sources cited are outdated / superseded

interface KpiMetric { value: string; label?: string; delta?: string; }
interface PageKpi   { title: string; metrics: KpiMetric[]; sub?: string; }

interface TreemapTopic {
  id: string;
  name: string;
  pct: number;
  count: number;
  color: string;
  trending?: boolean;
  prompts?: string[];
}

interface FrictionSignal {
  domain: FrictionDomain;
  topic: string;
  /** Topic id used to navigate to the category detail page. */
  topicId: string;
  kind: FrictionKind;
  /** Headline friction metric value (e.g. 75, 32, 18). */
  metricValue: number;
  /** Unit / suffix appended to the value (e.g. "%", "" for raw counts). */
  metricUnit: string;
  /** Plain-language description of what the metric measures. */
  metricCaption: string;
  /** Volume context: count of prompts/searches/generations behind the signal. */
  volume: number;
  volumeLabel: string; // e.g. "prompts", "searches", "generations"
  /** Direction of change vs. prior period. */
  direction: FrictionDirection;
  changePct: number;
}

interface PromptsData {
  pageKpis: PageKpi[];
  kptTabDefs: { id: KptTab; label: string }[];
  knowledgeByVolume: TreemapTopic[][];
  knowledgeByRepeat: TreemapTopic[][];
  peopleByVolume: TreemapTopic[][];
  peopleByRepeat: TreemapTopic[][];
  tasksByVolume: TreemapTopic[][];
  tasksByRepeat: TreemapTopic[][];
  frictionSignals: FrictionSignal[];
}

@Component({
  selector: 'wbct-prompts',
  imports: [TablerIconComponent, RouterLink],
  templateUrl: './prompts.html',
  styleUrl: './prompts.css',
})
export class Prompts {
  // ---- Workspace toggle (WB / IFC) ----
  readonly workspace = signal<Workspace>('wb');
  setWorkspace(w: Workspace) { this.workspace.set(w); }

  // ---- Hierarchical filter catalogs ----
  readonly regionGroups = REGION_GROUPS;
  readonly vpuGroups    = VPU_GROUPS;

  /** Pre-applied Region/Country from the URL — set when the user arrives from
   *  the dashboard country drawer's "View Prompts" link (?country=ke or
   *  ?region=afe). Empty otherwise. */
  readonly initialRegionCountry = (() => {
    const q = inject(ActivatedRoute).snapshot.queryParamMap;
    return regionCountrySelectionFromParams({ region: q.get('region'), country: q.get('country') });
  })();

  private readonly api = inject(ApiService);

  constructor() {
    this.api.getPrompts<PromptsData>().pipe(takeUntilDestroyed()).subscribe(d => {
      this.pageKpis.set(d.pageKpis);
      this.kptTabDefs.set(d.kptTabDefs);
      this.knowledgeByVolume.set(d.knowledgeByVolume);
      this.knowledgeByRepeat.set(d.knowledgeByRepeat);
      this.peopleByVolume.set(d.peopleByVolume);
      this.peopleByRepeat.set(d.peopleByRepeat);
      this.tasksByVolume.set(d.tasksByVolume);
      this.tasksByRepeat.set(d.tasksByRepeat);
      this.frictionSignals.set(d.frictionSignals);
    });
  }

  // ---- KPI row — anchored to K360 Master Data Extract ----
  // Adobe Analytics (Dec 1 – Jan 2): 639 chat prompts, 450 unique.
  // Power BI (Jan 1 – May 19): 3,095 unique visitors / 2,923 repeat / 16.73% adoption.
  readonly pageKpis = signal<PageKpi[]>([]);

  // ---- KPT tabs for the treemap section ----
  readonly kptTabDefs = signal<{ id: KptTab; label: string }[]>([]);
  readonly activeTab = signal<KptTab>('knowledge');
  readonly hoveredTopic = signal<TreemapTopic | null>(null);

  // ---- Toggle: By Volume / By Repeat Rate ----
  readonly tmMode = signal<TmMode>('volume');
  setTmMode(m: TmMode) { this.tmMode.set(m); }

  // ---- Treemap data (one matrix per tab) ----
  private readonly knowledgeByVolume = signal<TreemapTopic[][]>([]);
  private readonly knowledgeByRepeat = signal<TreemapTopic[][]>([]);
  private readonly peopleByVolume = signal<TreemapTopic[][]>([]);
  private readonly peopleByRepeat = signal<TreemapTopic[][]>([]);
  private readonly tasksByVolume = signal<TreemapTopic[][]>([]);
  private readonly tasksByRepeat = signal<TreemapTopic[][]>([]);

  readonly activeTreemap = computed(() => {
    const tab = this.activeTab();
    const mode = this.tmMode();
    if (tab === 'knowledge') return mode === 'volume' ? this.knowledgeByVolume() : this.knowledgeByRepeat();
    if (tab === 'people')    return mode === 'volume' ? this.peopleByVolume()    : this.peopleByRepeat();
    return                          mode === 'volume' ? this.tasksByVolume()     : this.tasksByRepeat();
  });

  readonly rowFlex = (row: TreemapTopic[]) => row.reduce((s, t) => s + t.pct, 0);

  // ---- Knowledge Friction Signals (right column) ----
  // Each row tells a different friction story so the list is useful at a glance.
  // Captions are two short words each — they wrap to 2 lines so values align.
  readonly frictionSignals = signal<FrictionSignal[]>([]);

  /** Maps friction-signal domain to KPT tab id used by the analysis page. */
  kptForDomain(d: FrictionDomain): 'knowledge' | 'people' | 'tasks' {
    if (d === 'knowledge') return 'knowledge';
    if (d === 'people')    return 'people';
    return 'tasks';
  }

  domainLabel(d: FrictionDomain): string {
    if (d === 'knowledge') return 'Knowledge';
    if (d === 'people') return 'People';
    return 'Task';
  }

  /** Tabler icon name used as the kind glyph on the left of each signal. */
  kindIcon(k: FrictionKind): string {
    if (k === 'dislike')      return 'thumb-down';
    if (k === 'clarify')      return 'message-report';
    if (k === 'low-expert')   return 'users';
    if (k === 'outdated')     return 'alert-triangle';
    return 'file-download';
  }
}
