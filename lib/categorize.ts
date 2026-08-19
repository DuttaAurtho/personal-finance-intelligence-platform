import { LEXICON_KEYS, MERCHANT_LEXICON, DISPLAY_NAMES } from "./merchants";
import { categoryKind } from "./categories";
import { dayOfWeek } from "./dates";

/**
 * Transaction categorisation — a hybrid of three signals, in priority order:
 *
 *   1. User rules      — an explicit "always call X → Y" instruction. Absolute.
 *   2. Naive Bayes     — a multinomial model trained on the transactions this
 *                        user has confirmed or corrected. Personal, and it gets
 *                        better every time they touch a category.
 *   3. Merchant lexicon— a curated brand list that solves the cold-start
 *                        problem on the very first import.
 *
 * The model wins over the lexicon once it is confident, which is what lets the
 * system learn that *your* "SQ *THE ARCHIVE" is Eating Out and not Shopping.
 */

/* ---------------------------------------------------------------------- */
/* Description normalisation                                               */
/* ---------------------------------------------------------------------- */

/** Payment-processor prefixes that hide the real merchant behind an asterisk. */
const PROCESSORS = new Set([
  "sq", "sqc", "paypal", "pp", "sumup", "iz", "ztl", "zettle", "stripe",
  "wpy", "worldpay", "www", "gum", "eventbrite",
]);

/** Banking noise that carries no merchant information. */
const NOISE = [
  /\bcard payment (to|from)\b/gi,
  /\bcontactless\b/gi,
  /\bpayment (to|from)\b/gi,
  /\bdirect debit\b/gi,
  /\bstanding order\b/gi,
  /\bfaster payment\b/gi,
  /\bbank (credit|debit|giro)\b/gi,
  /\bdebit card\b/gi,
  /\bcredit card\b/gi,
  /\bvisa purchase\b/gi,
  /\bmastercard\b/gi,
  /\bpos\b/gi,
  /\bvis\b/gi,
  /\bref(erence)?[: ]?\s*\w{0,20}$/gi,
  /\bmandate no.*/gi,
  /\bon \d{1,2} [a-z]{3}( \d{2,4})?\b/gi,
  /\b\d{1,2}[a-z]{3}\d{2}\b/gi,
  /\bx{2,}\d+\b/gi,
  /\b\d{6,}\b/g,
  /\bgbp\b|\busd\b|\beur\b/gi,
];

/** Trailing location/country tokens UK banks append to card payments. */
const TRAILING_GEO =
  /\s+(london|manchester|birmingham|leeds|glasgow|edinburgh|bristol|liverpool|cardiff|belfast|dublin|new york|los angeles)?\s*(gb|uk|gbr|usa|us|ie|de|fr|es|nl)$/i;

/**
 * Clean a raw bank description down to something human-readable.
 * "CARD PAYMENT TO SQ *BLUE BOTTLE COFFEE, LONDON GB REF 88213" → "blue bottle coffee"
 */
