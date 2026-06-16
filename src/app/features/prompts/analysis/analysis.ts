import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TablerIconComponent } from '@tabler/icons-angular';
// import { DateRangeFilter } from '../../../shared/components/date-range-filter/date-range-filter';
// import { HierFilter } from '../../../shared/components/hier-filter/hier-filter';
import {
  REGION_GROUPS, regionCountrySelectionFromParams,
} from '../../../shared/components/hier-filter/hier-filter-catalog';
import { ApiService } from '../../../core/services/api.service';
import { toSlug } from '../../../shared/utilities/slug';

type KptDomain = 'knowledge' | 'people' | 'tasks';
type TopicId =
  | 'eg' | 'ml' | 'cli' | 'les' | 'hf' | 'oth' | 'exp'
  | 'peer' | 'cel' | 'tor' | 'syn' | 'doc'
  | 'cli-adapt' | 'water-infra' | 'agri-resil';

type MapMode = 'region' | 'country';

interface CollectionLink {
  name: string;
  contributionPct: number;
}

interface AgentUsage {
  name: string;
  usagePct: number;
}

interface NegativeDriver {
  title: string;
  reports: number;
  sharePct: number;  // share of all negatives
}

interface Subcategory {
  name: string;
  queries: number;
  repeatRate: number;        // 0..100
  retrievalSuccess: number;  // 0..100
  negativePct: number;       // 0..100
  positivePct: number;       // 0..100
}

/** One entry in the negative-feedback reason breakdown. The five standard
 *  reasons appear in this fixed order in every prompt: instructions, factual,
 *  offensive, language, other. */
interface NegReasonCount { label: string; count: number; }

interface SubcatPrompt {
  query: string;
  queries: number;        // distinct queries grouped under this prompt type
  negativePct: number;
  positivePct: number;
  // Aggregated feedback across every submission of this prompt type.
  positiveCount: number;
  negativeCount: number;
  /** Fixed length 5, ordered: instructions, factual, offensive, language, other. */
  negativeBreakdown: NegReasonCount[];
  /** Free-text comments captured when a user picked "Other" as the reason. */
  otherComments: string[];
}

/** Standard reason labels shown in the drawer breakdown. */
const NEG_REASON_LABELS = [
  'Did not Follow Instructions',
  'Not Factually Correct',
  'Offensive/Unsafe',
  'Wrong Language',
  'Other',
] as const;

interface SubcatDrawerData {
  name: string;
  /** AI insight paragraph — HTML allowed (<strong> for bold keywords). */
  aiInsightHtml: string;
  topVpus: string[];
  topCollections: string[];
  prompts: SubcatPrompt[];
}

interface CategoryData {
  id: TopicId;
  domain: KptDomain;
  name: string;
  updatedAgo: string;

  // ----- KPI titles vary by domain. For Knowledge → "Total No. of Prompts" +
  // "Intent Clarification Rate" + "Repeat Query Rate". For People → "Total
  // Searches" + "Profile Click-through Rate" + "Repeat Search Rate". For
  // Tasks → "Total Generations" + "Download Rate" + "Repeat Generation Rate".
  primaryTitle: string;
  primaryCount: number;
  primaryDeltaPct: number;

  totalFeedback: number;
  positivePct: number;
  negativePct: number;

  conversionTitle: string;
  conversionPct: number;
  conversionDeltaPct: number;
  conversionCompare: string;
  downloadBreakdown?: { label: string; count: number }[];

  repeatTitle: string;
  repeatPct: number;
  repeatDeltaPct: number;

  collections: CollectionLink[];
  agents: AgentUsage[];
  negativeDrivers: NegativeDriver[];
  subcategories: Subcategory[];
  // Subcategory table column labels — also varies by domain.
  subcatCountLabel: string;     // 'No. of Queries' | 'No. of Searches' | 'No. of Generations'
  subcatRepeatLabel: string;    // 'Repeat Rate'
  subcatConversionLabel: string;// 'Retrieval Success' | 'Profile Click-through' | 'Download Rate'

  mapIntensity: Record<string, number>;
  regionQueries: Record<string, number>;
  countryQueries: Record<string, number>;
}

