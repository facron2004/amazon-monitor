import type { BsrRankHistory, BsrSnapshotQuality, BsrSourceType } from "@amazon-monitor/shared";

export interface BsrRankHistoryRow {
  id: number;
  snapshot_date: string;
  source_type: BsrSourceType;
  source_id: number | null;
  source_name: string;
  marketplace: string;
  asin: string;
  title: string;
  brand: string | null;
  category: string;
  rank_no: number;
  rank_url: string | null;
  product_url: string | null;
  current_price: number | null;
  parent_rank: number | null;
  is_specific_rank: number;
  created_at: string;
}

export function mapBsrRankHistory(row: BsrRankHistoryRow): BsrRankHistory {
  return {
    id: row.id,
    snapshotDate: row.snapshot_date,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceName: row.source_name,
    marketplace: row.marketplace,
    asin: row.asin,
    title: row.title,
    brand: row.brand,
    category: row.category,
    rank: row.rank_no,
    rankUrl: row.rank_url,
    productUrl: row.product_url,
    currentPrice: row.current_price,
    parentRank: row.parent_rank,
    isSpecificRank: Boolean(row.is_specific_rank),
    createdAt: row.created_at
  };
}

export interface BsrSnapshotQualityRow {
  id: number;
  snapshot_date: string;
  source_type: BsrSourceType;
  source_id: number | null;
  source_name: string;
  marketplace: string;
  category: string;
  expected_count: number | null;
  actual_count: number;
  unique_asin_count: number;
  unique_rank_count: number;
  min_rank: number | null;
  max_rank: number | null;
  quality_status: BsrSnapshotQuality["qualityStatus"];
  issue: string | null;
  created_at: string;
}

export function mapBsrSnapshotQuality(row: BsrSnapshotQualityRow): BsrSnapshotQuality {
  return {
    id: row.id,
    snapshotDate: row.snapshot_date,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceName: row.source_name,
    marketplace: row.marketplace,
    category: row.category,
    expectedCount: row.expected_count,
    actualCount: row.actual_count,
    uniqueAsinCount: row.unique_asin_count,
    uniqueRankCount: row.unique_rank_count,
    minRank: row.min_rank,
    maxRank: row.max_rank,
    qualityStatus: row.quality_status,
    issue: row.issue,
    createdAt: row.created_at
  };
}