export function normalizeDescription(raw: string): string {
  if (!raw) return "";
  let s = String(raw).toLowerCase().trim();

  // Take the merchant that sits after a processor prefix: "sq *the archive".
  //
  // The prefix is only dropped when it is a payment processor and not itself a
  // merchant we recognise. Treating every short prefix as a processor threw
  // away the real merchant in cases like "UBER *TRIP", where the useful half is
  // the prefix and the suffix ("trip") identifies nothing.
  if (s.includes("*")) {
    const [head, ...rest] = s.split("*");
    const tail = rest.join(" ").trim();
    const headKey = head.trim().replace(/[^a-z]/g, "");
    const headIsKnownMerchant = headKey.length >= 3 && MERCHANT_LEXICON[headKey] !== undefined;

    // A known processor always yields to what follows it — "paypal *steam" is
    // Steam, even though PayPal is itself in the lexicon for bare transfers.
    // The short-prefix fallback is the guess, so that one defers to the lexicon.
    if (tail && (PROCESSORS.has(headKey) || (headKey.length <= 4 && !headIsKnownMerchant))) {
      s = tail;
    } else {
      s = s.replace(/\*/g, " ");
    }
  }

  for (const re of NOISE) s = s.replace(re, " ");

  s = s.replace(/[,;|]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(TRAILING_GEO, "");
  s = s.replace(/[^a-z0-9&'+. -]/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

/**
 * A stable grouping key for "the same merchant". Strips the store number and
 * branch suffix so "TESCO STORES 3411" and "TESCO EXPRESS SOHO" both land on
 * "tesco" — which is what makes recurring-payment detection work.
 */
export function merchantKey(raw: string): string {
  let s = normalizeDescription(raw);
  if (!s) return "";

  // A known brand anywhere in the string collapses the whole thing to that brand.
  for (const key of LEXICON_KEYS) {
    if (key.length >= 4 && s.includes(key)) return key.replace(/[^a-z0-9]+/g, " ").trim();
  }

  s = s
    .replace(/\b(stores?|express|metro|superstore|petrol|filling|station|ltd|limited|plc|inc|llc|uk|gb|online|com|co)\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Two words are plenty to identify a merchant and keeps branches together.
  return s.split(" ").filter(Boolean).slice(0, 2).join(" ");
}

/** Human-facing merchant name: "blue bottle coffee" → "Blue Bottle Coffee" */
export function merchantLabel(key: string): string {
  if (!key) return "Unknown";
  if (DISPLAY_NAMES[key]) return DISPLAY_NAMES[key];
  return key
    .split(" ")
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/* ---------------------------------------------------------------------- */
/* Feature extraction                                                      */
/* ---------------------------------------------------------------------- */

const STOPWORDS = new Set(["the", "and", "ltd", "limited", "plc", "co", "inc", "of", "to", "for"]);

/**
 * Turn a transaction into the bag of features the model sees.
 *
 * Word tokens carry the merchant identity. Character trigrams make the model
 * robust to the truncation and misspelling that bank feeds are full of
 * ("SAINSBURYS S" still overlaps "sainsburys"). The magnitude bucket and
 * day-of-week are weak but genuinely informative priors — rent is large and
 * lands early in the month; coffee is small and lands on weekdays.
 */
export function extractFeatures(description: string, amountMinor: number, date?: string): string[] {
  const norm = normalizeDescription(description);
  const feats: string[] = [];

  for (const w of norm.split(/[^a-z0-9&']+/)) {
    if (w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w)) feats.push("w:" + w);
  }

  const compact = norm.replace(/[^a-z0-9]/g, "");
  for (let i = 0; i + 3 <= compact.length && i < 40; i++) feats.push("t:" + compact.slice(i, i + 3));

  const abs = Math.abs(amountMinor);
  feats.push("mag:" + (abs === 0 ? 0 : Math.min(7, Math.floor(Math.log10(abs / 100 + 1)))));
  feats.push("dir:" + (amountMinor < 0 ? "out" : "in"));
  // Round numbers signal bills and rent rather than shop purchases.
  if (abs % 100000 === 0 && abs > 0) feats.push("round:big");
  else if (abs % 10000 === 0 && abs > 0) feats.push("round:mid");

  if (date) {
    feats.push("dow:" + dayOfWeek(date));
    const dom = Number(date.slice(8, 10));
    feats.push("dom:" + (dom <= 5 ? "early" : dom <= 25 ? "mid" : "late"));
  }

  return feats;
}

/* ---------------------------------------------------------------------- */
/* Multinomial Naive Bayes                                                 */
/* ---------------------------------------------------------------------- */

export interface TrainingSample {
  description: string;
  amount_minor: number;
  date?: string;
  category: string;
}

export interface Prediction {
  category: string;
  confidence: number;
  source: "rule" | "model" | "lexicon" | "heuristic";
}

export class NaiveBayes {
  /** category → total feature occurrences */
  private totals = new Map<string, number>();
  /** category → feature → count */
  private counts = new Map<string, Map<string, number>>();
  /** category → number of documents */
  private docs = new Map<string, number>();
  private vocab = new Set<string>();
  private nDocs = 0;

  /** Laplace smoothing constant — small, because our vocabulary is large. */
  private readonly alpha = 0.15;

  train(samples: TrainingSample[]): this {
    for (const s of samples) {
      if (!s.category || s.category === "Uncategorised") continue;
      const feats = extractFeatures(s.description, s.amount_minor, s.date);
      if (!feats.length) continue;

      this.nDocs++;
      this.docs.set(s.category, (this.docs.get(s.category) ?? 0) + 1);

      let bucket = this.counts.get(s.category);
      if (!bucket) {
        bucket = new Map();
        this.counts.set(s.category, bucket);
      }
      for (const f of feats) {
        bucket.set(f, (bucket.get(f) ?? 0) + 1);
        this.vocab.add(f);
      }
      this.totals.set(s.category, (this.totals.get(s.category) ?? 0) + feats.length);
    }
    return this;
  }

  get size(): number {
    return this.nDocs;
  }

  get categories(): string[] {
    return [...this.docs.keys()];
  }

  /**
   * Returns the most likely category with a calibrated confidence.
   *
   * Log-probabilities are converted back with a numerically stable softmax, so
   * "confidence" is the posterior share of the winning class — a value the UI
   * can honestly show as a percentage rather than an arbitrary score.
   */
  predict(description: string, amountMinor: number, date?: string): Prediction | null {
    if (this.nDocs < 12) return null; // too little evidence to trust

    const feats = extractFeatures(description, amountMinor, date);
    if (!feats.length) return null;

    const V = this.vocab.size || 1;
    const scores: { category: string; logp: number }[] = [];

    for (const [category, docCount] of this.docs) {
      const bucket = this.counts.get(category)!;
      const total = this.totals.get(category) ?? 0;
      let logp = Math.log(docCount / this.nDocs);
      for (const f of feats) {
        const c = bucket.get(f) ?? 0;
        logp += Math.log((c + this.alpha) / (total + this.alpha * V));
      }
      scores.push({ category, logp });
    }

    if (!scores.length) return null;
    scores.sort((a, b) => b.logp - a.logp);

    const max = scores[0].logp;
    let sum = 0;
    for (const s of scores) sum += Math.exp(s.logp - max);
    const confidence = 1 / sum;

    return {
      category: scores[0].category,
      confidence: Math.max(0, Math.min(1, confidence)),
      source: "model",
    };
  }
}

/* ---------------------------------------------------------------------- */
/* Lexicon + heuristics                                                    */
/* ---------------------------------------------------------------------- */

export function lexiconMatch(description: string): Prediction | null {
  const norm = normalizeDescription(description);
  if (!norm) return null;
  for (const key of LEXICON_KEYS) {
    if (norm.includes(key)) {
      // Longer, more specific keys deserve more confidence.
      const confidence = Math.min(0.95, 0.72 + Math.min(key.length, 18) / 90);
      return { category: MERCHANT_LEXICON[key], confidence, source: "lexicon" };
    }
  }
  return null;
}

/** Last-resort guess so nothing is left completely unlabelled. */
function heuristic(description: string, amountMinor: number): Prediction {
  const norm = normalizeDescription(description);
  if (amountMinor > 0) {
    if (/salary|pay|wage|bacs|payroll/.test(norm))
      return { category: "Salary", confidence: 0.55, source: "heuristic" };
    return { category: "Other Income", confidence: 0.35, source: "heuristic" };
  }
  if (Math.abs(amountMinor) >= 50_000 && /\b(rent|mortgage)\b/.test(norm))
    return { category: "Rent & Mortgage", confidence: 0.6, source: "heuristic" };
  return { category: "Uncategorised", confidence: 0, source: "heuristic" };
}

/* ---------------------------------------------------------------------- */
/* The combined categoriser                                                */
/* ---------------------------------------------------------------------- */

export interface UserRule {
  pattern: string;
  category: string;
  priority: number;
}

export class Categorizer {
  private model: NaiveBayes;
  private rules: UserRule[];

  constructor(rules: UserRule[] = [], trainingData: TrainingSample[] = []) {
    this.rules = [...rules].sort((a, b) => a.priority - b.priority);
    this.model = new NaiveBayes().train(trainingData);
  }

  get trainedOn(): number {
    return this.model.size;
  }

  classify(description: string, amountMinor: number, date?: string): Prediction {
    const norm = normalizeDescription(description);

    // 1. Explicit user rules always win.
    for (const r of this.rules) {
      const p = r.pattern.toLowerCase().trim();
      if (p && norm.includes(p)) return { category: r.category, confidence: 1, source: "rule" };
    }

    const model = this.model.predict(description, amountMinor, date);
    const lex = lexiconMatch(description);

    // 2. A confident personal model beats the generic lexicon.
    if (model && model.confidence >= 0.8) return model;

    // 3. Otherwise trust the curated brand list.
    if (lex && this.signAgrees(lex.category, amountMinor)) return lex;

    // 4. A merely plausible model prediction still beats guessing.
    if (model && model.confidence >= 0.5) return model;

    return heuristic(description, amountMinor);
  }

  /**
   * Guard against the lexicon assigning an expense category to money coming in
   * — an "AMAZON" refund is income, not shopping.
   */
  private signAgrees(category: string, amountMinor: number): boolean {
    const kind = categoryKind(category);
    if (kind === "transfer") return true;
    if (amountMinor > 0) return kind === "income";
    return kind === "expense";
  }
}
