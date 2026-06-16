import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { HierFilter } from '../../shared/components/hier-filter/hier-filter';
import {
  REGION_GROUPS, VPU_GROUPS, regionCountrySelectionFromParams,
} from '../../shared/components/hier-filter/hier-filter-catalog';
import { DateRangeFilter } from '../../shared/components/date-range-filter/date-range-filter';
import { ApiService } from '../../core/services/api.service';

type Workspace = 'wb' | 'ifc';
type HeatmapMode = 'region' | 'vpu';

interface KpiMetric { value: string; label?: string; delta?: string; }
interface PageKpi   { title: string; metrics: KpiMetric[]; sub?: string; }

interface ActiveUsersKpi      { value: string; delta: string; sub: string; }
interface UniqueFeedbackKpi   { value: string; delta: string; sub: string; }
interface TotalFeedbackKpi    { value: string; positivePct: number; negativePct: number; }

interface HeatmapColumn { label: string; topicId: string; }

interface FlaggedCategory {
  id: string;
  name: string;
  pct: number;       // size in treemap (share of flagged volume)
  count: number;     // negative responses
  color: string;
  trending?: boolean;
}

interface FlaggedCollection {
  rank: number;
  title: string;
  prompts: number;
  negativePct: number;
}

type FeedbackTypeIcon =
  | 'alert-triangle'
  | 'message-report'
  | 'circle-x'
  | 'arrows-shuffle'
  | 'target';

interface NegativeFeedbackType {
  title: string;
  reports: number;
  sharePct: number;     // share of all negatives
  icon: FeedbackTypeIcon;
}

interface HeatmapCell {
  /** 0..1 intensity */
  value: number;
}

interface FeedbackData {
  activeUsers: ActiveUsersKpi;
  uniqueWithFeedback: UniqueFeedbackKpi;
  totalFeedback: TotalFeedbackKpi;
  flaggedCategories: FlaggedCategory[][];
  flaggedCollections: FlaggedCollection[];
  topNegativeTypes: NegativeFeedbackType[];
  months: string[];
  yAxisTicks: number[];
  positiveSeries: number[];
  negativeSeries: number[];
  heatmapColumns: HeatmapColumn[];
  heatmapRowsRegion: string[];
  heatmapRowsVpu: string[];
  heatmapDataRegion: number[][];
  heatmapDataVpu: number[][];
}

@Component({
  selector: 'wbct-feedback',
  imports: [TablerIconComponent, RouterLink, HierFilter, DateRangeFilter],
  templateUrl: './feedback.html',
  styleUrl: './feedback.css',
})
export class Feedback {
  // ---- Workspace toggle (WB / IFC) ----
  readonly workspace = signal<Workspace>('wb');
  setWorkspace(w: Workspace) { this.workspace.set(w); }

  // ---- Hierarchical filter catalogs ----
  readonly regionGroups = REGION_GROUPS;
  readonly vpuGroups    = VPU_GROUPS;

  /** Pre-applied Region/Country from `?region=…` / `?country=…` query params
   *  written by the dashboard country drawer's "View Feedback" link. Seeds the
   *  HierFilter on entry so users land with their drawer country pre-filtered. */
  readonly initialRegionCountry = (() => {
    const q = inject(ActivatedRoute).snapshot.queryParamMap;
    return regionCountrySelectionFromParams({ region: q.get('region'), country: q.get('country') });
  })();

  private readonly api = inject(ApiService);

  constructor() {
    this.api.getFeedback<FeedbackData>().pipe(takeUntilDestroyed()).subscribe(d => {
      this.activeUsers.set(d.activeUsers);
      this.uniqueWithFeedback.set(d.uniqueWithFeedback);
      this.totalFeedback.set(d.totalFeedback);
      this.flaggedCategories.set(d.flaggedCategories);
      this.flaggedCollections.set(d.flaggedCollections);
      this.topNegativeTypes.set(d.topNegativeTypes);
      this.months.set(d.months);
      this.yAxisTicks.set(d.yAxisTicks);
      this.positiveSeries.set(d.positiveSeries);
      this.negativeSeries.set(d.negativeSeries);
      this.heatmapColumns.set(d.heatmapColumns);
      this.heatmapRowsRegion.set(d.heatmapRowsRegion);
      this.heatmapRowsVpu.set(d.heatmapRowsVpu);
      this.heatmapDataRegion.set(d.heatmapDataRegion);
      this.heatmapDataVpu.set(d.heatmapDataVpu);
    });
  }

  // ---- Top KPI row — K360 Master Data Extract (Power BI Jan 1 – May 19, 2026) ----
  // 3,095 unique visitors / 30,020 page views; ~28% of visitors leave feedback;
  // 1,496 ≈ 5% of page views ⇒ feedback rate ~25% per AI response.
  readonly activeUsers = signal<ActiveUsersKpi | null>(null);
  readonly uniqueWithFeedback = signal<UniqueFeedbackKpi | null>(null);
  readonly totalFeedback = signal<TotalFeedbackKpi | null>(null);