/** Shape of the GET /api/analysis payload (mock-server/analysis.cjs). */
interface AnalysisData {
  categories: Record<TopicId, CategoryData>;
  subcatDrawerData: Record<string, SubcatDrawerData>;
}

@Component({
  selector: 'wbct-prompts-analysis',
  imports: [TablerIconComponent, RouterLink],
  templateUrl: './analysis.html',
  styleUrl: './analysis.css',
})
export class Analysis {
  // ---- Shared filter catalog (Region/Country) ----
  readonly regionGroups = REGION_GROUPS;

  /** Pre-applied Region/Country from the URL — used both to seed the
   *  HierFilter on entry and to forward as query params when clicking
   *  through to a collection or agent detail page. */
  readonly initialRegionCountry = (() => {
    const q = inject(ActivatedRoute).snapshot.queryParamMap;
    return regionCountrySelectionFromParams({ region: q.get('region'), country: q.get('country') });
  })();

  /** Current Region/Country selection — starts with whatever was passed in
   *  the URL and tracks user changes via (selectionChange). Used to build
   *  query params on outbound collection/agent row links. */
  readonly currentRegionCountry = signal<string[]>(this.initialRegionCountry);

  /** Query params for outbound links — collapses fully-selected regions back
   *  into a single `?region=…` for cleaner URLs; otherwise emits country ids
   *  as a comma-separated `?country=…` list. Returns `{}` when nothing is
   *  selected so the resulting link has no extra noise. */
  readonly outboundRegionParams = computed<Record<string, string>>(() => {
    const sel = new Set(this.currentRegionCountry());
    const out: Record<string, string> = {};
    if (sel.size === 0) return out;
    // If the whole catalogue matches a single fully-selected region group,
    // collapse it to `?region=<code>`.
    for (const g of REGION_GROUPS) {
      const allChildren = g.children.map(c => c.id);
      const isExactMatch = allChildren.length === sel.size
        && allChildren.every(id => sel.has(id));
      if (isExactMatch) { out['region'] = g.id; return out; }
    }
    out['country'] = sel.size === 1 ? [...sel][0] : [...sel].join(',');
    return out;
  });

  // ============ Category data ============ (loaded from GET /api/analysis)
  private readonly api = inject(ApiService);
  private readonly categories = signal<Record<TopicId, CategoryData>>({} as Record<TopicId, CategoryData>);
  // Subcategory drawer detail, keyed by subcategory name (loaded with the
  // categories above from the same /api/analysis payload).
  private readonly subcatDrawerData = signal<Record<string, SubcatDrawerData>>({});

  readonly active = signal<TopicId>('eg');
  // Returns null until /api/analysis has loaded (categories is empty at
  // construction). Falls back to the Macroeconomic Research topic ('eg') for
  // any topic id that isn't populated. The template guards with
  // `@if (category(); as c)`, so a null result simply renders nothing.
  readonly category = computed<CategoryData | null>(() => {
    const cats = this.categories();
    const t = this.active();
    const found = cats[t];
    if (found && found.id) return found;
    const fallback = cats.eg;
    return fallback && fallback.id ? fallback : null;
  });

  domainLabel(d: KptDomain): string {
    if (d === 'knowledge') return 'Knowledge';
    if (d === 'people')    return 'People';
    return 'Tasks';
  }

  /** Generate a URL slug for collection/agent detail links. */
  slugFor(name: string): string { return toSlug(name); }


  // ============ Global Demand map ============
  private readonly sanitizer = inject(DomSanitizer);

  readonly mapMode = signal<MapMode>('region');
  setMapMode(m: MapMode) {
    this.mapMode.set(m);
    this.mapSelection.set(null);
  }

  readonly mapSelection = signal<{ name: string; queries: number } | null>(null);

  readonly mapSvg = signal<SafeHtml | null>(null);
  readonly mapHost = viewChild<ElementRef<HTMLElement>>('mapHost');

  // Pan / zoom state
  readonly mapScale = signal(1);
  readonly mapTx = signal(0);
  readonly mapTy = signal(0);
  readonly mapTransform = computed(
    () => `translate(${this.mapTx()}px, ${this.mapTy()}px) scale(${this.mapScale()})`,
  );
  readonly isPanning = signal(false);
  private static readonly MIN_ZOOM = 1;
  private static readonly MAX_ZOOM = 8;
  private panStart: { x: number; y: number; tx: number; ty: number } | null = null;
  private panMoved = false;

