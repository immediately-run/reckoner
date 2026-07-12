// Meridian-derived seed data — GENERATED from docs/case-study/meridian/data/*.csv.
// Regenerate with: node scripts/gen-seed-data.mjs — do not hand-edit.
// Frozen frames for the bundled demo document (ARCHITECTURE_PLAN §3): the real, verified
// Meridian figures (generate.py, seed=20260709), sliced to the last 12 months (+ 4 cohorts).
// This is content the engine consumes as `fixtures.*` externals — not code.

import type { Row } from '../stdlib/types.ts';

export const latestMonth = "2026-06";

export const execSummary: Row[] = [
  {
    "month": "2025-07",
    "mrr": 340019,
    "momGrowthPct": 4.5,
    "nrrPct": 98.3,
    "grossChurnPct": 2.1,
    "vsTargetBasePct": null
  },
  {
    "month": "2025-08",
    "mrr": 354432,
    "momGrowthPct": 4.2,
    "nrrPct": 102.6,
    "grossChurnPct": 1.8,
    "vsTargetBasePct": null
  },
  {
    "month": "2025-09",
    "mrr": 323657,
    "momGrowthPct": -8.7,
    "nrrPct": 90.4,
    "grossChurnPct": 10.1,
    "vsTargetBasePct": null
  },
  {
    "month": "2025-10",
    "mrr": 334555,
    "momGrowthPct": 3.4,
    "nrrPct": 99.1,
    "grossChurnPct": 1.9,
    "vsTargetBasePct": null
  },
  {
    "month": "2025-11",
    "mrr": 324088,
    "momGrowthPct": -3.1,
    "nrrPct": 94.1,
    "grossChurnPct": 7.3,
    "vsTargetBasePct": null
  },
  {
    "month": "2025-12",
    "mrr": 328068,
    "momGrowthPct": 1.2,
    "nrrPct": 96.1,
    "grossChurnPct": 3.5,
    "vsTargetBasePct": null
  },
  {
    "month": "2026-01",
    "mrr": 356112,
    "momGrowthPct": 8.6,
    "nrrPct": 101.9,
    "grossChurnPct": 2.8,
    "vsTargetBasePct": null
  },
  {
    "month": "2026-02",
    "mrr": 381281,
    "momGrowthPct": 7.1,
    "nrrPct": 102.6,
    "grossChurnPct": 1.6,
    "vsTargetBasePct": null
  },
  {
    "month": "2026-03",
    "mrr": 474298,
    "momGrowthPct": 24.4,
    "nrrPct": 99.6,
    "grossChurnPct": 6.9,
    "vsTargetBasePct": null
  },
  {
    "month": "2026-04",
    "mrr": 439061,
    "momGrowthPct": -7.4,
    "nrrPct": 92.6,
    "grossChurnPct": 9.6,
    "vsTargetBasePct": null
  },
  {
    "month": "2026-05",
    "mrr": 388924,
    "momGrowthPct": -11.4,
    "nrrPct": 88.6,
    "grossChurnPct": 12.9,
    "vsTargetBasePct": null
  },
  {
    "month": "2026-06",
    "mrr": 409994,
    "momGrowthPct": 5.4,
    "nrrPct": 105.4,
    "grossChurnPct": 6.1,
    "vsTargetBasePct": null
  }
];

