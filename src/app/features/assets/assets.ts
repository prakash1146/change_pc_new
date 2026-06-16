import { Component, ElementRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TablerIconComponent } from '@tabler/icons-angular';
import {
  REGION_GROUPS, VERTICAL_GROUPS, VPU_GROUPS, regionCountrySelectionFromParams,
} from '../../shared/components/hier-filter/hier-filter-catalog';
import { ApiService } from '../../core/services/api.service';

type Tab = 'collections' | 'agents';
type Workspace = 'wb' | 'ifc';
type MapMode = 'region' | 'country';
type CurationStatus = 'Curated' | 'Pending Review' | 'In Progress' | 'Auto-Ingested';
type RegSortKey = 'name' | 'status' | 'verticals' | 'sectors' | 'lastUpdated' | 'utilization' | 'queries';
type VpuBreakdownMode = 'usage' | 'contribution';

interface VpuContributionSlice {
  code: string;
  name: string;       // full unit name — surfaced as tooltip
  count: number;
  pct: number;
  color: string;
  pathD: string;
}

interface KpiMetric { value: string; label?: string; delta?: string; }
interface OverviewKpi { title: string; metrics: KpiMetric[]; sub?: string; }
interface RegistryRow {
  name: string;
  status: CurationStatus;
  verticals: string[];
  sectors: string[];
  lastUpdated: string;        // ISO yyyy-mm-dd for sort
  lastUpdatedDisplay: string; // pre-formatted for display
  utilization: number;        // 0-100
  queries: number;
}
type Usage = 'high' | 'medium' | 'low';
type ChipSeverity = 'warning' | 'danger';

interface Node {
  id: string;
  label: string;
  usage: Usage;
  level: 'root' | 'branch' | 'leaf';
  x: number;
  y: number;
  queries?: number;
  warning?: { text: string; severity: ChipSeverity };
}

interface Link {
  from: string;
  to: string;
}