  constructor() {
    const route = inject(ActivatedRoute);
    const topicParam = route.snapshot.queryParamMap.get('topic') as TopicId | null;

    // Content is loaded from the mock API. Validate the ?topic= param against
    // the freshly loaded categories so the initial selection is honoured once
    // the data arrives (categories is empty at construction time).
    this.api.getAnalysis<AnalysisData>().pipe(takeUntilDestroyed()).subscribe(d => {
      this.categories.set(d.categories);
      this.subcatDrawerData.set(d.subcatDrawerData);
      if (topicParam && d.categories[topicParam]?.id) {
        this.active.set(topicParam);
      }
    });

    fetch('/world-map-coded.svg')
      .then(r => r.text())
      .then(svg => this.mapSvg.set(this.sanitizer.bypassSecurityTrustHtml(svg)));

    effect(() => {
      const host = this.mapHost()?.nativeElement;
      this.mapSvg();
      this.active();
      if (!host) return;
      setTimeout(() => this.tintMap(host), 0);
    });

    effect(() => {
      const host = this.mapHost()?.nativeElement;
      const s = this.mapScale();
      const mode = this.mapMode();
      this.mapSvg();
      if (!host) return;
      setTimeout(() => this.applyLabelVisibility(host, s, mode), 0);
    });
  }

  private tintMap(host: HTMLElement) {
    const svg = host.querySelector<SVGSVGElement>('svg');
    if (!svg) return;
    const intensityMap = this.category()?.mapIntensity ?? {};
    svg.querySelectorAll<SVGElement>('[id]').forEach(el => {
      const id = el.id?.toLowerCase();
      if (!id || id.startsWith('_') || id === 'world-map') return;
      const intensity = intensityMap[id] ?? 0;
      const region = ISO_TO_REGION[id] ?? '';
      const targets = el.tagName === 'g'
        ? el.querySelectorAll<SVGPathElement>('path')
        : [el as unknown as SVGPathElement];
      targets.forEach(p => {
        p.dataset['intensity'] = String(intensity);
        if (region) p.dataset['region'] = region;
        p.dataset['country'] = id;
      });
    });
    if (!svg.querySelector('g.labels')) this.buildCountryLabels(svg);
  }

  private buildCountryLabels(svg: SVGSVGElement) {
    const ns = 'http://www.w3.org/2000/svg';
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('class', 'labels');
    group.setAttribute('pointer-events', 'none');
    svg.appendChild(group);

    const FONT_SIZE = 7;
    const AVG_CHAR_WIDTH = 0.58;
    svg.querySelectorAll<SVGGraphicsElement>('[id]').forEach(el => {
      const id = el.id?.toLowerCase();
      if (!id || id.startsWith('_') || id === 'world-map') return;
      if (el.tagName !== 'g' && el.tagName !== 'path') return;
      let bbox: DOMRect;
      try { bbox = el.getBBox(); } catch { return; }
      if (!bbox || bbox.width <= 0 || bbox.height <= 0) return;
      const name = COUNTRY_LABEL[id] ?? id.toUpperCase();
      const labelW = name.length * FONT_SIZE * AVG_CHAR_WIDTH;
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', String(bbox.x + bbox.width / 2));
      text.setAttribute('y', String(bbox.y + bbox.height / 2));
      text.setAttribute('class', 'country-label');
      text.dataset['country'] = id;
      text.dataset['bboxw'] = String(bbox.width);
      text.dataset['labelw'] = String(labelW);
      text.textContent = name;
      group.appendChild(text);
    });
  }

  private applyLabelVisibility(host: HTMLElement, s: number, mode: MapMode) {
    host.querySelectorAll<SVGTextElement>('text.country-label').forEach(t => {
      if (mode === 'region') { t.style.display = 'none'; return; }
      const cw = Number(t.dataset['bboxw'] ?? '0');
      const lw = Number(t.dataset['labelw'] ?? '0');
      t.style.display = cw * s >= lw * 0.9 ? '' : 'none';
    });
  }

