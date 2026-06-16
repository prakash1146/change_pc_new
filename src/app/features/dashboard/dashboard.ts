import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ApiService } from '../../core/services/api.service';
import { toSlug } from '../../shared/utilities/slug';

type Workspace = 'wb' | 'ifc';
type MapMode = 'region' | 'country';
type KptTab = 'knowledge' | 'people' | 'tasks';
type WbRegion = 'afe' | 'afw' | 'eap' | 'eca' | 'lac' | 'mna' | 'sar' | 'oth';
type Intensity = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// All WB regions — used to tell a region selection apart from a country ISO
// when rebuilding the drawer after a filter change.
const REGIONS: WbRegion[] = ['afe', 'afw', 'eap', 'eca', 'lac', 'mna', 'sar', 'oth'];

interface KpiMetric {
  value: string;
  label?: string;
  delta?: string;
}

interface KpiCard {
  title: string;
  metrics: KpiMetric[];
  secondaryMetrics?: KpiMetric[];
  sub?: string;
  barPct?: number;
}

interface CountryStat {
  value: string;
  label: string;
}

interface Collection {
  name: string;
  views: number;
}

interface AgentUsage {
  name: string;
  pct: number;
}

interface PillSection {
  label: string;
  link: string;
  items: string[];
}

interface TabData {
  stats: CountryStat[];
  pills: PillSection;
  topAgents: AgentUsage[];
}

interface CountryDetail {
  code: string;
  name: string;
  flag: string;
  queryRank: number;
  region: string;
  income: string;
  stats: CountryStat[];
  topVpus: string[];
  topCollections: Collection[];
  feedback: { positive: number; negative: number };
  tabs: Record<KptTab, TabData>;
}

/** Shape of the /api/dashboard payload. The KPI cards are served verbatim;
 *  the lookup tables feed the client-side builder functions. */
interface DashboardData {
  kpis: KpiCard[];
  regionNames: Record<WbRegion, string>;
  regionContext: Record<WbRegion, RegionContext>;
  isoToIncome: Record<string, string>;
  isoToUsage: Record<string, number>;
  isoToRegion: Record<string, WbRegion>;
  countryNames: Record<string, string>;
}

