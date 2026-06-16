// =============================================================================
// Shared filter catalogs — Region/Country, VPU, Vertical/Sector hierarchies.
// Values sourced from K360_Master_Data_Extract.xlsx (Regions, Verticals, and
// Power BI Adoption-by-VPU tabs). Country lists are truncated to top-by-volume
// entries to keep dropdowns scannable in this mockup; production should hydrate
// from the full WBG country roster.
// =============================================================================

export interface HierGroup {
  /** Stable id used for selection state — usually the region/VPU/vertical code. */
  id: string;
  label: string;
  children: HierLeaf[];
}

export interface HierLeaf {
  /** Stable id used for selection state — ISO code, VPU code, or sector slug. */
  id: string;
  label: string;
}

/**
 * Build a HierFilter initial-selection array from `?region=…` / `?country=…`
 * query params (as written by the dashboard country drawer's "View X" links).
 * - `?region=afe` → returns every country leaf id under the AFE group (which
 *   the HierFilter then renders as a fully-selected region).
 * - `?country=ke` → returns ['ke'].
 */
export function regionCountrySelectionFromParams(
  params: { region?: string | null; country?: string | null },
): string[] {
  const region  = params.region?.toLowerCase()  ?? null;
  const country = params.country?.toLowerCase() ?? null;
  if (region) {
    const group = REGION_GROUPS.find(g => g.id === region);
    return group ? group.children.map(c => c.id) : [];
  }
  if (country) return [country];
  return [];
}

// ----- Region / Country -----
export const REGION_GROUPS: HierGroup[] = [
  {
    id: 'afe',
    label: 'Eastern & Southern Africa (AFE)',
    children: [
      { id: 'ke', label: 'Kenya' },
      { id: 'tz', label: 'Tanzania' },
      { id: 'et', label: 'Ethiopia' },
      { id: 'za', label: 'South Africa' },
      { id: 'ug', label: 'Uganda' },
      { id: 'rw', label: 'Rwanda' },
      { id: 'mz', label: 'Mozambique' },
    ],
  },
  {
    id: 'afw',
    label: 'Western & Central Africa (AFW)',
    children: [
      { id: 'ng', label: 'Nigeria' },
      { id: 'sn', label: 'Senegal' },
      { id: 'ci', label: "Côte d'Ivoire" },
      { id: 'gh', label: 'Ghana' },
      { id: 'cm', label: 'Cameroon' },
      { id: 'ml', label: 'Mali' },
      { id: 'bj', label: 'Benin' },
    ],
  },
  {
    id: 'eap',
    label: 'East Asia & Pacific (EAP)',
    children: [
      { id: 'cn', label: 'China' },
      { id: 'id', label: 'Indonesia' },
      { id: 'vn', label: 'Vietnam' },
      { id: 'ph', label: 'Philippines' },
      { id: 'th', label: 'Thailand' },
      { id: 'my', label: 'Malaysia' },
      { id: 'kh', label: 'Cambodia' },
    ],
  },
  {
    id: 'eca',
    label: 'Europe & Central Asia (ECA)',
    children: [
      { id: 'pl', label: 'Poland' },
      { id: 'tr', label: 'Türkiye' },
      { id: 'ua', label: 'Ukraine' },
      { id: 'ro', label: 'Romania' },
      { id: 'uz', label: 'Uzbekistan' },
      { id: 'kz', label: 'Kazakhstan' },
    ],
  },
  {
    id: 'lac',
    label: 'Latin America & Caribbean (LCR)',
    children: [
      { id: 'br', label: 'Brazil' },
      { id: 'mx', label: 'Mexico' },
      { id: 'co', label: 'Colombia' },
      { id: 'ar', label: 'Argentina' },
      { id: 'pe', label: 'Peru' },
      { id: 'cl', label: 'Chile' },
    ],
  },
  {
    id: 'mna',
    label: 'Middle East, North Africa, AFG & PAK (MENAAP)',
    children: [
      { id: 'eg', label: 'Egypt' },
      { id: 'ma', label: 'Morocco' },
      { id: 'tn', label: 'Tunisia' },
      { id: 'jo', label: 'Jordan' },
      { id: 'dz', label: 'Algeria' },
      { id: 'iq', label: 'Iraq' },
      { id: 'af', label: 'Afghanistan' },
      { id: 'pk', label: 'Pakistan' },
    ],
  },
  {
    id: 'sar',
    label: 'South Asia (SAR)',
    children: [
      { id: 'in', label: 'India' },
      { id: 'bd', label: 'Bangladesh' },
      { id: 'lk', label: 'Sri Lanka' },
      { id: 'np', label: 'Nepal' },
      { id: 'bt', label: 'Bhutan' },
      { id: 'mv', label: 'Maldives' },
    ],
  },
];

