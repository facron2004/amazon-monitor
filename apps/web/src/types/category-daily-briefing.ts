import type { Component } from "vue";
import type {
  BestsellerRankSnapshot,
  BrandMatrixSnapshot,
  CompetitorActivityEvent,
} from "@amazon-monitor/shared";

export interface BattleKpi {
  label: string;
  value: string | number;
  note: string;
  tone: "new" | "rise" | "fall" | "activity" | "price" | "brand";
  icon?: Component;
}

export interface CategoryBriefingIcons {
  new?: Component;
  rise?: Component;
  fall?: Component;
  activity?: Component;
  price?: Component;
  brand?: Component;
}

export interface InsightCard {
  key: string;
  event: CompetitorActivityEvent;
  snapshot: BestsellerRankSnapshot | null;
  title: string;
  asin: string | null;
  brand: string;
  tag: string;
  rankBefore: number | null;
  rankAfter: number | null;
  rankDelta: number | null;
  priceBefore: number | null;
  priceAfter: number | null;
  promo: string;
  reviewDelta: number | null;
  score: number;
}

export interface OpportunityCard {
  snapshot: BestsellerRankSnapshot;
  score: number;
  reason: string;
}

export type DrawerState =
  | { mode: "event"; item: InsightCard }
  | { mode: "brand"; item: BrandMatrixSnapshot }
  | { mode: "opportunity"; item: OpportunityCard }
  | null;

export interface LaneEvent {
  event: CompetitorActivityEvent;
  asin: string | null;
  brand: string;
  rankDelta: number | null;
  changeLabel: string;
}

export interface ReviewGrowthBrandTotal {
  brand: string;
  totalGrowth: number;
  asinCount: number;
}
