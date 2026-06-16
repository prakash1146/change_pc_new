import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ApiService } from '../../core/services/api.service';
import { RouterLink } from '@angular/router';

type KptTab = 'knowledge' | 'people' | 'tasks';

interface PerfKpi {
  title: string;
  value: string;
  delta?: string;
  deltaPositiveIsGood?: boolean;
  sub?: string;
}

interface TreemapTopic {
  id: string;
  name: string;
  pct: number;
  count: number;
  color: string;
  topicId: string;
  trending?: boolean;
}

interface PerformanceData {
  kpis: PerfKpi[];
  kptTabDefs?: { id: KptTab; label: string }[];
  knowledgeNoAnswer: TreemapTopic[][];
  peopleNoAnswer: TreemapTopic[][];
  tasksNoAnswer: TreemapTopic[][];
}

@Component({
  selector: 'wbct-performance',
  imports: [RouterLink, TablerIconComponent],
  templateUrl: './performance.html',
  styleUrl: './performance.css',
})
export class Performance {
  private readonly api = inject(ApiService);

  readonly kpis = signal<PerfKpi[]>([]);

  deltaClass(kpi: PerfKpi): string {
    if (!kpi.delta) return '';
    const isPositive = kpi.delta.startsWith('+');
    return (isPositive === kpi.deltaPositiveIsGood) ? 'delta-good' : 'delta-bad';
  }

  // ----- No Answer Prompt Categories treemap -----
  readonly kptTabDefs = signal<{ id: KptTab; label: string }[]>([]);
  readonly activeTab = signal<KptTab>('knowledge');
  
  private readonly knowledgeNoAnswer = signal<TreemapTopic[][]>([]);
  private readonly peopleNoAnswer = signal<TreemapTopic[][]>([]);
  private readonly tasksNoAnswer = signal<TreemapTopic[][]>([]);

  constructor() {
    this.api.getPerformance<PerformanceData>().pipe(takeUntilDestroyed()).subscribe(d => {
      this.kpis.set(d.kpis);
      if (d.kptTabDefs) this.kptTabDefs.set(d.kptTabDefs);
      this.knowledgeNoAnswer.set(d.knowledgeNoAnswer);
      this.peopleNoAnswer.set(d.peopleNoAnswer);
      this.tasksNoAnswer.set(d.tasksNoAnswer);
    });
  }

  readonly activeTreemap = computed<TreemapTopic[][]>(() => {
    switch (this.activeTab()) {
      case 'people': return this.peopleNoAnswer();
      case 'tasks':  return this.tasksNoAnswer();
      default:       return this.knowledgeNoAnswer();
    }
  });

  rowFlex(row: TreemapTopic[]): number {
    return row.reduce((s, t) => s + t.pct, 0);
  }
}