  onMapClick(event: MouseEvent) {
    if (this.panMoved) { this.panMoved = false; return; }
    const target = event.target as Element | null;
    const path = target?.closest?.('path') as SVGPathElement | null;
    if (!path) { this.mapSelection.set(null); return; }
    const data = this.category();
    if (!data) { this.mapSelection.set(null); return; }
    if (this.mapMode() === 'region') {
      const region = path.dataset['region'];
      if (!region) { this.mapSelection.set(null); return; }
      const label = REGION_LABEL[region] ?? region.toUpperCase();
      const queries = data.regionQueries[region] ?? 0;
      this.mapSelection.set({ name: label, queries });
    } else {
      const code = path.dataset['country'];
      if (!code) { this.mapSelection.set(null); return; }
      const label = COUNTRY_LABEL[code] ?? code.toUpperCase();
      const queries = data.countryQueries[code] ?? 0;
      this.mapSelection.set({ name: label, queries });
    }
  }

  onMapWheel(event: WheelEvent) {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    this.mapScale.update(s =>
      Math.min(Analysis.MAX_ZOOM, Math.max(Analysis.MIN_ZOOM, s * factor)),
    );
  }

  onPanStart(event: MouseEvent) {
    if (event.button !== 0) return;
    this.panStart = { x: event.clientX, y: event.clientY, tx: this.mapTx(), ty: this.mapTy() };
    this.panMoved = false;
    this.isPanning.set(true);
  }
  onPanMove(event: MouseEvent) {
    if (!this.panStart) return;
    const dx = event.clientX - this.panStart.x;
    const dy = event.clientY - this.panStart.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.panMoved = true;
    this.mapTx.set(this.panStart.tx + dx);
    this.mapTy.set(this.panStart.ty + dy);
  }
  onPanEnd() {
    this.panStart = null;
    this.isPanning.set(false);
  }

  zoomIn()    { this.mapScale.update(s => Math.min(Analysis.MAX_ZOOM, s * 1.25)); }
  zoomOut()   { this.mapScale.update(s => Math.max(Analysis.MIN_ZOOM, s / 1.25)); }
  resetView() { this.mapScale.set(1); this.mapTx.set(0); this.mapTy.set(0); }

  // ============ Subcategory drawer ============
  // Two views: 'subcat' shows the AI insights + prompts table; 'prompt' shows
  // negative-feedback detail for a single prompt, with a back arrow returning
  // to the subcat view.
  readonly subDrawerSubcat = signal<Subcategory | null>(null);
  readonly subDrawerOpen = computed(() => this.subDrawerSubcat() !== null);
  readonly subDrawerView = signal<'subcat' | 'prompt'>('subcat');
  readonly subDrawerPrompt = signal<SubcatPrompt | null>(null);

  readonly subDrawerData = computed<SubcatDrawerData | null>(() => {
    const s = this.subDrawerSubcat();
    if (!s) return null;
    return this.subcatDrawerData()[s.name] ?? buildFallbackSubcatData(s);
  });

  readonly subDrawerAiInsight = computed<SafeHtml | null>(() => {
    const data = this.subDrawerData();
    if (!data) return null;
    return this.sanitizer.bypassSecurityTrustHtml(data.aiInsightHtml);
  });

  openSubcatDrawer(s: Subcategory) {
    this.subDrawerSubcat.set(s);
    this.subDrawerView.set('subcat');
    this.subDrawerPrompt.set(null);
  }
  openSubcatPromptDetail(p: SubcatPrompt) {
    this.subDrawerPrompt.set(p);
    this.subDrawerView.set('prompt');
  }
  backToSubcat() {
    this.subDrawerView.set('subcat');
    this.subDrawerPrompt.set(null);
  }
  closeSubcatDrawer() {
    this.subDrawerSubcat.set(null);
    // Defer the view reset so the slide-out animation still shows content.
    setTimeout(() => {
      this.subDrawerView.set('subcat');
      this.subDrawerPrompt.set(null);
    }, 280);
  }
}

