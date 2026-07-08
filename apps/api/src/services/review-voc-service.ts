import type {
  ProductDataFreshness,
  ProductReview,
  ReviewSentiment,
  ReviewVocIssue,
  ReviewVocSummary,
  ReviewVocTopic
} from "@amazon-monitor/shared";

const WINDOW_DAYS = 30;
const NEGATIVE_CLUSTER_MIN_COUNT = 3;
const NEGATIVE_CLUSTER_RATE = 0.35;

interface ReviewVocProduct {
  productId: number;
  orgId: number;
  sku: string;
  asin: string;
  marketplace: string;
  brand: string | null;
  productTitle: string;
}

const topicRules: Array<{ topic: string; terms: string[]; suggestion: string }> = [
  {
    topic: "quality",
    terms: ["broken", "defect", "defective", "stopped", "failed", "crack", "leak", "poor quality"],
    suggestion: "Open a product-quality follow-up and compare recent defect language with support tickets."
  },
  {
    topic: "noise",
    terms: ["noise", "noisy", "loud", "quiet"],
    suggestion: "Reflect noise expectations in bullets/A+ content and verify product QA for abnormal noise complaints."
  },
  {
    topic: "cleaning",
    terms: ["clean", "cleaning", "mold", "smell", "odor"],
    suggestion: "Add cleaning instructions to Listing content and review whether packaging needs a quick-start guide."
  },
  {
    topic: "shipping",
    terms: ["shipping", "delivery", "arrived", "package", "damaged box"],
    suggestion: "Check logistics and packaging evidence before treating this as a product defect."
  },
  {
    topic: "support",
    terms: ["support", "service", "warranty", "refund", "return"],
    suggestion: "Review customer-service handling and prepare a support response template."
  }
];

export function inferReviewSentiment(rating: number, title: string, body: string): ReviewSentiment {
  if (rating <= 2) return "negative";
  if (rating >= 4) return "positive";
  const text = normalizeText(`${title} ${body}`);
  if (["broken", "defect", "terrible", "bad", "return", "refund"].some((term) => text.includes(term))) {
    return "negative";
  }
  return "neutral";
}

export function normalizeReviewTopics(inputTopics: string[] | undefined, title: string, body: string): string[] {
  const explicitTopics = (inputTopics ?? []).map((topic) => normalizeTopic(topic)).filter(Boolean);
  const inferredTopics = inferTopics(title, body);
  return Array.from(new Set([...explicitTopics, ...inferredTopics])).slice(0, 8);
}

export function buildReviewVocSummary(input: {
  product: ReviewVocProduct;
  reviews: ProductReview[];
  date?: string;
  freshness: ProductDataFreshness;
}): ReviewVocSummary {
  const counts = countSentiments(input.reviews);
  const averageRating = average(input.reviews.map((review) => review.rating));
  const topTopics = buildTopics(input.reviews);
  const issues = buildIssues(input.reviews, averageRating, counts.negative, topTopics);
  const level = deriveLevel(issues);
  return {
    ...input.product,
    date: input.date ?? null,
    windowDays: WINDOW_DAYS,
    reviewCount: input.reviews.length,
    negativeCount: counts.negative,
    neutralCount: counts.neutral,
    positiveCount: counts.positive,
    averageRating,
    negativeRate: input.reviews.length > 0 ? round(counts.negative / input.reviews.length) : 0,
    level,
    topTopics,
    issues,
    recentReviews: input.reviews.slice(0, 10),
    freshness: input.freshness
  };
}

function buildIssues(
  reviews: ProductReview[],
  averageRating: number | null,
  negativeCount: number,
  topics: ReviewVocTopic[]
): ReviewVocIssue[] {
  if (reviews.length === 0) {
    return [dataGapIssue()];
  }
  const issues: ReviewVocIssue[] = [];
  const negativeRate = negativeCount / reviews.length;
  if (negativeCount >= NEGATIVE_CLUSTER_MIN_COUNT && negativeRate >= NEGATIVE_CLUSTER_RATE) {
    issues.push(negativeClusterIssue(negativeCount, negativeRate));
  }
  if (averageRating !== null && averageRating < 4 && reviews.length >= 3) {
    issues.push(lowRatingIssue(averageRating));
  }
  const topicIssue = buildTopicIssue(topics);
  if (topicIssue) issues.push(topicIssue);
  return issues;
}