@Component({
  selector: 'wbct-dashboard',
  imports: [],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly api = inject(ApiService);

  // ---- top-right workspace toggle ----
  readonly workspace = signal<Workspace>('wb');
  setWorkspace(w: Workspace) { this.workspace.set(w); }

  /** Generate a URL slug for collection/agent detail links. */
  slugFor(name: string): string { return toSlug(name); }

  /** Map a pill label to its closest analysis-page topic id. Each pill in the
   *  country drawer is a free-text label (e.g. "Climate Adaptation"), so we
   *  pattern-match against the Analysis page's topic catalog to pick a route.
   *  Falls back to the KPT-domain landing topic when nothing matches. */
  private pillTopicId(tab: KptTab, label: string): string {
    const l = label.toLowerCase();
    if (tab === 'knowledge') {
      if (/agriculture|agri.*resil/.test(l))                  return 'agri-resil';
      if (/water|sanit|wash/.test(l))                         return 'water-infra';
      if (/climate.*adapt|adapt|resilien/.test(l))            return 'cli-adapt';
      if (/climate|energy|infra/.test(l))                     return 'cli-adapt';
      if (/labor|morocco|jobs|productivity/.test(l))          return 'ml';
      if (/lesson|icrr|ppar|evaluat/.test(l))                 return 'les';
      if (/housing|finance|fiscal|debt|mortgage/.test(l))     return 'hf';
      if (/growth|country|sector|trade/.test(l))              return 'eg';
      return 'eg';
    }
    if (tab === 'people') {
      if (/peer|review/.test(l))                              return 'peer';
      if (/country|locator|specialist/.test(l))               return 'cel';
      return 'exp';
    }
    // tasks
    if (/synth|research|literature/.test(l))                  return 'syn';
    if (/document|portfolio|analysis/.test(l))                return 'doc';
    return 'tor';
  }

  /** Query params for an individual prompt-topic pill — combines the pill's
   *  topic id, the active KPT tab, and the drawer's current country/region so
   *  the analysis page seeds both its Region/Country filter and the right
   *  topic data. */
  pillQueryParamsForLabel(tab: KptTab, label: string): Record<string, string> {
    return { kpt: tab, topic: this.pillTopicId(tab, label), ...this.viewQueryParams() };
  }

  /** Query params used by the drawer's "View Prompts / Collections / Agents"
   *  links so the destination page lands with the originating country (or
   *  region) pre-applied in its Region/Country filter. */
  viewQueryParams(extra: Record<string, string> = {}): Record<string, string> {
    const code = this.selectedCountry().code.toLowerCase();
    if (this.mapMode() === 'region') return { region: code, ...extra };
    return { country: code, ...extra };
  }

  // ---- KPI cards — K360 Master Data Extract (Power BI Jan 1 – May 19, 2026) ----
  // Populated from /api/dashboard in the constructor.
  readonly kpis = signal<KpiCard[]>([]);

  // ---- K360 by Region / Country ----
  // Toggle picks the map-click target (regions vs countries). The drawer
  // itself can hold a country, region, or the global aggregate — Global is
  // a separate button that re-seeds the drawer regardless of toggle state.
  readonly mapMode = signal<MapMode>('country');
  setMapMode(m: MapMode) { this.mapMode.set(m); }

  // On load the drawer is already open and shows worldwide stats. Clicking
  // any country/region replaces those stats; the Global button restores them.
  readonly countryPanelOpen = signal(true);
  closeCountryPanel() { this.countryPanelOpen.set(false); }
  openCountryPanel()  { this.countryPanelOpen.set(true); }

  /** Re-seed the drawer with the worldwide aggregate. Wired to the Global
   *  button next to the By Region / By Country toggle so users can return
   *  here from any drilled-in region or country view. */
  resetToGlobal() {
    this.selectedCountry.set(buildGlobalDetail());
    this.openCountryPanel();
  }

  // ---- drawer resize ----
  readonly drawerWidth = signal(460);
  private drawerResizeStart: { x: number; width: number } | null = null;
  private drawerUserResized = false;

  onDrawerResizeStart(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.drawerUserResized = true;
    this.drawerResizeStart = { x: event.clientX, width: this.drawerWidth() };
    document.body.style.cursor = 'ew-resize';
  }

  onDrawerResizeMove(event: MouseEvent) {
    if (!this.drawerResizeStart) return;
    // Drawer is anchored to the right edge — moving the mouse left widens it.
    const delta = event.clientX - this.drawerResizeStart.x;
    const target = this.drawerResizeStart.width - delta;
    const panelW = this.mapHost()?.nativeElement?.clientWidth ?? 1200;
    const maxW = Math.max(360, panelW - 200);  // keep ≥ 200px of map visible
    this.drawerWidth.set(Math.min(maxW, Math.max(320, target)));
  }

  onDrawerResizeEnd() {
    if (!this.drawerResizeStart) return;
    this.drawerResizeStart = null;
    document.body.style.cursor = '';
  }

  // Inline SVG loaded at runtime so individual <path> elements are clickable
  // via event delegation. Source: flekschas/simple-world-map (CC BY-SA 3.0),
  // each path has id="<iso-3166-1 alpha-2 lowercase>".
  readonly mapSvg = signal<SafeHtml | null>(null);
  readonly mapHost = viewChild<ElementRef<HTMLElement>>('mapHost');

  // Pan / zoom state — applied as CSS transform on the inner .map-pan div.
  readonly scale = signal(1);
  readonly tx = signal(0);
  readonly ty = signal(0);
  readonly mapTransform = computed(
    () => `translate(${this.tx()}px, ${this.ty()}px) scale(${this.scale()})`
  );
  readonly isPanning = signal(false);

  private static readonly MIN_ZOOM = 1;
  private static readonly MAX_ZOOM = 8;

  private panStart: { x: number; y: number; tx: number; ty: number } | null = null;
  private panMoved = false;

  constructor() {
    // Lookup tables and KPI cards come from the mock API. The builder functions
    // read the (module-scope) lookup tables, so we inject them via
    // setDashboardLookups() before re-seeding the drawer with real numbers.
    // Re-emits whenever the global filter (date range / segment) changes, so
    // the KPI cards and the map's per-country usage refresh with filtered data.
    this.api.getDashboard<DashboardData>().pipe(takeUntilDestroyed()).subscribe(d => {
      setDashboardLookups(d);
      this.kpis.set(d.kpis);
      // Re-seed the drawer's aggregate from the freshly filtered lookups while
      // preserving the user's current drill-in (country / region / global).
      this.selectedCountry.set(this.rebuildSelected());
      // Re-decorate the map paths with the new usage intensities.
      const host = this.mapHost()?.nativeElement;
      const code = this.selectedCountry().code.toLowerCase();
      if (host) setTimeout(() => this.applyMapDecorations(host, code), 0);
    });

    fetch('assets/images/world-map-coded.svg')
      .then(r => r.text())
      .then(svg => this.mapSvg.set(this.sanitizer.bypassSecurityTrustHtml(svg)));

    // Tag every country path with its K360-usage intensity bucket (0-6)
    // for CSS-driven monochrome shading, build a one-time <text> label per
    // country, and toggle .is-active on the currently selected country.
    //
    // The DOM work is deferred to a macrotask (setTimeout 0) so it runs
    // AFTER Angular's change detection applies [innerHTML]="mapSvg()" to
    // the .map-pan div. Without this defer there's a race where the effect
    // fires on the signal update before CD inserts the SVG, leaving
    // querySelector('svg') null and paths un-tagged.
    effect(() => {
      const host = this.mapHost()?.nativeElement;
      const code = this.selectedCountry().code.toLowerCase();
      this.mapSvg(); // track so the effect re-runs once SVG is set
      if (!host) return;
      setTimeout(() => this.applyMapDecorations(host, code), 0);
    });

    // Show/hide labels based on whether the country is wide enough to fit
    // its label at the current zoom. Country labels are hidden entirely in
    // "By Region" mode since clicks select regions, not countries.
    effect(() => {
      const host = this.mapHost()?.nativeElement;
      const s = this.scale();
      const mode = this.mapMode();
      this.mapSvg();
      if (!host) return;
      setTimeout(() => this.applyLabelVisibility(host, s, mode), 0);
    });

    // Auto-size the drawer to ~1/3 of the panel width on first render.
    // Stops touching the width once the user drags the handle manually.
    effect(() => {
      const host = this.mapHost()?.nativeElement;
      if (!host || this.drawerUserResized) return;
      setTimeout(() => {
        if (this.drawerUserResized) return;
        const w = Math.round(host.clientWidth / 3);
        this.drawerWidth.set(Math.max(360, Math.min(720, w)));
      }, 0);
    });
  }

  private applyMapDecorations(host: HTMLElement, code: string) {
    const svg = host.querySelector<SVGSVGElement>('svg');
    if (!svg) return;

    // Tag country paths with intensity, WB region, and country code.
    svg.querySelectorAll<SVGElement>('[id]').forEach(el => {
      const id = el.id?.toLowerCase();
      if (!id || id.startsWith('_') || id === 'world-map') return;
      const intensity = String(usageBucket(ISO_TO_USAGE[id] ?? 0));
      const region = ISO_TO_REGION[id] ?? 'oth';
      const targets = el.tagName === 'g'
        ? el.querySelectorAll<SVGPathElement>('path')
        : [el as unknown as SVGPathElement];
      targets.forEach(p => {
        if (p.dataset['intensity'] !== intensity) p.dataset['intensity'] = intensity;
        if (p.dataset['region'] !== region) p.dataset['region'] = region;
        if (!p.dataset['country']) p.dataset['country'] = id;
      });
    });

    // Build the labels layer once.
    if (!svg.querySelector('g.labels')) this.buildCountryLabels(svg);

    // Active country toggle.
    host.querySelectorAll('path.is-active').forEach(p => p.classList.remove('is-active'));
    host.querySelectorAll<SVGPathElement>(`path[data-country="${code}"]`)
      .forEach(p => p.classList.add('is-active'));
  }

  private applyLabelVisibility(host: HTMLElement, s: number, mode: MapMode) {
    host.querySelectorAll<SVGTextElement>('text.country-label').forEach(t => {
      if (mode === 'region') {
        t.style.display = 'none';
        return;
      }
      const cw = Number(t.dataset['bboxw'] ?? '0');
      const lw = Number(t.dataset['labelw'] ?? '0');
      t.style.display = cw * s >= lw * 0.9 ? '' : 'none';
    });
  }

  private buildCountryLabels(svg: SVGSVGElement) {
    const ns = 'http://www.w3.org/2000/svg';
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('class', 'labels');
    group.setAttribute('pointer-events', 'none');
    // Append group first so child <text> elements are in the DOM and
    // getBBox() returns valid dimensions for the label-width measurement.
    svg.appendChild(group);

    const FONT_SIZE = 7;          // in SVG user units — keep in sync with CSS
    const AVG_CHAR_WIDTH = 0.58;  // empirical width-to-fontsize ratio

    svg.querySelectorAll<SVGGraphicsElement>('[id]').forEach(el => {
      const id = el.id?.toLowerCase();
      if (!id || id.startsWith('_') || id === 'world-map') return;
      if (el.tagName !== 'g' && el.tagName !== 'path') return;
      let bbox: DOMRect;
      try { bbox = el.getBBox(); } catch { return; }
      if (!bbox || bbox.width <= 0 || bbox.height <= 0) return;
      const intensity = String(usageBucket(ISO_TO_USAGE[id] ?? 0));
      const name = COUNTRY_NAMES[id] ?? id.toUpperCase();
      // Estimate label width from string length × char-width ratio — more
      // reliable than getBBox() on <text>, which can return 0 before fonts
      // are fully laid out.
      const labelW = name.length * FONT_SIZE * AVG_CHAR_WIDTH;
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', String(bbox.x + bbox.width / 2));
      text.setAttribute('y', String(bbox.y + bbox.height / 2));
      text.setAttribute('class', 'country-label');
      text.dataset['country'] = id;
      text.dataset['intensity'] = intensity;
      text.dataset['bboxw'] = String(bbox.width);
      text.dataset['labelw'] = String(labelW);
      text.textContent = name;
      group.appendChild(text);
    });
  }

  onMapClick(event: MouseEvent) {
    if (this.panMoved) return; // suppress click after a drag
    const target = event.target as Element | null;
    const path = target?.closest?.('path') as SVGPathElement | null;
    if (!path) return;
    if (this.mapMode() === 'region') {
      const region = path.dataset['region'] as WbRegion | undefined;
      if (!region || region === 'oth') return;
      this.selectRegion(region);
    } else {
      const code = path.dataset['country'];
      if (!code) return;
      this.selectCountry(code);
    }
  }

  selectRegion(region: WbRegion) {
    this.selectedCountry.set(buildRegionDetail(region));
    this.openCountryPanel();
  }

  onWheel(event: WheelEvent) {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    this.scale.update(s =>
      Math.min(Dashboard.MAX_ZOOM, Math.max(Dashboard.MIN_ZOOM, s * factor)),
    );
  }

  onPanStart(event: MouseEvent) {
    if (event.button !== 0) return;
    this.panStart = { x: event.clientX, y: event.clientY, tx: this.tx(), ty: this.ty() };
    this.panMoved = false;
    this.isPanning.set(true);
  }

  onPanMove(event: MouseEvent) {
    if (!this.panStart) return;
    const dx = event.clientX - this.panStart.x;
    const dy = event.clientY - this.panStart.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.panMoved = true;
    this.tx.set(this.panStart.tx + dx);
    this.ty.set(this.panStart.ty + dy);
  }

  onPanEnd() {
    this.panStart = null;
    this.isPanning.set(false);
  }

  zoomIn()    { this.scale.update(s => Math.min(Dashboard.MAX_ZOOM, s * 1.25)); }
  zoomOut()   { this.scale.update(s => Math.max(Dashboard.MIN_ZOOM, s / 1.25)); }
  resetView() { this.scale.set(1); this.tx.set(0); this.ty.set(0); }

  selectCountry(code: string) {
    this.selectedCountry.set(buildCountryDetail(code));
    this.openCountryPanel();
  }

  /** Rebuild the drawer's current selection from the (possibly just-refreshed)
   *  lookup tables, preserving whether the user is viewing the global
   *  aggregate, a region, or a single country. Used after a filter-driven
   *  refetch so the open drawer reflects the new numbers. */
  private rebuildSelected(): CountryDetail {
    const current = this.selectedCountry();
    const code = current.code;
    if (code === 'GLOBAL') return buildGlobalDetail();
    const region = code.toLowerCase() as WbRegion;
    if (REGIONS.includes(region)) return buildRegionDetail(region);
    return buildCountryDetail(code);
  }

  // KPT tabs inside the country detail panel
  readonly kptTabDefs: { id: KptTab; label: string }[] = [
    { id: 'knowledge', label: 'Knowledge' },
    { id: 'people',    label: 'People' },
    { id: 'tasks',     label: 'Tasks' },
  ];
  readonly activeTab = signal<KptTab>('knowledge');

  // Default selection — the global aggregate (mapMode starts as 'global').
  // Switching to By Region / By Country swaps this out via the map click
  // handlers; buildCountryDetail() / buildRegionDetail() / buildGlobalDetail()
  // all return the same CountryDetail shape.
  readonly selectedCountry = signal<CountryDetail>(buildGlobalDetail());

  readonly activeTabData = computed(() => this.selectedCountry().tabs[this.activeTab()]);

  /** Treemap-style cell set derived from the active tab's pill items.
   *  Capped at 5; shares fall off geometrically by rank (first cell is biggest)
   *  and are normalised so the listed percentages sum to ~100. */
  readonly topicTreemap = computed<{ label: string; pct: number }[]>(() => {
    const items = this.activeTabData().pills.items.slice(0, 5);
    if (items.length === 0) return [];
    const weights = items.map((_, i) => Math.pow(0.78, i));
    const total = weights.reduce((s, w) => s + w, 0);
    return items.map((label, i) => ({
      label,
      pct: Math.round((weights[i] / total) * 100),
    }));
  });
}

// Convert a 2-letter ISO code to its regional indicator emoji flag.
function isoToFlag(code: string): string {
  if (code.length !== 2) return '🌍';
  const base = 0x1f1e6;
  const a = 'a'.charCodeAt(0);
  return String.fromCodePoint(
    base + code.charCodeAt(0) - a,
    base + code.charCodeAt(1) - a,
  );
}

// ============================================================
// Lookup tables — sourced from /api/dashboard at runtime via
// setDashboardLookups(). Declared mutable (`let`) and initialized empty so the
// builder functions below can reference them by name; they are reassigned once
// the API responds. Memoization caches are reset on each reassignment.
// ============================================================
let REGION_NAMES: Record<WbRegion, string> = {} as Record<WbRegion, string>;

function resetDashboardCaches() {
  _countryRanks = null;
  _regionRanks = null;
}

function setDashboardLookups(d: {
  regionNames: any;
  regionContext: any;
  isoToIncome: any;
  isoToUsage: any;
  isoToRegion: any;
  countryNames: any;
}) {
  REGION_NAMES = d.regionNames;
  REGION_CONTEXT = d.regionContext;
  ISO_TO_INCOME = d.isoToIncome;
  ISO_TO_USAGE = d.isoToUsage;
  ISO_TO_REGION = d.isoToRegion;
  COUNTRY_NAMES = d.countryNames;
  resetDashboardCaches();
}

// ============================================================
// Country & region detail derivation — all numbers scale with the
// per-country usage value in ISO_TO_USAGE (higher usage → bigger
// numbers, better success/retention/feedback).
// ============================================================

// Lazy-memoized: ISO_TO_USAGE and ISO_TO_REGION are declared later in the
// file, so eager IIFEs would hit a TDZ. These getters compute on first use.
let _countryRanks: Record<string, number> | null = null;
function countryRank(code: string): number {
  if (!_countryRanks) {
    const sorted = Object.entries(ISO_TO_USAGE)
      .filter(([, u]) => u > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([c]) => c);
    _countryRanks = Object.fromEntries(sorted.map((c, i) => [c, i + 1]));
  }
  return _countryRanks[code] ?? 0;
}

let _regionRanks: Record<WbRegion, number> | null = null;
function regionRank(region: WbRegion): number {
  if (!_regionRanks) {
    const totals: Record<string, number> = {};
    for (const [code, u] of Object.entries(ISO_TO_USAGE)) {
      const r = ISO_TO_REGION[code] ?? 'oth';
      totals[r] = (totals[r] ?? 0) + u;
    }
    const sorted = (['afe', 'afw', 'eap', 'eca', 'lac', 'mna', 'sar'] as WbRegion[])
      .sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0));
    const out = { oth: 0 } as Record<WbRegion, number>;
    sorted.forEach((r, i) => { out[r] = i + 1; });
    _regionRanks = out;
  }
  return _regionRanks[region] ?? 0;
}

