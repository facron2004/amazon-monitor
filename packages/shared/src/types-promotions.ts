export const promotionPlanTypes = [
  "prime_day",
  "black_friday",
  "cyber_monday",
  "deal",
  "coupon",
  "seasonal",
  "custom"
] as const;

export type PromotionPlanType = (typeof promotionPlanTypes)[number];

export const promotionPlanStatuses = ["planned", "ready", "completed", "cancelled"] as const;
export type PromotionPlanStatus = (typeof promotionPlanStatuses)[number];

export const promotionMonitorStates = [
  "preparation_due",
  "upcoming",
  "active",
  "review_due",
  "completed",
  "cancelled"
] as const;

export type PromotionMonitorState = (typeof promotionMonitorStates)[number];
export type PromotionTaskKind = "preparation" | "review";

export interface PromotionPlan {
  id: number;
  orgId: number;
  storeId: number | null;
  storeName: string | null;
  productId: number | null;
  sku: string | null;
  asin: string | null;
  brand: string | null;
  name: string;
  type: PromotionPlanType;
  marketplace: string;
  startDate: string;
  endDate: string;
  status: PromotionPlanStatus;
  targetPrice: number | null;
  budget: number | null;
  inventoryTarget: number | null;
  notes: string | null;
  preparationTaskId: number | null;
  reviewTaskId: number | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionPlanView extends PromotionPlan {
  monitorState: PromotionMonitorState;
  daysUntilStart: number;
}

export interface PromotionPlanListFilter {
  orgId: number;
  storeId?: number;
  productId?: number;
  status?: PromotionPlanStatus;
  fromDate?: string;
  toDate?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface CreatePromotionPlanInput {
  orgId: number;
  storeId?: number | null;
  productId?: number | null;
  name: string;
  type: PromotionPlanType;
  marketplace: string;
  startDate: string;
  endDate: string;
  status?: PromotionPlanStatus;
  targetPrice?: number | null;
  budget?: number | null;
  inventoryTarget?: number | null;
  notes?: string | null;
  createdBy?: number | null;
}

export type UpdatePromotionPlanInput = Partial<Omit<CreatePromotionPlanInput, "orgId" | "createdBy">>;

const DAY_MS = 86_400_000;

export function buildPromotionPlanView(plan: PromotionPlan, asOf: string): PromotionPlanView {
  const daysUntilStart = Math.ceil((dateUtc(plan.startDate) - dateUtc(asOf)) / DAY_MS);
  let monitorState: PromotionMonitorState;
  if (plan.status === "cancelled") monitorState = "cancelled";
  else if (plan.status === "completed") monitorState = "completed";
  else if (asOf > plan.endDate) monitorState = "review_due";
  else if (asOf >= plan.startDate) monitorState = "active";
  else if (daysUntilStart <= 7 && plan.status !== "ready") monitorState = "preparation_due";
  else monitorState = "upcoming";
  return { ...plan, monitorState, daysUntilStart };
}

function dateUtc(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}