export const mrrMovements: Row[] = [
  {
    "month": "2025-07",
    "newMrr": 20226,
    "expansion": 5182,
    "contraction": -4156,
    "churned": -6666,
    "reactivation": 0,
    "endMrr": 340019
  },
  {
    "month": "2025-08",
    "newMrr": 5519,
    "expansion": 15173,
    "contraction": -247,
    "churned": -6032,
    "reactivation": 0,
    "endMrr": 354432
  },
  {
    "month": "2025-09",
    "newMrr": 3219,
    "expansion": 4966,
    "contraction": -3103,
    "churned": -35856,
    "reactivation": 0,
    "endMrr": 323657
  },
  {
    "month": "2025-10",
    "newMrr": 8617,
    "expansion": 4149,
    "contraction": -887,
    "churned": -6292,
    "reactivation": 5310,
    "endMrr": 334555
  },
  {
    "month": "2025-11",
    "newMrr": 6783,
    "expansion": 5701,
    "contraction": -1146,
    "churned": -24324,
    "reactivation": 2520,
    "endMrr": 324088
  },
  {
    "month": "2025-12",
    "newMrr": 16744,
    "expansion": 3462,
    "contraction": -5017,
    "churned": -11210,
    "reactivation": 0,
    "endMrr": 328068
  },
  {
    "month": "2026-01",
    "newMrr": 21732,
    "expansion": 17598,
    "contraction": -2102,
    "churned": -9183,
    "reactivation": 0,
    "endMrr": 356112
  },
  {
    "month": "2026-02",
    "newMrr": 15386,
    "expansion": 17897,
    "contraction": -2934,
    "churned": -5829,
    "reactivation": 650,
    "endMrr": 381281
  },
  {
    "month": "2026-03",
    "newMrr": 93831,
    "expansion": 28032,
    "contraction": -3152,
    "churned": -26268,
    "reactivation": 575,
    "endMrr": 474298
  },
  {
    "month": "2026-04",
    "newMrr": 0,
    "expansion": 13768,
    "contraction": -3390,
    "churned": -45615,
    "reactivation": 0,
    "endMrr": 439061
  },
  {
    "month": "2026-05",
    "newMrr": 0,
    "expansion": 7569,
    "contraction": -1183,
    "churned": -56524,
    "reactivation": 0,
    "endMrr": 388924
  },
  {
    "month": "2026-06",
    "newMrr": 0,
    "expansion": 46764,
    "contraction": -2062,
    "churned": -23632,
    "reactivation": 0,
    "endMrr": 409994
  }
];

export const regionCustomers: Row[] = [
  {
    "region": "amer",
    "customers": 48,
    "seats": 1458
  },
  {
    "region": "emea",
    "customers": 40,
    "seats": 1305
  }
];

