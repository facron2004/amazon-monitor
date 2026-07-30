import { parseAgentToolInput, type AgentExecutionContext, type AgentToolBackend } from "@amazon-monitor/agent";
import type { AgentToolEnvelope, AgentToolName } from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { buildAgentToolEnvelope } from "./agent-tool-envelope.js";

const MAX_ROWS = 200;

function numberValue(input: Record<string, unknown>, key: string): number | undefined {
  return typeof input[key] === "number" ? input[key] : undefined;
}
function stringValue(input: Record<string, unknown>, key: string): string | undefined {
  return typeof input[key] === "string" ? input[key] : undefined;
}
function stringArray(input: Record<string, unknown>, key: string): string[] {
  const value = input[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export class StoreAgentToolBackend implements AgentToolBackend {
  constructor(private readonly store: Store) {}

  async execute(
    toolName: AgentToolName,
    rawInput: Record<string, unknown>,
    context: AgentExecutionContext,
  ): Promise<AgentToolEnvelope> {
    context.signal?.throwIfAborted();
    const input = parseAgentToolInput(toolName, rawInput);
    const envelope = this.executeValidated(toolName, input, context.orgId);
    context.signal?.throwIfAborted();
    return envelope;
  }

  private executeValidated(
    toolName: AgentToolName,
    input: Record<string, unknown>,
    orgId: number,
  ): AgentToolEnvelope {
    const categoryId = numberValue(input, "categoryId");
    const keywordId = numberValue(input, "keywordId");
    const asin = stringValue(input, "asin");
    const marketplace = stringValue(input, "marketplace");
    const startDate = stringValue(input, "from");
    const endDate = stringValue(input, "to");

    switch (toolName) {
      case "get_category_snapshot": {
        const rows = this.store.listCategorySnapshots({
          orgId, categoryId, marketplace, startDate, endDate, limit: MAX_ROWS,
        });
        return buildAgentToolEnvelope(toolName, rows, rows);
      }
      case "get_keyword_ranking": {
        const rows = this.store.listSnapshots({
          orgId, keywordId, asin, marketplace, startDate, endDate, limit: MAX_ROWS,
        });
        return buildAgentToolEnvelope(toolName, rows, rows, 6);
      }
      case "get_asin_history": {
        const categoryRows = this.store.listCategorySnapshots({
          orgId, categoryId, asin, marketplace, startDate, endDate, limit: MAX_ROWS / 2,
        });
        const keywordRows = this.store.listSnapshots({
          orgId, asin, marketplace, startDate, endDate, limit: MAX_ROWS / 2,
        });
        return buildAgentToolEnvelope(
          toolName,
          { categorySnapshots: categoryRows, keywordSnapshots: keywordRows },
          [...categoryRows, ...keywordRows],
          6,
        );
      }
      case "compare_asins": {
        const asins = stringArray(input, "asins");
        const rows = asins.flatMap((item) => this.store.listCategorySnapshots({
          orgId, categoryId, asin: item, marketplace, startDate, endDate,
          limit: Math.max(1, Math.floor(MAX_ROWS / asins.length)),
        }));
        return buildAgentToolEnvelope(toolName, rows, rows);
      }
      case "compare_brand_matrix":
      case "find_brand_share_changes": {
        const brands = stringArray(input, "brands");
        const rows = this.store.listBrandMatrix({
          orgId, categoryId, startDate, endDate, limit: MAX_ROWS,
        }).filter((row) => brands.length === 0 || brands.includes(row.brand));
        return buildAgentToolEnvelope(toolName, rows, rows);
      }
      case "get_price_history": {
        const rows = this.priceHistory(orgId, input);
        return buildAgentToolEnvelope(toolName, rows, rows, 3);
      }
      case "get_promotion_timeline": {
        const rows = this.activity(orgId, input).filter((row) =>
          /promotion|coupon|deal|price/i.test(row.eventType),
        );
        return buildAgentToolEnvelope(toolName, rows, rows, 3);
      }
      case "get_review_growth": {
        const rows = this.priceHistory(orgId, input).map((row) => ({
          asin: row.asin,
          snapshotDate: row.snapshotDate,
          reviewCount: row.reviewCount,
          previousReviewCount: row.previousReviewCount,
          reviewCountChange: row.reviewCountChange,
        }));
        return buildAgentToolEnvelope(toolName, rows, rows);
      }
      case "get_listing_change": {
        const rows = this.activity(orgId, input).filter((row) =>
          /listing|title|image|content/i.test(row.eventType),
        );
        return buildAgentToolEnvelope(toolName, rows, rows);
      }
      case "check_data_freshness":
        return this.checkFreshness(orgId, input);
      case "find_rank_anomalies": {
        const rows = this.activity(orgId, input).filter((row) =>
          /rank|bsr/i.test(row.eventType),
        );
        return buildAgentToolEnvelope(toolName, rows, rows, 6);
      }
      case "find_new_product_breakouts": {
        const rows = this.activity(orgId, input).filter((row) =>
          /new|breakout|entry/i.test(row.eventType),
        );
        return buildAgentToolEnvelope(toolName, rows, rows);
      }
      case "find_price_low": {
        const rows = this.priceHistory(orgId, input);
        const priced = rows.filter((row) => row.currentPrice !== null);
        const lowest = priced.reduce<typeof priced[number] | null>(
          (current, row) => current === null
            || (row.currentPrice ?? Infinity) < (current.currentPrice ?? Infinity)
            ? row
            : current,
          null,
        );
        return buildAgentToolEnvelope(toolName, { lowest, history: rows }, rows, 3);
      }
      case "find_review_anomalies": {
        const rows = this.activity(orgId, input).filter((row) =>
          /review/i.test(row.eventType),
        );
        return buildAgentToolEnvelope(toolName, rows, rows);
      }
    }
  }

  private priceHistory(orgId: number, input: Record<string, unknown>) {
    return this.store.listProductPriceHistory({
      orgId,
      categoryId: numberValue(input, "categoryId"),
      asin: stringValue(input, "asin"),
      marketplace: stringValue(input, "marketplace"),
      startDate: stringValue(input, "from"),
      endDate: stringValue(input, "to"),
      limit: MAX_ROWS,
    });
  }

  private activity(orgId: number, input: Record<string, unknown>) {
    return this.store.listCategoryActivityEvents({
      orgId,
      categoryId: numberValue(input, "categoryId"),
      asin: stringValue(input, "asin"),
      startDate: stringValue(input, "from"),
      endDate: stringValue(input, "to"),
      limit: MAX_ROWS,
    });
  }

  private checkFreshness(
    orgId: number,
    input: Record<string, unknown>,
  ): AgentToolEnvelope {
    const datasets = stringArray(input, "datasets");
    const records: unknown[] = [];
    for (const dataset of datasets) {
      if (dataset === "keyword") {
        records.push(...this.store.listSnapshots({
          orgId,
          keywordId: numberValue(input, "keywordId"),
          asin: stringValue(input, "asin"),
          marketplace: stringValue(input, "marketplace"),
          limit: 20,
        }));
        continue;
      }
      if (dataset === "price" || dataset === "review") {
        records.push(...this.priceHistory(orgId, input));
        continue;
      }
      if (dataset === "promotion" || dataset === "listing") {
        records.push(...this.activity(orgId, input));
        continue;
      }
      records.push(...this.store.listCategorySnapshots({
        orgId,
        categoryId: numberValue(input, "categoryId"),
        asin: stringValue(input, "asin"),
        marketplace: stringValue(input, "marketplace"),
        limit: 20,
      }));
    }
    const boundedRecords = records.slice(0, MAX_ROWS);
    return buildAgentToolEnvelope(
      "check_data_freshness",
      { datasets, recordCount: boundedRecords.length },
      boundedRecords,
      numberValue(input, "maxAgeHours") ?? 24,
    );
  }
}