function buildTopics(reviews: ProductReview[]): ReviewVocTopic[] {
  const topicMap = new Map<string, { mentionCount: number; negativeCount: number; sampleReviewIds: number[] }>();
  for (const review of reviews) {
    for (const topic of review.topics) {
      const value = topicMap.get(topic) ?? { mentionCount: 0, negativeCount: 0, sampleReviewIds: [] };
      value.mentionCount += 1;
      if (review.sentiment === "negative") value.negativeCount += 1;
      if (value.sampleReviewIds.length < 3) value.sampleReviewIds.push(review.id);
      topicMap.set(topic, value);
    }
  }
  return Array.from(topicMap.entries())
    .map(([topic, value]) => ({ topic, ...value }))
    .sort((left, right) => right.negativeCount - left.negativeCount || right.mentionCount - left.mentionCount)
    .slice(0, 8);
}

function buildTopicIssue(topics: ReviewVocTopic[]): ReviewVocIssue | null {
  const topTopic = topics.find((topic) => topic.negativeCount >= 2);
  if (!topTopic) return null;
  const rule = topicRules.find((item) => item.topic === topTopic.topic);
  return {
    type: "topic_cluster",
    priority: topTopic.negativeCount >= 4 ? "P0" : "P1",
    label: `${topTopic.topic} complaints`,
    message: `${topTopic.negativeCount} negative review${topTopic.negativeCount === 1 ? "" : "s"} mention ${topTopic.topic}.`,
    suggestion: rule?.suggestion ?? "Create a VOC follow-up task and verify whether Listing content or product quality needs action.",
    evidence: [`topic=${topTopic.topic}`, `negative_count=${topTopic.negativeCount}`, `mentions=${topTopic.mentionCount}`]
  };
}

function negativeClusterIssue(negativeCount: number, negativeRate: number): ReviewVocIssue {
  return {
    type: "negative_cluster",
    priority: negativeRate >= 0.5 ? "P0" : "P1",
    label: "Negative review cluster",
    message: `${negativeCount} recent negative reviews (${Math.round(negativeRate * 100)}%) need operator review.`,
    suggestion: "Inspect recent negative reviews, group root causes, and create follow-up tasks for product, Listing, or support.",
    evidence: [`negative_count=${negativeCount}`, `negative_rate=${Math.round(negativeRate * 100)}%`]
  };
}

function lowRatingIssue(averageRating: number): ReviewVocIssue {
  return {
    type: "low_rating",
    priority: averageRating < 3.5 ? "P0" : "P1",
    label: "Low recent rating",
    message: `Recent average review rating is ${averageRating.toFixed(1)}.`,
    suggestion: "Compare recent Review VOC with product metrics before changing Listing claims or support scripts.",
    evidence: [`average_rating=${averageRating.toFixed(1)}`]
  };
}

function dataGapIssue(): ReviewVocIssue {
  return {
    type: "data_gap",
    priority: "P2",
    label: "Missing review evidence",
    message: "No recent reviews are available for VOC analysis.",
    suggestion: "Import Amazon review exports or crawler review evidence before making VOC decisions.",
    evidence: ["review_count=0"]
  };
}

function deriveLevel(issues: ReviewVocIssue[]): "healthy" | "watch" | "risk" {
  if (issues.some((issue) => issue.priority === "P0")) return "risk";
  if (issues.some((issue) => issue.priority === "P1")) return "watch";
  if (issues.some((issue) => issue.type === "data_gap")) return "watch";
  return "healthy";
}

function inferTopics(title: string, body: string): string[] {
  const text = normalizeText(`${title} ${body}`);
  return topicRules
    .filter((rule) => rule.terms.some((term) => text.includes(term)))
    .map((rule) => rule.topic);
}

function normalizeTopic(topic: string): string {
  return topic.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function countSentiments(reviews: ProductReview[]): Record<ReviewSentiment, number> {
  return reviews.reduce<Record<ReviewSentiment, number>>((counts, review) => {
    counts[review.sentiment] += 1;
    return counts;
  }, { positive: 0, neutral: 0, negative: 0 });
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export { WINDOW_DAYS as reviewVocWindowDays };