export const cohortRetention: Row[] = [
  {
    "cohort": "2024-01",
    "offset": 0,
    "retentionPct": 100
  },
  {
    "cohort": "2024-01",
    "offset": 1,
    "retentionPct": 100
  },
  {
    "cohort": "2024-01",
    "offset": 2,
    "retentionPct": 100
  },
  {
    "cohort": "2024-01",
    "offset": 3,
    "retentionPct": 100
  },
  {
    "cohort": "2024-01",
    "offset": 4,
    "retentionPct": 100
  },
  {
    "cohort": "2024-01",
    "offset": 5,
    "retentionPct": 100
  },
  {
    "cohort": "2024-01",
    "offset": 6,
    "retentionPct": 100
  },
  {
    "cohort": "2024-01",
    "offset": 7,
    "retentionPct": 100
  },
  {
    "cohort": "2024-01",
    "offset": 8,
    "retentionPct": 100
  },
  {
    "cohort": "2024-01",
    "offset": 9,
    "retentionPct": 100
  },
  {
    "cohort": "2024-01",
    "offset": 10,
    "retentionPct": 100
  },
  {
    "cohort": "2024-01",
    "offset": 11,
    "retentionPct": 100
  },
  {
    "cohort": "2024-06",
    "offset": 0,
    "retentionPct": 100
  },
  {
    "cohort": "2024-06",
    "offset": 1,
    "retentionPct": 100
  },
  {
    "cohort": "2024-06",
    "offset": 2,
    "retentionPct": 100
  },
  {
    "cohort": "2024-06",
    "offset": 3,
    "retentionPct": 100
  },
  {
    "cohort": "2024-06",
    "offset": 4,
    "retentionPct": 100
  },
  {
    "cohort": "2024-06",
    "offset": 5,
    "retentionPct": 100
  },
  {
    "cohort": "2024-06",
    "offset": 6,
    "retentionPct": 100
  },
  {
    "cohort": "2024-06",
    "offset": 7,
    "retentionPct": 100
  },
  {
    "cohort": "2024-06",
    "offset": 8,
    "retentionPct": 83.3
  },
  {
    "cohort": "2024-06",
    "offset": 9,
    "retentionPct": 83.3
  },
  {
    "cohort": "2024-06",
    "offset": 10,
    "retentionPct": 83.3
  },
  {
    "cohort": "2024-06",
    "offset": 11,
    "retentionPct": 83.3
  },
  {
    "cohort": "2025-01",
    "offset": 0,
    "retentionPct": 100
  },
  {
    "cohort": "2025-01",
    "offset": 1,
    "retentionPct": 100
  },
  {
    "cohort": "2025-01",
    "offset": 2,
    "retentionPct": 100
  },
  {
    "cohort": "2025-01",
    "offset": 3,
    "retentionPct": 100
  },
  {
    "cohort": "2025-01",
    "offset": 4,
    "retentionPct": 100
  },
  {
    "cohort": "2025-01",
    "offset": 5,
    "retentionPct": 100
  },
  {
    "cohort": "2025-01",
    "offset": 6,
    "retentionPct": 100
  },
  {
    "cohort": "2025-01",
    "offset": 7,
    "retentionPct": 100
  },
  {
    "cohort": "2025-01",
    "offset": 8,
    "retentionPct": 100
  },
  {
    "cohort": "2025-01",
    "offset": 9,
    "retentionPct": 100
  },
  {
    "cohort": "2025-01",
    "offset": 10,
    "retentionPct": 100
  },
  {
    "cohort": "2025-01",
    "offset": 11,
    "retentionPct": 100
  },
  {
    "cohort": "2025-06",
    "offset": 0,
    "retentionPct": 100
  },
  {
    "cohort": "2025-06",
    "offset": 1,
    "retentionPct": 100
  },
  {
    "cohort": "2025-06",
    "offset": 2,
    "retentionPct": 100
  },
  {
    "cohort": "2025-06",
    "offset": 3,
    "retentionPct": 100
  },
  {
    "cohort": "2025-06",
    "offset": 4,
    "retentionPct": 100
  },
  {
    "cohort": "2025-06",
    "offset": 5,
    "retentionPct": 100
  },
  {
    "cohort": "2025-06",
    "offset": 6,
    "retentionPct": 100
  },
  {
    "cohort": "2025-06",
    "offset": 7,
    "retentionPct": 100
  },
  {
    "cohort": "2025-06",
    "offset": 8,
    "retentionPct": 100
  },
  {
    "cohort": "2025-06",
    "offset": 9,
    "retentionPct": 100
  },
  {
    "cohort": "2025-06",
    "offset": 10,
    "retentionPct": 100
  },
  {
    "cohort": "2025-06",
    "offset": 11,
    "retentionPct": 100
  }
];

export const targets: Row[] = [
  {
    "month": "2025-07",
    "mrrBase": 139911
  },
  {
    "month": "2025-08",
    "mrrBase": 142351
  },
  {
    "month": "2025-09",
    "mrrBase": 144791
  },
  {
    "month": "2025-10",
    "mrrBase": 147231
  },
  {
    "month": "2025-11",
    "mrrBase": 149672
  },
  {
    "month": "2025-12",
    "mrrBase": 152112
  },
  {
    "month": "2026-01",
    "mrrBase": 154552
  },
  {
    "month": "2026-02",
    "mrrBase": 156993
  },
  {
    "month": "2026-03",
    "mrrBase": 159433
  },
  {
    "month": "2026-04",
    "mrrBase": 161873
  },
  {
    "month": "2026-05",
    "mrrBase": 164314
  },
  {
    "month": "2026-06",
    "mrrBase": 166754
  }
];