function buildFallbackSubcatData(s: Subcategory): SubcatDrawerData {
  // Aggregate per prompt-type. Counts are inflated 10× so the breakdown
  // across five reasons reads visually; the displayed totals row stays
  // anchored to `queries` from the parent table.
  const otherSamples = [
    `Did not link to the latest ${s.name} brief.`,
    `Wanted region-specific examples for ${s.name.toLowerCase()}.`,
    `Missed cross-cutting comparisons with peer economies.`,
  ];
  const build = (query: string, queries: number, idx: number): SubcatPrompt => {
    const positiveCount = Math.max(1, Math.round(queries * s.positivePct / 100 * 10));
    const negativeCount = Math.max(1, Math.round(queries * s.negativePct / 100 * 10));
    // Distribute negatives across the five reason buckets — rough but stable.
    const weights = [0.35, 0.30, 0.05, 0.10, 0.20];
    const counts = weights.map(w => Math.round(negativeCount * w));
    // Adjust last bucket so the sum matches negativeCount exactly.
    const drift = negativeCount - counts.reduce((a, b) => a + b, 0);
    counts[4] = Math.max(0, counts[4] + drift);
    return {
      query, queries,
      negativePct: s.negativePct, positivePct: s.positivePct,
      positiveCount, negativeCount,
      negativeBreakdown: NEG_REASON_LABELS.map((label, i) => ({ label, count: counts[i] })),
      otherComments: counts[4] > 0 ? [otherSamples[idx % otherSamples.length]] : [],
    };
  };
  return {
    name: s.name,
    aiInsightHtml:
      `Users explore <strong>${s.name}</strong> through ${s.queries} prompts focused on ` +
      'sector-specific questions and benchmarking against peer economies. Engagement is ' +
      'distributed across regional VPUs, with users frequently consulting linked ' +
      'collections to ground their queries.',
    topVpus: ['AFW', 'AFCE1', 'AFCE2'],
    topCollections: ['Country Growth and Jobs', 'Fiscal Policy and Growth'],
    prompts: [
      build(`What are the key drivers in ${s.name}?`,                      Math.max(1, Math.round(s.queries * 0.4)),  0),
      build(`How does Ghana compare to peers on ${s.name.toLowerCase()}?`, Math.max(1, Math.round(s.queries * 0.25)), 1),
      build(`What policy reforms are needed for ${s.name.toLowerCase()}?`, Math.max(1, Math.round(s.queries * 0.2)),  2),
    ],
  };
}

// ============================================================
// Region + Country helpers (lightweight — only what this page needs).
// ============================================================
const ISO_TO_REGION: Record<string, string> = {
  // AFE
  ke: 'afe', tz: 'afe', et: 'afe', za: 'afe', ug: 'afe', rw: 'afe', mz: 'afe',
  // AFW
  ng: 'afw', sn: 'afw', ci: 'afw', gh: 'afw', cm: 'afw', ml: 'afw', bj: 'afw',
  // EAP
  cn: 'eap', id: 'eap', vn: 'eap', ph: 'eap', th: 'eap', my: 'eap', kh: 'eap',
  // ECA
  pl: 'eca', tr: 'eca', ua: 'eca', ro: 'eca', uz: 'eca', kz: 'eca',
  // LAC
  br: 'lac', mx: 'lac', co: 'lac', ar: 'lac', pe: 'lac', cl: 'lac',
  // MNA
  eg: 'mna', ma: 'mna', tn: 'mna', ye: 'mna', jo: 'mna', dz: 'mna', iq: 'mna',
  // SAR
  in: 'sar', pk: 'sar', bd: 'sar', lk: 'sar', np: 'sar', af: 'sar', bt: 'sar',
};

const REGION_LABEL: Record<string, string> = {
  afe: 'Eastern & Southern Africa',
  afw: 'Western & Central Africa',
  eap: 'East Asia & Pacific',
  eca: 'Europe & Central Asia',
  lac: 'Latin America & Caribbean',
  mna: 'Middle East & North Africa',
  sar: 'South Asia',
};

const COUNTRY_LABEL: Record<string, string> = {
  gh: 'Ghana', ng: 'Nigeria', sn: 'Senegal', ci: "Côte d'Ivoire", ke: 'Kenya',
  tz: 'Tanzania', et: 'Ethiopia', za: 'South Africa',
  in: 'India', bd: 'Bangladesh', pk: 'Pakistan', lk: 'Sri Lanka',
  cn: 'China', id: 'Indonesia', vn: 'Vietnam',
  br: 'Brazil', mx: 'Mexico',
};