// Per-region context strings used to make each region's drawer feel distinct.
interface RegionContext {
  topSector: string;
  topics: string[];        // 3 knowledge topics
  roles: string[];         // 3 people roles
  taskTopics: string[];    // 2 task topics
  collections: string[];   // 3 collection names
  agents: [string, string, string];  // 3 knowledge/people agents
  taskAgent: string;       // primary task agent (e.g. "TOR Genie")
  vpu: string;             // primary VPU code
}
let REGION_CONTEXT: Record<WbRegion, RegionContext> = {} as Record<WbRegion, RegionContext>;

// Income label per ISO. Sparse — falls back to 'Lower Middle Income' which
// covers the majority of client states.
let ISO_TO_INCOME: Record<string, string> = {};

// Deterministic jitter — different per-country but stable across reloads.
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0;
  return Math.abs(h);
}
function jit(seed: number, i: number, range: number): number {
  return (((seed * 1103515245 + i * 12345) % 1000) / 1000 - 0.5) * range;
}
function formatNum(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

function buildCountryDetail(code: string): CountryDetail {
  const lo = code.toLowerCase();
  const usage = ISO_TO_USAGE[lo] ?? 0;
  const region = ISO_TO_REGION[lo] ?? 'oth';
  const ctx = REGION_CONTEXT[region];
  const seed = hash(lo);
  const u = usage / 100;        // 0..1
  const j = (i: number, r: number) => jit(seed, i, r);

  if (usage === 0) return makeEmptyDetail(lo);

  const activeUsers          = Math.max(0, Math.round(usage * 28 + j(0, 240)));
  const searchSuccessPct     = Math.round(60 + u * 25 + j(1, 6));
  const retentionPct         = Math.round(65 + u * 25 + j(2, 6));
  const avgVisits            = Math.max(1, +(1 + u * 4 + j(3, 0.8)).toFixed(1));
  const queries              = Math.max(0, Math.round(usage * 3 + j(4, 40)));
  const insights             = Math.round(queries * (0.82 + (j(5, 0.1))));
  const searches             = Math.max(0, Math.round(usage * 5 + j(6, 60)));
  const profileViews         = Math.round(searches * (0.22 + j(7, 0.06)));
  const torDownloads         = Math.max(0, Math.round(usage * 0.5 + j(8, 12)));
  const summariesDownloads   = Math.round(torDownloads * (0.75 + j(9, 0.1)));
  const slidesDownloads      = Math.round(torDownloads * (0.7 + j(10, 0.1)));
  const positivePct          = Math.round(58 + u * 22 + j(11, 6));
  const negativePct          = Math.round(38 - u * 14 + j(12, 6));
  const collectionViews      = [Math.round(queries * 1.4), Math.round(queries * 0.9), Math.round(queries * 0.6)];
  const agentPcts            = [55 + Math.round(j(13, 8)), 30 + Math.round(j(14, 6)), 9 + Math.round(j(15, 4))];
  // # of VPUs that have actually queried this country in the period.
  // Bounded against the 69-VPU catalogue (see VPU_GROUPS).
  const activeVpus           = Math.min(69, Math.max(2, Math.round(6 + u * 28 + j(16, 6))));

  return {
    code: lo.toUpperCase(),
    name: COUNTRY_NAMES[lo] ?? lo.toUpperCase(),
    flag: isoToFlag(lo),
    queryRank: countryRank(lo),
    region: `${REGION_NAMES[region]} Region (${region.toUpperCase()})`,
    income: ISO_TO_INCOME[lo] ?? 'Lower Middle Income',
    stats: [
      { value: formatNum(activeUsers),       label: 'active users' },
      { value: searchSuccessPct + '%',       label: 'search success' },
      { value: retentionPct + '%',           label: 'Retention Rate' },
      { value: String(avgVisits),            label: 'Average Visits per User' },
      { value: String(activeVpus),           label: 'Active VPUs' },
      { value: ctx.topSector,                label: 'top sector' },
    ],
    topVpus: [ctx.vpu, 'WKT', 'IFC'],
    topCollections: ctx.collections.map((name, i) => ({ name, views: collectionViews[i] ?? 0 })),
    feedback: { positive: positivePct, negative: negativePct },
    tabs: {
      knowledge: {
        stats: [
          { value: formatNum(queries),  label: 'queries' },
          { value: formatNum(insights), label: 'synthesized insights' },
        ],
        pills: { label: 'Top Prompt Topics', link: '/prompts/analysis', items: ctx.topics },
        topAgents: [
          { name: ctx.agents[0], pct: agentPcts[0] },
          { name: ctx.agents[1], pct: agentPcts[1] },
          { name: ctx.agents[2], pct: agentPcts[2] },
        ],
      },
      people: {
        stats: [
          { value: formatNum(searches),     label: 'searches' },
          { value: formatNum(profileViews), label: 'Expert Profile Views' },
        ],
        pills: { label: 'Top Roles Searched', link: '/prompts/analysis', items: ctx.roles },
        topAgents: [
          { name: ctx.agents[0], pct: agentPcts[0] },
          { name: ctx.agents[1], pct: agentPcts[1] },
          { name: ctx.agents[2], pct: agentPcts[2] },
        ],
      },
      tasks: {
        stats: [
          { value: formatNum(torDownloads),       label: 'TOR downloads' },
          { value: formatNum(summariesDownloads), label: 'Summaries downloads' },
          { value: formatNum(slidesDownloads),    label: 'Slides downloads' },
        ],
        pills: { label: 'Top Prompt Topics', link: '/prompts/analysis', items: ctx.taskTopics },
        topAgents: [
          { name: ctx.taskAgent, pct: agentPcts[0] },
          { name: ctx.agents[1], pct: agentPcts[1] },
          { name: ctx.agents[2], pct: agentPcts[2] },
        ],
      },
    },
  };
}

function makeEmptyDetail(code: string): CountryDetail {
  const upper = code.toUpperCase();
  const dashes = (labels: string[]): CountryStat[] =>
    labels.map(label => ({ value: '—', label }));
  return {
    code: upper,
    name: COUNTRY_NAMES[code] ?? upper,
    flag: isoToFlag(code),
    queryRank: 0,
    region: '—',
    income: '—',
    stats: dashes(['active users', 'search success', 'Retention Rate', 'Average Visits per User', 'Active VPUs', 'top sector']),
    topVpus: [],
    topCollections: [],
    feedback: { positive: 0, negative: 0 },
    tabs: {
      knowledge: { stats: dashes(['queries', 'synthesized insights']),                              pills: { label: 'Top Prompt Topics',  link: '/prompts/analysis', items: [] }, topAgents: [] },
      people:    { stats: dashes(['searches', 'Expert Profile Views']),                             pills: { label: 'Top Roles Searched', link: '/prompts/analysis', items: [] }, topAgents: [] },
      tasks:     { stats: dashes(['TOR downloads', 'Summaries downloads', 'Slides downloads']),    pills: { label: 'Top Prompt Topics',  link: '/prompts/analysis', items: [] }, topAgents: [] },
    },
  };
}

// Region detail — sum/avg of the region's member countries.
function buildRegionDetail(region: WbRegion): CountryDetail {
  const ctx = REGION_CONTEXT[region];
  const members = Object.entries(ISO_TO_USAGE).filter(([code]) => ISO_TO_REGION[code] === region);
  const memberCount = members.length;
  const totalUsage = members.reduce((sum, [, u]) => sum + u, 0);
  const avgUsage = memberCount ? totalUsage / memberCount : 0;
  const u = avgUsage / 100;

  const activeUsers        = Math.round(totalUsage * 30);
  const searchSuccessPct   = Math.round(62 + u * 22);
  const retentionPct       = Math.round(68 + u * 22);
  const avgVisits          = Math.max(1, +(2 + u * 3).toFixed(1));
  const queries            = Math.round(totalUsage * 3.2);
  const insights           = Math.round(queries * 0.84);
  const searches           = Math.round(totalUsage * 5.4);
  const profileViews       = Math.round(searches * 0.24);
  const torDownloads       = Math.round(totalUsage * 0.55);
  const summariesDownloads = Math.round(torDownloads * 0.78);
  const slidesDownloads    = Math.round(torDownloads * 0.72);
  const positivePct        = Math.round(60 + u * 18);
  const negativePct        = Math.round(36 - u * 12);
  const collectionViews    = [Math.round(queries * 1.4), Math.round(queries * 0.9), Math.round(queries * 0.6)];
  // Region-level VPU reach grows with usage but stays well below the 69-VPU
  // catalogue cap. Aggregates across the region's member countries.
  const activeVpus         = Math.min(69, Math.max(8, Math.round(20 + u * 35)));

  return {
    code: region.toUpperCase(),
    name: REGION_NAMES[region],
    flag: '🌍',
    queryRank: regionRank(region),
    region: `${region.toUpperCase()} Region`,
    income: `${memberCount} countries`,
    stats: [
      { value: formatNum(activeUsers),  label: 'active users' },
      { value: searchSuccessPct + '%',  label: 'search success' },
      { value: retentionPct + '%',      label: 'Retention Rate' },
      { value: String(avgVisits),       label: 'Average Visits per User' },
      { value: String(activeVpus),      label: 'Active VPUs' },
      { value: ctx.topSector,           label: 'top sector' },
    ],
    topVpus: [ctx.vpu, 'WKT', 'IFC'],
    topCollections: ctx.collections.map((name, i) => ({ name, views: collectionViews[i] ?? 0 })),
    feedback: { positive: positivePct, negative: negativePct },
    tabs: {
      knowledge: {
        stats: [
          { value: formatNum(queries),  label: 'queries' },
          { value: formatNum(insights), label: 'synthesized insights' },
        ],
        pills: { label: 'Top Prompt Topics', link: '/prompts/analysis', items: ctx.topics },
        topAgents: [
          { name: ctx.agents[0], pct: 58 },
          { name: ctx.agents[1], pct: 33 },
          { name: ctx.agents[2], pct:  9 },
        ],
      },
      people: {
        stats: [
          { value: formatNum(searches),     label: 'searches' },
          { value: formatNum(profileViews), label: 'Expert Profile Views' },
        ],
        pills: { label: 'Top Roles Searched', link: '/prompts/analysis', items: ctx.roles },
        topAgents: [
          { name: ctx.agents[0], pct: 58 },
          { name: ctx.agents[1], pct: 33 },
          { name: ctx.agents[2], pct:  9 },
        ],
      },
      tasks: {
        stats: [
          { value: formatNum(torDownloads),       label: 'TOR downloads' },
          { value: formatNum(summariesDownloads), label: 'Summaries downloads' },
          { value: formatNum(slidesDownloads),    label: 'Slides downloads' },
        ],
        pills: { label: 'Top Prompt Topics', link: '/prompts/analysis', items: ctx.taskTopics },
        topAgents: [
          { name: ctx.taskAgent, pct: 58 },
          { name: ctx.agents[1], pct: 33 },
          { name: ctx.agents[2], pct:  9 },
        ],
      },
    },
  };
}

// Global aggregate — sums across every country in ISO_TO_USAGE. Used when
// mapMode is 'global'. Pills are drawn from the most-prominent items across
// every regional context so the user lands with a worldwide overview.
function buildGlobalDetail(): CountryDetail {
  const entries = Object.entries(ISO_TO_USAGE);
  const totalUsage = entries.reduce((s, [, u]) => s + u, 0);
  const memberCount = entries.length;
  const avgUsage = memberCount ? totalUsage / memberCount : 0;
  const u = avgUsage / 100;

  const activeUsers        = Math.round(totalUsage * 32);
  const searchSuccessPct   = Math.round(66 + u * 20);
  const retentionPct       = Math.round(74 + u * 16);
  const avgVisits          = Math.max(1, +(3 + u * 2).toFixed(1));
  const queries            = Math.round(totalUsage * 3.4);
  const insights           = Math.round(queries * 0.86);
  const searches           = Math.round(totalUsage * 5.6);
  const profileViews       = Math.round(searches * 0.26);
  const torDownloads       = Math.round(totalUsage * 0.6);
  const summariesDownloads = Math.round(torDownloads * 0.78);
  const slidesDownloads    = Math.round(torDownloads * 0.72);
  // 69 total VPUs in the K360 catalogue — globally all are active.
  const activeVpus         = 69;

  // Worldwide top topics / roles / collections — picked from REGION_CONTEXT
  // so the drawer feels coherent with what users see when drilling in.
  const topTopics: string[] = [
    'Macroeconomic Stability',
    'Climate Adaptation & Resilience',
    'Energy Transition',
    'Urban Resilience',
    'Youth Employment',
  ];
  const topRoles: string[] = [
    'Sector Specialists',
    'Macro Economists',
    'Energy Specialists',
    'Climate Leads',
    'Urban Planners',
  ];
  const topTaskTopics: string[] = [
    'Country Diagnostic TOR',
    'Synthesis & Briefings',
    'Concept Note Drafting',
  ];
  const topCollections = [
    { name: 'Policy Research Working Papers', views: Math.round(queries * 1.6) },
    { name: 'Country Economic Updates',       views: Math.round(queries * 1.2) },
    { name: 'IFC Insights and Reports',       views: Math.round(queries * 0.8) },
  ];

  return {
    code: 'GLOBAL',
    name: 'Global',
    flag: '🌍',
    queryRank: 0,
    region: 'All Regions',
    income: `${memberCount} countries`,
    stats: [
      { value: formatNum(activeUsers), label: 'active users' },
      { value: searchSuccessPct + '%', label: 'search success' },
      { value: retentionPct + '%',     label: 'Retention Rate' },
      { value: String(avgVisits),      label: 'Average Visits per User' },
      { value: String(activeVpus),     label: 'Active VPUs' },
      { value: 'Macroeconomics',       label: 'top sector' },
    ],
    topVpus: ['AFEVP', 'EAPVP', 'ECAVP'],
    topCollections,
    feedback: { positive: 72, negative: 28 },
    tabs: {
      knowledge: {
        stats: [
          { value: formatNum(queries),  label: 'queries' },
          { value: formatNum(insights), label: 'synthesized insights' },
        ],
        pills: { label: 'Top Prompt Topics', link: '/prompts/analysis', items: topTopics },
        topAgents: [
          { name: 'Sherlock',         pct: 42 },
          { name: 'Lessons Explorer', pct: 30 },
          { name: 'TOR Genie',        pct: 18 },
        ],
      },
      people: {
        stats: [
          { value: formatNum(searches),     label: 'searches' },
          { value: formatNum(profileViews), label: 'Expert Profile Views' },
        ],
        pills: { label: 'Top Roles Searched', link: '/prompts/analysis', items: topRoles },
        topAgents: [
          { name: 'Sherlock',         pct: 68 },
          { name: 'Lessons Explorer', pct: 20 },
          { name: 'Translate',        pct: 12 },
        ],
      },
      tasks: {
        stats: [
          { value: formatNum(torDownloads),       label: 'TOR downloads' },
          { value: formatNum(summariesDownloads), label: 'Summaries downloads' },
          { value: formatNum(slidesDownloads),    label: 'Slides downloads' },
        ],
        pills: { label: 'Top Prompt Topics', link: '/prompts/analysis', items: topTaskTopics },
        topAgents: [
          { name: 'TOR Genie',        pct: 52 },
          { name: 'Sherlock',         pct: 26 },
          { name: 'Lessons Explorer', pct: 22 },
        ],
      },
    },
  };
}

// K360 usage value (0–100) per ISO 3166-1 alpha-2 (lowercase). Unmapped → 0.
// Drives the monochrome map heatmap: darker = more usage.
let ISO_TO_USAGE: Record<string, number> = {};

// Convert a raw usage value (0–100) to a 7-step intensity bucket (0–6).
function usageBucket(v: number): Intensity {
  if (v <= 0)  return 0;
  if (v < 15)  return 1;
  if (v < 30)  return 2;
  if (v < 45)  return 3;
  if (v < 60)  return 4;
  if (v < 80)  return 5;
  return 6;
}

// WB operational region per ISO 3166-1 alpha-2 (lowercase). Source: WB
// official regional groupings (only client/borrowing countries are placed
// in a region — high-income and non-client states fall to 'oth').
let ISO_TO_REGION: Record<string, WbRegion> = {};

// ISO 3166-1 alpha-2 (lowercase) → display name. Unmapped codes fall back
// to uppercase ISO when used as label text.
let COUNTRY_NAMES: Record<string, string> = {};
