export type KeywordRankMatrixProductKind = "owned" | "competitor";

export interface KeywordRankMatrixProduct {
  key: string;
  asin: string;
  marketplace: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  kind: KeywordRankMatrixProductKind;
  isKeyCompetitor: boolean;
}

export interface KeywordRankMatrixCell {
  productKey: string;
  currentOrganicRank: number | null;
  previousOrganicRank: number | null;
  sevenDayOrganicRank: number | null;
  sevenDayRankChange: number | null;
  sponsoredRank: number | null;
  isSponsored: boolean;
  isAmazonChoice: null;
  isBestSeller: null;
  hasBestsellerRank: boolean;
  hasCoupon: boolean;
  hasDeal: boolean;
}

export interface KeywordRankMatrixRow {
  keywordId: number;
  keyword: string;
  priority: import("./types-monitors.js").KeywordPriority;
  marketplace: string;
  categoryTag: string | null;
  cells: KeywordRankMatrixCell[];
}

export interface KeywordRankMatrixResponse {
  requestedDate: string;
  date: string | null;
  previousDate: string | null;
  sevenDayDate: string | null;
  isFallback: boolean;
  products: KeywordRankMatrixProduct[];
  rows: KeywordRankMatrixRow[];
}

export interface KeywordRankMatrixProductReference {
  asin: string;
  marketplace: string;
  kind: KeywordRankMatrixProductKind;
  isKeyCompetitor?: boolean;
}