  // ---- Card 1: Most Flagged Prompt Categories (treemap) ----
  // Same colour language as the Prompts page treemap; pct drives cell size,
  // count is negative responses received in this category.
  readonly flaggedCategories = signal<FlaggedCategory[][]>([]);

  rowFlex = (row: FlaggedCategory[]) => row.reduce((s, t) => s + t.pct, 0);

  // ---- Card 2: Most Flagged Collections (ranked list with % bar) ----
  // Names match K360 featured / largest collections from the Master Data Extract.
  readonly flaggedCollections = signal<FlaggedCollection[]>([]);

  // ---- Card 3: Top Negative Feedback Type (categorical, with icons) ----
  readonly topNegativeTypes = signal<NegativeFeedbackType[]>([]);

  // ---- Feedback Volume Trend (line chart, Jan-Dec) ----
  readonly months = signal<string[]>([]);
  readonly yAxisTicks = signal<number[]>([]);

  // SVG viewBox 720 wide x 260 tall, plot area uses padding
  readonly chartW = 720;
  readonly chartH = 260;
  readonly padL = 36;
  readonly padR = 16;
  readonly padT = 16;
  readonly padB = 36;

  /** Pre-computed positive series values across 12 months. */
  private readonly positiveSeries = signal<number[]>([]);
  private readonly negativeSeries = signal<number[]>([]);

  private toX(i: number): number {
    const plotW = this.chartW - this.padL - this.padR;
    return this.padL + (i / (this.months().length - 1)) * plotW;
  }
  private toY(v: number): number {
    const plotH = this.chartH - this.padT - this.padB;
    return this.padT + (1 - v / 100) * plotH;
  }

  /** Build a smooth Catmull-Rom-style bezier path through the points. */
  private smoothPath(values: number[]): string {
    const pts = values.map((v, i) => ({ x: this.toX(i), y: this.toY(v) }));
    if (pts.length === 0) return '';
    let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  }

  readonly positiveLinePath = computed(() => this.smoothPath(this.positiveSeries()));
  readonly negativeLinePath = computed(() => this.smoothPath(this.negativeSeries()));

  readonly positiveAreaPath = computed(() => {
    const base = this.positiveLinePath();
    const lastX = this.toX(this.months().length - 1);
    const firstX = this.toX(0);
    const baseY = this.chartH - this.padB;
    return `${base} L ${lastX.toFixed(1)},${baseY} L ${firstX.toFixed(1)},${baseY} Z`;
  });

  readonly negativeAreaPath = computed(() => {
    const base = this.negativeLinePath();
    const lastX = this.toX(this.months().length - 1);
    const firstX = this.toX(0);
    const baseY = this.chartH - this.padB;
    return `${base} L ${lastX.toFixed(1)},${baseY} L ${firstX.toFixed(1)},${baseY} Z`;
  });

  // X-axis tick positions
  readonly xTicks = computed(() => this.months().map((m, i) => ({ label: m, x: this.toX(i) })));

  // Y-axis tick positions
  readonly yTicks = computed(() => this.yAxisTicks().map(v => ({ label: v, y: this.toY(v) })));

  // ---- Heatmap: Feedback Friction Areas by Topic Category ----
  readonly heatmapMode = signal<HeatmapMode>('region');
  setHeatmapMode(m: HeatmapMode) { this.heatmapMode.set(m); }

  // Each heat-map column maps to a topic id consumed by the Analysis page
  // (see /prompts/analysis ?topic=…). The two-line `label` is split on `\n`
  // by the column-label template.
  readonly heatmapColumns = signal<HeatmapColumn[]>([]);

  // WBG operating regions (matches Power BI region groupings).
  readonly heatmapRowsRegion = signal<string[]>([]);
  // Real VPU codes from Power BI Adoption-by-VPU table.
  readonly heatmapRowsVpu    = signal<string[]>([]);

  // Intensity per (row, col). 0 = lightest, 1 = darkest red.
  // Match the mockup tones.
  private readonly heatmapDataRegion = signal<number[][]>([]);
  private readonly heatmapDataVpu = signal<number[][]>([]);

  readonly heatmapRows = computed(() =>
    this.heatmapMode() === 'region' ? this.heatmapRowsRegion() : this.heatmapRowsVpu(),
  );

  readonly heatmapData = computed(() =>
    this.heatmapMode() === 'region' ? this.heatmapDataRegion() : this.heatmapDataVpu(),
  );

  /** Map intensity 0..1 to a CSS color along light yellow → red. */
  heatColor(v: number): string {
    // Threshold below which we use a near-transparent yellow.
    if (v < 0.15) return '#FEF3C7';
    if (v < 0.35) return '#FDE68A';
    if (v < 0.55) return '#FCD34D';
    if (v < 0.75) return '#F59E0B';
    return '#DC2626';
  }
}
