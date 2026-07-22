export const commerceStorePlatforms = ["amazon"] as const;
export type CommerceStorePlatform = (typeof commerceStorePlatforms)[number];

export const commerceStoreStatuses = ["active", "paused"] as const;
export type CommerceStoreStatus = (typeof commerceStoreStatuses)[number];

export const commerceStoreAuthStatuses = ["not_connected", "connected", "attention", "expired"] as const;
export type CommerceStoreAuthStatus = (typeof commerceStoreAuthStatuses)[number];

export interface CommerceStore {
  id: number;
  orgId: number;
  name: string;
  platform: CommerceStorePlatform;
  marketplace: string;
  sellerId: string;
  authStatus: CommerceStoreAuthStatus;
  status: CommerceStoreStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CommerceStoreListFilter {
  orgId?: number;
  marketplace?: string;
  status?: CommerceStoreStatus;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface CreateCommerceStoreInput {
  orgId: number;
  name: string;
  platform?: CommerceStorePlatform;
  marketplace: string;
  sellerId: string;
  authStatus?: CommerceStoreAuthStatus;
  status?: CommerceStoreStatus;
}

export type UpdateCommerceStoreInput = Partial<Omit<CreateCommerceStoreInput, "orgId">>;