// ----- VPU groups / codes (authoritative WBG + IFC VPU catalogue) -----
// Leaf ids are prefixed with `vpu-` so they remain unique across catalogs
// (the regional VPU codes overlap with the REGION_GROUPS ISO codes).
export const VPU_GROUPS: HierGroup[] = [
  {
    id: 'regional-vpu',
    label: 'Regional VPUs',
    children: [
      { id: 'vpu-afe',    label: 'AFE — Eastern & Southern Africa' },
      { id: 'vpu-afw',    label: 'AFW — Western & Central Africa' },
      { id: 'vpu-eap',    label: 'EAP — East Asia & Pacific' },
      { id: 'vpu-eca',    label: 'ECA — Europe & Central Asia' },
      { id: 'vpu-lac',    label: 'LAC — Latin America & Caribbean' },
      { id: 'vpu-mna',    label: 'MNA — Middle East & North Africa' },
      { id: 'vpu-sar',    label: 'SAR — South Asia' },
      { id: 'vpu-global', label: 'GLOBAL — Global / Cross-Regional' },
    ],
  },
  {
    id: 'planet-vpu',
    label: 'Planet VPUs',
    children: [
      { id: 'vpu-sca', label: 'SCA — Climate Change' },
      { id: 'vpu-ggw', label: 'GGW — Water Global Practice' },
      { id: 'vpu-gge', label: 'GGE — Environment' },
      { id: 'vpu-ggp', label: 'GGP — Social Sustainability & Inclusion' },
      { id: 'vpu-ggt', label: 'GGT — Transport' },
      { id: 'vpu-ggi', label: 'GGI — Infrastructure' },
      { id: 'vpu-ggd', label: 'GGD — Digital Development' },
      { id: 'vpu-see', label: 'SEE — Energy & Extractives' },
    ],
  },
  {
    id: 'prosperity-vpu',
    label: 'Prosperity VPUs',
    children: [
      { id: 'vpu-efi', label: 'EFI — Equitable Growth, Finance & Institutions' },
      { id: 'vpu-fci', label: 'FCI — Finance, Competitiveness & Innovation' },
      { id: 'vpu-mti', label: 'MTI — Macroeconomics, Trade & Investment' },
      { id: 'vpu-gov', label: 'GOV — Governance' },
      { id: 'vpu-pov', label: 'POV — Poverty & Equity' },
    ],
  },
  {
    id: 'people-vpu',
    label: 'People VPUs',
    children: [
      { id: 'vpu-edu', label: 'EDU — Education' },
      { id: 'vpu-hea', label: 'HEA — Health, Nutrition & Population' },
      { id: 'vpu-spl', label: 'SPL — Social Protection & Jobs' },
      { id: 'vpu-gen', label: 'GEN — Gender' },
      { id: 'vpu-urb', label: 'URB — Urban, Resilience & Land' },
    ],
  },
  {
    id: 'ifc-vpu',
    label: 'IFC VPUs',
    children: [
      { id: 'vpu-ifca',     label: 'IFCA — IFC Africa' },
      { id: 'vpu-ifcap',    label: 'IFCAP — IFC Asia Pacific' },
      { id: 'vpu-ifceu',    label: 'IFCEU — IFC Europe' },
      { id: 'vpu-ifclac',   label: 'IFCLAC — IFC Latin America & Caribbean' },
      { id: 'vpu-ifcmna',   label: 'IFCMNA — IFC Middle East & North Africa' },
      { id: 'vpu-ifcfig',   label: 'IFCFIG — IFC Financial Institutions Group' },
      { id: 'vpu-ifcinfra', label: 'IFCINFRA — IFC Infrastructure' },
      { id: 'vpu-ifcmas',   label: 'IFCMAS — IFC Manufacturing, Agribusiness & Services' },
    ],
  },
  {
    id: 'knowledge-corporate-vpu',
    label: 'Knowledge / Operations / Corporate VPUs',
    children: [
      { id: 'vpu-opcs', label: 'OPCS — Operations Policy & Country Services' },
      { id: 'vpu-ieg',  label: 'IEG — Independent Evaluation Group' },
      { id: 'vpu-dec',  label: 'DEC — Development Economics' },
      { id: 'vpu-wfa',  label: 'WFA — Finance & Accounting' },
      { id: 'vpu-hrd',  label: 'HRD — Human Resources' },
      { id: 'vpu-its',  label: 'ITS — Information & Technology Solutions' },
      { id: 'vpu-leg',  label: 'LEG — Legal' },
      { id: 'vpu-tre',  label: 'TRE — Treasury' },
      { id: 'vpu-csr',  label: 'CSR — Corporate Services' },
      { id: 'vpu-ext',  label: 'EXT — External & Corporate Relations' },
    ],
  },
  {
    id: 'country-operational-vpu',
    label: 'Country / Operational VPUs',
    children: [
      { id: 'vpu-afce1', label: 'AFCE1 — Eastern & Southern Africa Country Unit 1' },
      { id: 'vpu-afce2', label: 'AFCE2 — Eastern & Southern Africa Country Unit 2' },
      { id: 'vpu-afce3', label: 'AFCE3 — Eastern & Southern Africa Country Unit 3' },
      { id: 'vpu-afww1', label: 'AFWW1 — Western & Central Africa Country Unit 1' },
      { id: 'vpu-afww2', label: 'AFWW2 — Western & Central Africa Country Unit 2' },
      { id: 'vpu-sacfp', label: 'SACFP — South Asia Country Fiscal & Policy' },
      { id: 'vpu-mncpx', label: 'MNCPX — MENA Country Practice Unit' },
      { id: 'vpu-ggodr', label: 'GGODR — Governance Global Operations & Data' },
      { id: 'vpu-eaec1', label: 'EAEC1 — East Asia & Pacific Country Unit 1' },
      { id: 'vpu-lcc1c', label: 'LCC1C — Latin America Country Cluster' },
      { id: 'vpu-ecceu', label: 'ECCEU — Europe & Central Asia Country Unit' },
    ],
  },
  {
    id: 'matrix-vpu',
    label: 'Additional Operational / Matrix VPUs',
    children: [
      { id: 'vpu-ggh',  label: 'GGH — Health Global Practice' },
      { id: 'vpu-ggf',  label: 'GGF — Finance Global Practice' },
      { id: 'vpu-ggs',  label: 'GGS — Social Sustainability' },
      { id: 'vpu-glc',  label: 'GLC — Fragility, Conflict & Violence' },
      { id: 'vpu-adm',  label: 'ADM — Administration' },
      { id: 'vpu-knw',  label: 'KNW — Knowledge & Learning' },
      { id: 'vpu-rsk',  label: 'RSK — Risk Management' },
      { id: 'vpu-aud',  label: 'AUD — Internal Audit' },
      { id: 'vpu-sec',  label: 'SEC — Security' },
      { id: 'vpu-com',  label: 'COM — Communications' },
      { id: 'vpu-str',  label: 'STR — Strategy' },
      { id: 'vpu-aiu',  label: 'AIU — AI & Innovation Unit' },
      { id: 'vpu-dime', label: 'DIME — Development Impact Evaluation' },
      { id: 'vpu-asa',  label: 'ASA — Advisory Services & Analytics' },
    ],
  },
];

