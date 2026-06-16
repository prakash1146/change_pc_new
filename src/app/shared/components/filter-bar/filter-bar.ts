import { Component, computed, signal } from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';

type FilterName = 'date' | 'country' | 'vpu' | 'sector' | null;

interface CountryGroup {
  code: string;
  region: string;
  countries: string[];
}

@Component({
  selector: 'wbct-filter-bar',
  imports: [TablerIconComponent],
  templateUrl: './filter-bar.html',
  styleUrl: './filter-bar.css',
})
export class FilterBar {
  readonly openFilter = signal<FilterName>(null);
  readonly searchQuery = signal('');

  // Date Range (presets)
  readonly dateRanges = [
    'Last 7 Days',
    'Last 30 Days',
    'Dec 2025 – Jan 2026',
    'Jan – May 2026',
    'Custom Range',
  ];
  readonly selectedDate = signal('Jan – May 2026');

  // Country (grouped by region — unchanged)
  readonly selectedCountry = signal('Global');

  readonly countryGroups: CountryGroup[] = [
    {
      code: 'AFR',
      region: 'Sub-Saharan Africa',
      countries: [
        "Côte d'Ivoire",
        'Ethiopia',
        'Ghana',
        'Kenya',
        'Mozambique',
        'Nigeria',
        'Senegal',
        'South Africa',
        'Tanzania',
      ],
    },
    {
      code: 'EAP',
      region: 'East Asia & Pacific',
      countries: ['Cambodia', 'China', 'Indonesia', 'Philippines', 'Thailand', 'Vietnam'],
    },
    {
      code: 'ECA',
      region: 'Europe & Central Asia',
      countries: ['Türkiye', 'Ukraine', 'Uzbekistan'],
    },
    {
      code: 'LAC',
      region: 'Latin America & Caribbean',
      countries: ['Argentina', 'Brazil', 'Colombia', 'Mexico', 'Peru'],
    },
    {
      code: 'MNA',
      region: 'Middle East & North Africa',
      countries: ['Egypt'],
    },
    {
      code: 'SAR',
      region: 'South Asia',
      countries: ['Afghanistan', 'Bangladesh', 'India', 'Pakistan'],
    },
  ];

  // VPU (top 13 by visit volume)
  readonly selectedVpu = signal('All');
  readonly vpus = [
    'All', 'AFWW1', 'AFCE2', 'AFCE1', 'AECE1', 'AECE2',
    'GGODR', 'AECE3', 'SACFP', 'MNCGE', 'MNCPX', 'MNCMU', 'EACES', 'AFCW2',
  ];

  // Sector
  readonly selectedSector = signal('All');
  readonly sectors = [
    'All', 'Digital and AI', 'Infrastructure', 'People',
    'Planet', 'Prosperity', 'Fragility and Conflict', 'Other',
  ];


  // Computed labels
  readonly dateLabel = computed(() => this.selectedDate());

  readonly countryLabel = computed(() => this.selectedCountry());

  readonly vpuLabel = computed(() => this.selectedVpu());

  readonly sectorLabel = computed(() => this.selectedSector());

  // Filtered lists (for search)
  readonly filteredCountryGroups = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.countryGroups;
    return this.countryGroups
      .map((g) => ({
        ...g,
        countries: g.countries.filter(
          (c) => c.toLowerCase().includes(q) || g.region.toLowerCase().includes(q) || g.code.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.countries.length > 0);
  });

  readonly filteredVpus = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.vpus;
    return this.vpus.filter((v) => v.toLowerCase().includes(q));
  });

  readonly hasCountryMatches = computed(() => this.filteredCountryGroups().length > 0);
  readonly hasVpuMatches = computed(() => this.filteredVpus().length > 0);

  toggleFilter(name: Exclude<FilterName, null>) {
    this.openFilter.update((c) => (c === name ? null : name));
    this.searchQuery.set('');
  }

  closeFilter() {
    this.openFilter.set(null);
    this.searchQuery.set('');
  }

  onSearchInput(value: string) { this.searchQuery.set(value); }

  pickDate(r: string)    { this.selectedDate.set(r);    this.closeFilter(); }
  pickCountry(c: string) { this.selectedCountry.set(c); this.closeFilter(); }
  pickVpu(v: string)     { this.selectedVpu.set(v);     this.closeFilter(); }
  pickSector(s: string)  { this.selectedSector.set(s);  this.closeFilter(); }
}