interface CanvasData {
  nodes: Node[];
  links: Link[];
  agentsCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

type CollectionStatus = 'integrated' | 'in-progress' | 'pending';
type DemandRank = 'very-high' | 'high' | 'medium' | 'low' | 'rising';
type Freshness = 'current' | 'aging' | 'stale' | 'unsynced';
type RiskTier = 'high' | 'medium' | 'low';

interface CollectionRecord {
  name: string;
  icon: string;
  type: string;
  status: CollectionStatus;
  coverage: number;
  sourceUtilisation: number;
  lastSynced: string;
  freshness: Freshness;
  demand: DemandRank;
  queries: number;
}

type SortKey = 'name' | 'coverage' | 'sourceUtilisation' | 'lastSynced' | 'queries' | 'demand';
type SortDir = 'asc' | 'desc';

interface TopPromptType {
  text: string;
  freq: number;
  score: number;
}

interface NegativeFeedbackTag {
  label: string;
  freq: number;
}

interface GovernanceAction {
  label: string;
  icon: string;
  intent?: 'primary' | 'default';
}

interface CollectionDetails {
  id: string;
  name: string;
  icon: string;
  risk: RiskTier;
  sources: string[];        // e.g. ['SharePoint', 'PDF']
  totalFiles: number;
  retrievalPct: number;
  retrievalCount: number;
  citationCoverage: number;
  promptDependency: number;
  topPromptTypes: TopPromptType[];
  topNegative: NegativeFeedbackTag[];
  governance: GovernanceAction[];
}

interface CollectionKpi {
  title: string;
  value: string;
  sub: string;
  icon: string;
  tone: 'purple' | 'cyan' | 'amber' | 'red' | 'green';
  pct: number;
  secondary?: string;
  target?: string;
  tooltip?: string;
}

interface AssetsData {
  agentsKpis: OverviewKpi[];
  agentPromptUsage: { name: string; prompts: number }[];
  actionDownloads: { label: string; count: number }[];
  overviewKpis: OverviewKpi[];
  registryRows: RegistryRow[];
  vpuUsage: VpuUsage;
  vpuContribution: { code: string; name: string; count: number }[];
  agentsData: CanvasData;
  collectionsData: CanvasData;
  collectionKpis: CollectionKpi[];
  collectionsList: CollectionRecord[];
  statusOptions: { id: string; label: string }[];
  defaultGovernance: GovernanceAction[];
}

interface VpuUsage {
  reaches: number;
  totalVpus: number;
  top: { code: string; name: string; pct: number }[];
}

const CARD_W = 200;
const CARD_H = 150;
const VIEW_W = 1860;
const VIEW_H = 400;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;
const DEFAULT_ZOOM = 0.85;
const DEFAULT_PAN_X = 20;
const DEFAULT_PAN_Y = 60;

const LINE_COLOR: Record<'high' | 'medium' | 'low', string> = {
  high:   '#34D399',
  medium: '#F59E0B',
  low:    '#EF4444',
};

function curve(x1: number, y1: number, x2: number, y2: number): string {
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

@Component({
  selector: 'wbct-assets',
  imports: [TablerIconComponent, RouterLink],
  templateUrl: './assets.html',
  styleUrl: './assets.css',
})
export class Assets {
  /** Which half of the assets to render. Driven by Home, which mounts one
   *  instance per scroll section ('collections' or 'agents'). */
  readonly mode = input.required<Tab>();
  readonly workspace = signal<Workspace>('wb');
  setWorkspace(w: Workspace) { this.workspace.set(w); }

  private readonly api = inject(ApiService);

  constructor() {
    this.api.getAssets<AssetsData>().pipe(takeUntilDestroyed()).subscribe((d) => {
      this.agentsKpis.set(d.agentsKpis);
      this.agentPromptUsage.set(d.agentPromptUsage);
      this.actionDownloads.set(d.actionDownloads);
      this.overviewKpis.set(d.overviewKpis);
      this.registryRows.set(d.registryRows);
      this.vpuUsage.set(d.vpuUsage);
      this.vpuContribution.set(d.vpuContribution);
      this.agentsData.set(d.agentsData);
      this.collectionsData.set(d.collectionsData);
      this.collectionKpis.set(d.collectionKpis);
      this.collectionsList.set(d.collectionsList);
      this.statusOptions.set(d.statusOptions);
      this.defaultGovernance.set(d.defaultGovernance);
    });
  }

  // ---- Hierarchical filter catalogs ----
  readonly regionGroups   = REGION_GROUPS;
  readonly verticalGroups = VERTICAL_GROUPS;
  readonly vpuGroups      = VPU_GROUPS;

  /** Pre-applied Region/Country from the URL — set when the user arrives from
   *  the dashboard country drawer's "View Collections" or "View Agents" link
   *  (?country=ke or ?region=afe). Empty otherwise. */
  readonly initialRegionCountry = (() => {
    const q = inject(ActivatedRoute).snapshot.queryParamMap;
    return regionCountrySelectionFromParams({ region: q.get('region'), country: q.get('country') });
  })();

  // ----- Agents tab KPIs — anchored to K360 Master Data Extract -----
  // 8 live agents per Agents sheet. TOR Genie tops Power BI tools usage at
  // 14,724 page views out of 23,822 tool actions (~62%).
  readonly agentsKpis = signal<OverviewKpi[]>([]);

  // ----- Agents & Tasks — usage of agents by prompts -----
  readonly agentPromptUsage = signal<{ name: string; prompts: number }[]>([]);

  // ----- Agents & Tasks — actions (document downloads) -----
  readonly actionDownloads = signal<{ label: string; count: number }[]>([]);

  /** Largest value in each ranked list — used to scale the slim bar widths. */
  readonly maxAgentPrompts = computed(() =>
    Math.max(...this.agentPromptUsage().map((a) => a.prompts), 1),
  );
  readonly maxActionDownloads = computed(() =>
    Math.max(...this.actionDownloads().map((d) => d.count), 1),
  );

  // ----- Assets Overview KPIs — K360 Master Data Extract -----
  // 128 collections, 16,201 total resources per Collections sheet.
  readonly overviewKpis = signal<OverviewKpi[]>([]);

  // ----- Collection Registry (Assets Overview) -----
  readonly registryRows = signal<RegistryRow[]>([]);

  readonly regSortKey = signal<RegSortKey>('queries');
  readonly regSortDir = signal<SortDir>('desc');

  readonly sortedRegistry = computed(() => {
    const key = this.regSortKey();
    const mul = this.regSortDir() === 'asc' ? 1 : -1;
    return [...this.registryRows()].sort((a, b) => {
      const va = this.registryValue(a, key);
      const vb = this.registryValue(b, key);
      if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * mul;
      return ((va as number) - (vb as number)) * mul;
    });
  });

  private registryValue(r: RegistryRow, key: RegSortKey): string | number {
    switch (key) {
      case 'name':        return r.name;
      case 'status':      return r.status;
      case 'verticals':   return r.verticals[0] ?? '';
      case 'sectors':     return r.sectors[0] ?? '';
      case 'lastUpdated': return new Date(r.lastUpdated).getTime();
      case 'utilization': return r.utilization;
      case 'queries':     return r.queries;
    }
  }

  toggleRegSort(key: RegSortKey) {
    if (this.regSortKey() === key) {
      this.regSortDir.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.regSortKey.set(key);
      this.regSortDir.set(key === 'name' ? 'asc' : 'desc');
    }
  }

  formatQueries(n: number): string {
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return n.toLocaleString();
  }

  // =========================================================================
  // Collections-tab middle row: Global Usage map + VPU Usage panel
  // =========================================================================
  private readonly mapSanitizer = inject(DomSanitizer);

  // ----- VPU Breakdown panel (Usage / Contribution toggle) -----
  // Usage view: which VPUs are *consuming* collections (Power BI Adoption-by-
  // VPU style). Contribution view: which VPUs are *authoring* the resources
  // sitting inside those collections — the provenance lens we added on the
  // resource side. Pie chart only renders in Contribution mode.
  readonly vpuBreakdownMode = signal<VpuBreakdownMode>('usage');
  setVpuBreakdownMode(m: VpuBreakdownMode) { this.vpuBreakdownMode.set(m); }

  // Usage data — `reaches` = distinct VPUs with any collection access in the
  // period; `totalVpus` = full WBG + IFC catalogue (matches VPU_GROUPS).
  readonly vpuUsage = signal<VpuUsage | null>(null);

  // Contribution data — Σ curated resources contributed by each VPU across
  // every collection. Mock counts sum to a plausible portion of the 4,230
  // curated resources reported on the Overview KPI row.
  private readonly vpuContribution = signal<{ code: string; name: string; count: number }[]>([]);

  // Same palette as the collection-detail Contribution pie so the two reads
  // feel like one visual language.
  private static readonly VPU_PALETTE = [
    '#E879F9', '#A78BFA', '#67E8F9', '#34D399',
    '#A5B4FC', '#FCD34D', '#FB7185', '#22D3EE',
  ];

  /** Pie-chart slice paths for the Contribution mode of the VPU Breakdown
   *  panel. Starts at 12 o'clock and walks clockwise. */
  readonly vpuContributionSlices = computed<VpuContributionSlice[]>(() => {
    const rows = this.vpuContribution();
    const total = rows.reduce((s, r) => s + r.count, 0);
    if (total === 0) return [];
    const cx = 50, cy = 50, r = 40;
    let cumulative = 0;
    return rows.map((row, i) => {
      const startAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
      const endAngle = ((cumulative + row.count) / total) * 2 * Math.PI - Math.PI / 2;
      cumulative += row.count;
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
      const pathD = rows.length === 1
        ? `M ${cx - r},${cy} A ${r},${r} 0 1 1 ${cx + r},${cy} A ${r},${r} 0 1 1 ${cx - r},${cy} Z`
        : `M ${cx},${cy} L ${x1.toFixed(2)},${y1.toFixed(2)} A ${r},${r} 0 ${largeArc} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
      return {
        code: row.code,
        name: row.name,
        count: row.count,
        pct: Math.round((row.count / total) * 100),
        color: Assets.VPU_PALETTE[i % Assets.VPU_PALETTE.length],
        pathD,
      };
    });
  });

  // ----- Global Usage map -----
  readonly mapMode = signal<MapMode>('region');
  setMapMode(m: MapMode) { this.mapMode.set(m); this.mapSelection.set(null); }

  readonly mapSvg = signal<SafeHtml | null>(null);
  readonly mapHost = viewChild<ElementRef<HTMLElement>>('mapHost');

  // Map pan/zoom state — prefixed `map*` to avoid colliding with the agents-tab
  // canvas pan/zoom (panX/panY/zoom) defined further down.
  readonly mapScale = signal(1);
  readonly mapTx = signal(0);
  readonly mapTy = signal(0);
  readonly mapTransform = computed(
    () => `translate(${this.mapTx()}px, ${this.mapTy()}px) scale(${this.mapScale()})`,
  );
  readonly isMapPanning = signal(false);
  private static readonly MAP_MIN_ZOOM = 1;
  private static readonly MAP_MAX_ZOOM = 6;
  private mapPanStart: { x: number; y: number; tx: number; ty: number } | null = null;
  private mapPanMoved = false;

  readonly mapSelection = signal<{ name: string; queries: number } | null>(null);

  private loadMap = effect(() => {
    if (this.mapSvg()) return;
    fetch('assets/images/world-map-coded.svg')
      .then(r => r.text())
      .then(svg => this.mapSvg.set(this.mapSanitizer.bypassSecurityTrustHtml(svg)));
  });

  private tintMapEffect = effect(() => {
    const host = this.mapHost()?.nativeElement;
    this.mapSvg();
    if (!host) return;
    setTimeout(() => this.tintMap(host), 0);
  });

  private tintMap(host: HTMLElement) {
    const svg = host.querySelector<SVGSVGElement>('svg');
    if (!svg) return;
    svg.querySelectorAll<SVGElement>('[id]').forEach(el => {
      const id = el.id?.toLowerCase();
      if (!id || id.startsWith('_') || id === 'world-map') return;
      const intensity = ASSETS_MAP_INTENSITY[id] ?? 0;
      const region = ASSETS_ISO_TO_REGION[id] ?? '';
      const targets = el.tagName === 'g'
        ? el.querySelectorAll<SVGPathElement>('path')
        : [el as unknown as SVGPathElement];
      targets.forEach(p => {
        p.dataset['intensity'] = String(intensity);
        if (region) p.dataset['region'] = region;
        p.dataset['country'] = id;
      });
    });
  }

  onMapClick(event: MouseEvent) {
    if (this.mapPanMoved) return;
    const target = event.target as Element | null;
    const path = target?.closest?.('path') as SVGPathElement | null;
    if (!path) { this.mapSelection.set(null); return; }
    if (this.mapMode() === 'region') {
      const region = path.dataset['region'];
      if (!region) { this.mapSelection.set(null); return; }
      this.mapSelection.set({
        name: ASSETS_REGION_LABEL[region] ?? region.toUpperCase(),
        queries: ASSETS_REGION_QUERIES[region] ?? 0,
      });
    } else {
      const code = path.dataset['country'];
      if (!code) { this.mapSelection.set(null); return; }
      this.mapSelection.set({
        name: ASSETS_COUNTRY_LABEL[code] ?? code.toUpperCase(),
        queries: ASSETS_COUNTRY_QUERIES[code] ?? 0,
      });
    }
  }

  onMapWheel(event: WheelEvent) {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    this.mapScale.update(s =>
      Math.min(Assets.MAP_MAX_ZOOM, Math.max(Assets.MAP_MIN_ZOOM, s * factor)),
    );
  }

  onMapPanStart(event: MouseEvent) {
    if (event.button !== 0) return;
    this.mapPanStart = { x: event.clientX, y: event.clientY, tx: this.mapTx(), ty: this.mapTy() };
    this.mapPanMoved = false;
    this.isMapPanning.set(true);
  }

  onMapPanMove(event: MouseEvent) {
    if (!this.mapPanStart) return;
    const dx = event.clientX - this.mapPanStart.x;
    const dy = event.clientY - this.mapPanStart.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.mapPanMoved = true;
    this.mapTx.set(this.mapPanStart.tx + dx);
    this.mapTy.set(this.mapPanStart.ty + dy);
  }

  onMapPanEnd() {
    this.mapPanStart = null;
    this.isMapPanning.set(false);
  }

  mapZoomIn()    { this.mapScale.update(s => Math.min(Assets.MAP_MAX_ZOOM, s * 1.25)); }
  mapZoomOut()   { this.mapScale.update(s => Math.max(Assets.MAP_MIN_ZOOM, s / 1.25)); }
  mapResetView() {
    this.mapScale.set(1);
    this.mapTx.set(0);
    this.mapTy.set(0);
    this.mapSelection.set(null);
  }

  // Slug used in the /assets/collection/:slug route. Matches the keys in
  // SLUG_TO_NAME inside the CollectionDetail component.
  slugFor(name: string): string {
    return name
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  readonly cardW = CARD_W;
  readonly cardH = CARD_H;
  readonly viewW = VIEW_W;
  readonly viewH = VIEW_H;

  // ----- Agents canvas -----
  // Orchestrator on top, 8 children on a single row below
  readonly agentsData = signal<CanvasData | null>(null);

  // ----- Ingested Collections canvas -----
  readonly collectionsData = signal<CanvasData | null>(null);

  /** Empty canvas used while data is loading / null so downstream
   *  rendering (lines, counts) never dereferences null. */
  private static readonly EMPTY_CANVAS: CanvasData = {
    nodes: [], links: [], agentsCount: 0, highCount: 0, mediumCount: 0, lowCount: 0,
  };

  readonly current = computed<CanvasData>(() => {
    const data = this.mode() === 'agents' ? this.agentsData() : this.collectionsData();
    return data ?? Assets.EMPTY_CANVAS;
  });

  readonly summaryLabel = computed(() =>
    this.mode() === 'agents' ? 'Agents' : 'Sources',
  );

  readonly lines = computed(() => {
    const data = this.current();
    const byId = new Map(data.nodes.map((n) => [n.id, n] as const));
    return data.links.flatMap((l) => {
      const from = byId.get(l.from);
      const to = byId.get(l.to);
      if (!from || !to) return [];
      const x1 = from.x + CARD_W / 2;
      const y1 = from.y + CARD_H;
      const x2 = to.x + CARD_W / 2;
      const y2 = to.y;
      // Match the connector color to the target node's usage tier so the
      // canvas reads at a glance — green for high, amber for medium, red
      // for low.
      return [{
        d: curve(x1, y1, x2, y2),
        key: `${l.from}-${l.to}`,
        color: LINE_COLOR[to.usage],
      }];
    });
  });

  // ----- pan / zoom -----
  readonly panX = signal(DEFAULT_PAN_X);
  readonly panY = signal(DEFAULT_PAN_Y);
  readonly zoom = signal(DEFAULT_ZOOM);
  readonly dragging = signal(false);
  private dragStart = { x: 0, y: 0, panX: 0, panY: 0 };

  readonly canvasWrap = viewChild<ElementRef<HTMLElement>>('canvasWrap');
  private hasCenteredCanvas = false;

  private centerCanvas = effect(() => {
    const wrap = this.canvasWrap()?.nativeElement;
    if (!wrap || this.hasCenteredCanvas) return;
    // Defer so clientWidth/Height are measured after layout.
    setTimeout(() => {
      if (this.hasCenteredCanvas) return;
      const wrapW = wrap.clientWidth;
      const wrapH = wrap.clientHeight;
      if (!wrapW || !wrapH) return;
      const contentW = VIEW_W * DEFAULT_ZOOM;
      const contentH = VIEW_H * DEFAULT_ZOOM;
      this.panX.set(Math.round((wrapW - contentW) / 2));
      this.panY.set(Math.round((wrapH - contentH) / 2));
      this.hasCenteredCanvas = true;
    }, 0);
  });

  readonly transform = computed(
    () => `translate(${this.panX()}px, ${this.panY()}px) scale(${this.zoom()})`,
  );

  readonly bgPosition = computed(() => `${this.panX()}px ${this.panY()}px`);

  readonly bgSize = computed(() => {
    const s = 16 * this.zoom();
    return `${s}px ${s}px`;
  });

  onCanvasMouseDown(e: MouseEvent) {
    // Only respond to primary button
    if (e.button !== 0) return;
    this.dragging.set(true);
    this.dragStart = {
      x: e.clientX,
      y: e.clientY,
      panX: this.panX(),
      panY: this.panY(),
    };
    e.preventDefault();
  }

  onCanvasMouseMove(e: MouseEvent) {
    if (!this.dragging()) return;
    const dx = e.clientX - this.dragStart.x;
    const dy = e.clientY - this.dragStart.y;
    this.panX.set(this.dragStart.panX + dx);
    this.panY.set(this.dragStart.panY + dy);
  }

  onCanvasMouseUp() {
    this.dragging.set(false);
  }

  onWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    this.zoom.update((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor)));
  }

  zoomIn() {
    this.zoom.update((z) => Math.min(MAX_ZOOM, z * 1.15));
  }

  zoomOut() {
    this.zoom.update((z) => Math.max(MIN_ZOOM, z / 1.15));
  }

  resetView() {
    this.zoom.set(DEFAULT_ZOOM);
    const wrap = this.canvasWrap()?.nativeElement;
    if (wrap?.clientWidth && wrap?.clientHeight) {
      this.panX.set(Math.round((wrap.clientWidth  - VIEW_W * DEFAULT_ZOOM) / 2));
      this.panY.set(Math.round((wrap.clientHeight - VIEW_H * DEFAULT_ZOOM) / 2));
    } else {
      this.panX.set(DEFAULT_PAN_X);
      this.panY.set(DEFAULT_PAN_Y);
    }
  }

  // ----- Knowledge Collections content -----
  readonly collectionKpis = signal<CollectionKpi[]>([]);

  readonly collectionsList = signal<CollectionRecord[]>([]);

  readonly collectionsTotal = 128;

  readonly statusOptions = signal<{ id: string; label: string }[]>([]);

  readonly statusFilter = signal<string>('all');
  readonly activeChip = signal<string | null>(null);
  readonly statusOpen = signal(false);

  readonly sortKey = signal<SortKey>('queries');
  readonly sortDir = signal<SortDir>('desc');

  readonly statusFilterLabel = computed(
    () => this.statusOptions().find((o) => o.id === this.statusFilter())?.label ?? 'All Statuses',
  );

  readonly filteredCollections = computed(() => {
    const status = this.statusFilter();
    const chip = this.activeChip();
    const key = this.sortKey();
    const mul = this.sortDir() === 'asc' ? 1 : -1;

    const rows = this.collectionsList().filter((c) => {
      if (status !== 'all' && c.status !== status) return false;
      if (chip === 'outdated' && c.freshness !== 'stale') return false;
      if (chip === 'high-demand' && !['very-high', 'high'].includes(c.demand)) return false;
      if (chip === 'newly-ingested' && c.status !== 'integrated') return false;
      return true;
    });

    return rows.slice().sort((a, b) => {
      if (key === 'name') return a.name.localeCompare(b.name) * mul;
      const av = this.sortValue(a, key);
      const bv = this.sortValue(b, key);
      return (av - bv) * mul;
    });
  });

  private sortValue(c: CollectionRecord, key: Exclude<SortKey, 'name'>): number {
    switch (key) {
      case 'coverage':          return c.coverage;
      case 'sourceUtilisation': return c.sourceUtilisation;
      case 'queries':           return c.queries;
      case 'lastSynced':        return this.daysSinceSync(c.lastSynced);
      case 'demand':            return this.demandRank(c.demand);
    }
  }

  private daysSinceSync(s: string): number {
    const m = s.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  private demandRank(d: DemandRank): number {
    switch (d) {
      case 'very-high': return 5;
      case 'high':      return 4;
      case 'rising':    return 3;
      case 'medium':    return 2;
      case 'low':       return 1;
    }
  }

  toggleSort(key: SortKey) {
    if (this.sortKey() === key) {
      this.sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortKey.set(key);
      this.sortDir.set(key === 'name' ? 'asc' : 'desc');
    }
  }

  toggleStatusOpen() { this.statusOpen.update((v) => !v); }
  closeStatusFilter() { this.statusOpen.set(false); }
  pickStatus(id: string) { this.statusFilter.set(id); this.statusOpen.set(false); }
  toggleChip(id: string) {
    this.activeChip.update((c) => (c === id ? null : id));
  }

  // labels for demand pill
  demandLabel(d: DemandRank): string {
    switch (d) {
      case 'very-high': return 'Very High';
      case 'high':      return 'High';
      case 'medium':    return 'Medium';
      case 'low':       return 'Low';
      case 'rising':    return 'Rising';
    }
  }

  statusLabel(s: CollectionStatus): string {
    switch (s) {
      case 'integrated':  return 'Integrated';
      case 'in-progress': return 'In Progress';
      case 'pending':     return 'Pending';
    }
  }

  // ----- Collection Details drawer -----
  private readonly defaultGovernance = signal<GovernanceAction[]>([]);

  private detailsFor(c: CollectionRecord): CollectionDetails {
    // Derive a deterministic "ID" suffix from the name for the mock view
    const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 8) || 'unknown';
    const risk: RiskTier =
      c.freshness === 'stale' || c.coverage < 30 ? 'high'
      : c.freshness === 'aging' || c.coverage < 70 ? 'medium'
      : 'low';

    return {
      id: `col_${slug}`,
      name: c.name,
      icon: c.icon,
      risk,
      sources: ['SharePoint', 'PDF'],
      totalFiles: 1284,
      retrievalPct: 32,
      retrievalCount: 412,
      citationCoverage: 41,
      promptDependency: 32,
      topPromptTypes: [
        { text: 'Do you have a copy of the latest staff instructions',           freq: 124, score: 0.92 },
        { text: 'Link to the latest staff instruction for technical assitance',  freq: 98,  score: 0.88 },
        { text: 'Can you provide the latest guidelines and policies?',           freq: 45,  score: 0.76 },
      ],
      topNegative: [
        { label: 'Outdated Content',      freq: 4 },
        { label: 'Incomplete Information', freq: 3 },
        { label: 'Incorrect References',   freq: 2 },
        { label: 'Too Generic',            freq: 2 },
      ],
      governance: this.defaultGovernance(),
    };
  }

  readonly collectionDrawerOpen = signal(false);
  readonly collectionDetails = signal<CollectionDetails | null>(null);
  readonly collectionDrawerExpanded = signal(false);
  readonly collectionDrawerWidth = signal(720);
  readonly isCollectionResizing = signal(false);

  private resizeStartX = 0;
  private resizeStartWidth = 0;

  openCollectionDrawer(c: CollectionRecord) {
    this.collectionDetails.set(this.detailsFor(c));
    this.collectionDrawerOpen.set(true);
    this.collectionDrawerExpanded.set(false);
  }

  closeCollectionDrawer() {
    this.collectionDrawerOpen.set(false);
    this.collectionDrawerExpanded.set(false);
  }

  toggleCollectionDrawerExpand() {
    this.collectionDrawerExpanded.update((v) => !v);
  }

  onCollectionResizeStart(e: MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    this.collectionDrawerExpanded.set(false);
    this.resizeStartX = e.clientX;
    this.resizeStartWidth = this.collectionDrawerWidth();
    this.isCollectionResizing.set(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', this.onCollectionResizeMove);
    document.addEventListener('mouseup', this.onCollectionResizeEnd);
  }

  private readonly onCollectionResizeMove = (e: MouseEvent) => {
    if (!this.isCollectionResizing()) return;
    const delta = this.resizeStartX - e.clientX;
    const max = Math.max(480, window.innerWidth - 80);
    const next = Math.max(420, Math.min(max, this.resizeStartWidth + delta));
    this.collectionDrawerWidth.set(next);
  };

  private readonly onCollectionResizeEnd = () => {
    this.isCollectionResizing.set(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', this.onCollectionResizeMove);
    document.removeEventListener('mouseup', this.onCollectionResizeEnd);
  };

  riskLabel(r: RiskTier): string {
    switch (r) {
      case 'high':   return 'High Risk';
      case 'medium': return 'Medium Risk';
      case 'low':    return 'Low Risk';
    }
  }
}

// =============================================================================
// Global Usage map — lookup tables. Workspace-wide aggregates (sum across all
// collections), which is why values are higher than those on Collection Detail.
// =============================================================================
const ASSETS_ISO_TO_REGION: Record<string, string> = {
  ke: 'afe', et: 'afe', tz: 'afe', ug: 'afe', rw: 'afe', mw: 'afe', mz: 'afe', zm: 'afe', zw: 'afe',
  za: 'afe', mg: 'afe', ao: 'afe', cd: 'afe', so: 'afe', sd: 'afe', ss: 'afe', bw: 'afe', na: 'afe',
  bi: 'afe', km: 'afe', er: 'afe', sz: 'afe', ls: 'afe', mu: 'afe', sc: 'afe',
  ng: 'afw', gh: 'afw', sn: 'afw', ci: 'afw', cm: 'afw', cg: 'afw', cv: 'afw', bf: 'afw', bj: 'afw',
  ga: 'afw', gm: 'afw', gn: 'afw', gw: 'afw', gq: 'afw', lr: 'afw', ml: 'afw', mr: 'afw', ne: 'afw',
  st: 'afw', sl: 'afw', tg: 'afw', cf: 'afw', td: 'afw',
  in: 'sar', bd: 'sar', pk: 'sar', np: 'sar', lk: 'sar', af: 'sar', bt: 'sar', mv: 'sar',
  cn: 'eap', id: 'eap', ph: 'eap', vn: 'eap', mm: 'eap', th: 'eap', kh: 'eap', la: 'eap', my: 'eap',
  mn: 'eap', pg: 'eap', fj: 'eap', tl: 'eap', sb: 'eap', vu: 'eap', ws: 'eap', to: 'eap', tv: 'eap',
  ki: 'eap', mh: 'eap', fm: 'eap', nr: 'eap', pw: 'eap',
  br: 'lac', mx: 'lac', ar: 'lac', co: 'lac', pe: 'lac', cl: 'lac', ve: 'lac', ec: 'lac', bo: 'lac',
  gt: 'lac', ht: 'lac', do: 'lac', sv: 'lac', hn: 'lac', ni: 'lac', cr: 'lac', pa: 'lac', py: 'lac',
  uy: 'lac', jm: 'lac', cu: 'lac', tt: 'lac', bs: 'lac', bb: 'lac', gy: 'lac', sr: 'lac', ag: 'lac',
  bz: 'lac', dm: 'lac', gd: 'lac', kn: 'lac', lc: 'lac', vc: 'lac',
  eg: 'mna', ma: 'mna', tn: 'mna', dz: 'mna', ly: 'mna', sy: 'mna', jo: 'mna', lb: 'mna', iq: 'mna',
  ir: 'mna', ye: 'mna', dj: 'mna', ps: 'mna',
  ua: 'eca', tr: 'eca', kz: 'eca', uz: 'eca', az: 'eca', am: 'eca', ge: 'eca', kg: 'eca', tj: 'eca',
  tm: 'eca', md: 'eca', by: 'eca', al: 'eca', ba: 'eca', mk: 'eca', me: 'eca', rs: 'eca', xk: 'eca',
  pl: 'eca', ro: 'eca',
};

const ASSETS_REGION_LABEL: Record<string, string> = {
  afe: 'Eastern & Southern Africa (AFE)',
  afw: 'Western & Central Africa (AFW)',
  eap: 'East Asia & Pacific (EAP)',
  eca: 'Europe & Central Asia (ECA)',
  lac: 'Latin America & Caribbean (LAC)',
  mna: 'Middle East & North Africa (MNA)',
  sar: 'South Asia Region (SAR)',
};

// Workspace-wide region totals (queries across all collections).
const ASSETS_REGION_QUERIES: Record<string, number> = {
  afe: 6420, afw: 4180, eap: 5260, eca: 2240, lac: 3680, mna: 2860, sar: 4910,
};

const ASSETS_COUNTRY_LABEL: Record<string, string> = {
  ke: 'Kenya', et: 'Ethiopia', tz: 'Tanzania', za: 'South Africa', ng: 'Nigeria',
  in: 'India', bd: 'Bangladesh', pk: 'Pakistan', np: 'Nepal',
  br: 'Brazil', mx: 'Mexico', co: 'Colombia',
  id: 'Indonesia', ph: 'Philippines', vn: 'Vietnam', cn: 'China',
  eg: 'Egypt', ma: 'Morocco', tr: 'Türkiye',
};

const ASSETS_COUNTRY_QUERIES: Record<string, number> = {
  ke: 1640, et:  920, tz:  840, za:  720, ng: 1280,
  in: 2120, bd: 1080, pk:  860, np:  580,
  br: 1480, mx: 1080, co:  760,
  id: 1320, ph:  920, vn:  820, cn: 1080,
  eg:  720, ma:  540, tr:  420,
};

// Per-country intensity (0–6) for tinting. Higher = darker.
const ASSETS_MAP_INTENSITY: Record<string, number> = {
  ke: 6, et: 6, tz: 6, ug: 5, rw: 5, mw: 4, mz: 5, zm: 5, zw: 4,
  za: 5, mg: 4, ao: 4, ng: 6, gh: 5, sn: 4, ci: 5, cm: 4, cd: 5,
  in: 6, bd: 6, pk: 5, np: 5, lk: 4, af: 4,
  br: 6, mx: 5, co: 5, pe: 5, ar: 4, cl: 4,
  id: 6, ph: 5, vn: 5, mm: 5, kh: 4, th: 4,
  eg: 5, ma: 5, tn: 4, dz: 4, ye: 4,
  ua: 4, uz: 4, kz: 4, tr: 4,
};
