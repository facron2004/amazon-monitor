import type { ListingHealthIssue, ListingHealthScore } from "@amazon-monitor/shared";

interface ListingHealthInput {
  title: string;
  bulletPoints: string[];
  imageUrls: string[];
  coreKeywords: string[];
  reviewHighlights: string[];
  qaGaps: string[];
}

export function scoreListingHealth(input: ListingHealthInput): ListingHealthScore {
  const issues = [
    checkTitleKeywords(input.title, input.coreKeywords),
    checkTitleLength(input.title),
    checkTitleRepetition(input.title),
    checkImageCoverage(input.imageUrls),
    checkBulletCount(input.bulletPoints),
    checkReviewCoverage(input.title, input.bulletPoints, input.reviewHighlights),
    checkQaGaps(input.qaGaps)
  ].filter((issue): issue is ListingHealthIssue => issue !== null);
  const score = clampScore(100 - issues.reduce((sum, issue) => sum + issue.scoreImpact, 0));
  const strengths = buildStrengths(input, issues);
  return {
    score,
    level: score < 70 ? "risk" : score < 85 ? "watch" : "healthy",
    issues,
    strengths,
    suggestions: Array.from(new Set(issues.map((issue) => issue.suggestion))).slice(0, 5)
  };
}

function checkTitleKeywords(title: string, coreKeywords: string[]): ListingHealthIssue | null {
  const keywords = normalizeList(coreKeywords);
  if (keywords.length === 0) {
    return {
      key: "title_core_keywords_missing_input",
      label: "Title keyword evidence",
      level: "warning",
      scoreImpact: 8,
      message: "No core keywords were provided for title coverage inspection.",
      suggestion: "Add core keywords before approving title optimization."
    };
  }
  const normalizedTitle = normalizeText(title);
  const covered = keywords.filter((keyword) => normalizedTitle.includes(keyword));
  if (covered.length === 0) {
    return {
      key: "title_core_keywords_missing",
      label: "Title keyword coverage",
      level: "fail",
      scoreImpact: 18,
      message: "Title does not cover any provided core keywords.",
      suggestion: "Rewrite the title to include high-priority core keywords naturally."
    };
  }
  if (covered.length / keywords.length < 0.5) {
    return {
      key: "title_core_keywords_partial",
      label: "Title keyword coverage",
      level: "warning",
      scoreImpact: 8,
      message: `Title covers ${covered.length}/${keywords.length} provided core keywords.`,
      suggestion: "Add missing long-tail keywords where they fit the title naturally."
    };
  }
  return null;
}

function checkTitleLength(title: string): ListingHealthIssue | null {
  const length = title.trim().length;
  if (length < 50) {
    return {
      key: "title_too_short",
      label: "Title length",
      level: "warning",
      scoreImpact: 7,
      message: `Title is short at ${length} characters.`,
      suggestion: "Expand the title with primary product type, use case, and differentiating selling points."
    };
  }
  if (length > 200) {
    return {
      key: "title_too_long",
      label: "Title length",
      level: "warning",
      scoreImpact: 7,
      message: `Title is long at ${length} characters.`,
      suggestion: "Reduce duplicated wording and keep the most important keyword and benefit phrases."
    };
  }
  return null;
}

function checkTitleRepetition(title: string): ListingHealthIssue | null {
  const words = normalizeText(title).split(/\s+/).filter((word) => word.length >= 4);
  const counts = new Map<string, number>();
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const repeated = Array.from(counts.entries()).filter(([, count]) => count >= 4).map(([word]) => word);
  if (repeated.length === 0) return null;
  return {
    key: "title_keyword_stuffing",
    label: "Title repetition",
    level: "warning",
    scoreImpact: 10,
    message: `Title repeats these terms heavily: ${repeated.join(", ")}.`,
    suggestion: "Remove keyword stuffing and keep the title readable for buyers."
  };
}

function checkImageCoverage(imageUrls: string[]): ListingHealthIssue | null {
  const count = imageUrls.filter((url) => url.trim()).length;
  if (count === 0) {
    return {
      key: "images_missing",
      label: "Main image evidence",
      level: "fail",
      scoreImpact: 18,
      message: "No listing images were provided.",
      suggestion: "Add main image and supporting image URLs before approving Listing changes."
    };
  }
  if (count < 5) {
    return {
      key: "images_few",
      label: "Image coverage",
      level: "warning",
      scoreImpact: 8,
      message: `Only ${count} listing image URL${count === 1 ? "" : "s"} provided.`,
      suggestion: "Add benefit, scenario, comparison, and usage-step images."
    };
  }
  return null;
}

function checkBulletCount(bulletPoints: string[]): ListingHealthIssue | null {
  const count = bulletPoints.filter((bullet) => bullet.trim()).length;
  if (count < 3) {
    return {
      key: "bullets_missing",
      label: "Bullet coverage",
      level: "fail",
      scoreImpact: 18,
      message: `Only ${count} bullet point${count === 1 ? "" : "s"} provided.`,
      suggestion: "Write at least 5 bullets covering features, scenarios, pain points, and specs."
    };
  }
  if (count < 5) {
    return {
      key: "bullets_few",
      label: "Bullet coverage",
      level: "warning",
      scoreImpact: 9,
      message: `Only ${count} bullet points provided.`,
      suggestion: "Complete the five-point description before publishing changes."
    };
  }
  return null;
}

function checkReviewCoverage(title: string, bulletPoints: string[], reviewHighlights: string[]): ListingHealthIssue | null {
  const highlights = normalizeList(reviewHighlights);
  if (highlights.length === 0) return null;
  const listingText = normalizeText([title, ...bulletPoints].join(" "));
  const covered = highlights.filter((highlight) => listingText.includes(highlight));
  if (covered.length > 0) return null;
  return {
    key: "review_voc_not_reflected",
    label: "Review VOC coverage",
    level: "warning",
    scoreImpact: 12,
    message: "Provided Review highlights are not reflected in the title or bullets.",
    suggestion: "Use buyer language from reviews to address pain points and desired benefits in bullets."
  };
}

function checkQaGaps(qaGaps: string[]): ListingHealthIssue | null {
  const count = qaGaps.filter((gap) => gap.trim()).length;
  if (count === 0) return null;
  return {
    key: "qa_gaps_open",
    label: "Q&A gaps",
    level: count >= 3 ? "fail" : "warning",
    scoreImpact: count >= 3 ? 14 : 7,
    message: `${count} unresolved Q&A gap${count === 1 ? "" : "s"} provided.`,
    suggestion: "Answer repeated buyer questions in bullets, A+ content, or the Q&A workflow."
  };
}

function buildStrengths(input: ListingHealthInput, issues: ListingHealthIssue[]): string[] {
  const issueKeys = new Set(issues.map((issue) => issue.key));
  const strengths: string[] = [];
  if (!issueKeys.has("title_core_keywords_missing") && !issueKeys.has("title_core_keywords_partial")) {
    strengths.push("Title covers the provided core keyword set.");
  }
  if (!issueKeys.has("bullets_missing") && !issueKeys.has("bullets_few")) {
    strengths.push("Bullet count is ready for a full five-point description review.");
  }
  if (input.imageUrls.length >= 5) {
    strengths.push("Image URL coverage is sufficient for secondary visual review.");
  }
  return strengths.length ? strengths : ["Listing needs stronger evidence before optimization decisions."];
}

function normalizeList(values: string[]): string[] {
  return values.map(normalizeText).filter(Boolean);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ").replace(/\s+/g, " ").trim();
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