// ----- Vertical / Sector (K360 Verticals sheet) -----
export const VERTICAL_GROUPS: HierGroup[] = [
  {
    id: 'digital-ai',
    label: 'Digital and AI',
    children: [
      { id: 'data-ai',          label: 'Data and AI' },
      { id: 'digital-access',   label: 'Digital Access' },
      { id: 'digital-apps',     label: 'Digital Applications' },
      { id: 'digital-pubinfra', label: 'Digital Public Infrastructure' },
    ],
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    children: [
      { id: 'cities-drm',  label: 'Cities, Subnational Finance, DRM, Tourism' },
      { id: 'energy',      label: 'Energy' },
      { id: 'mining',      label: 'Metals and Minerals' },
      { id: 'transport',   label: 'Transport and Logistics' },
    ],
  },
  {
    id: 'people',
    label: 'People',
    children: [
      { id: 'education',       label: 'Education and Skills' },
      { id: 'gender',          label: 'Gender' },
      { id: 'health',          label: 'Health' },
      { id: 'social-policy',   label: 'Social Policy' },
    ],
  },
  {
    id: 'planet',
    label: 'Planet',
    children: [
      { id: 'climate',     label: 'Climate' },
      { id: 'environment', label: 'Environment' },
    ],
  },
  {
    id: 'prosperity',
    label: 'Prosperity',
    children: [
      { id: 'fiscal-policy',  label: 'Fiscal Policy and Growth' },
      { id: 'trade-business', label: 'Trade, Competition, and Business' },
      { id: 'finance',        label: 'Finance' },
    ],
  },
  {
    id: 'other-vert',
    label: 'Other',
    children: [
      { id: 'fcv',         label: 'Fragility, Conflict and Violence' },
      { id: 'other-other', label: 'Other' },
    ],
  },
];
