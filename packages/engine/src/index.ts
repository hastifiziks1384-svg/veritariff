/**
 * The deterministic engine. Every legal determination in Veritariff —
 * mismatch decisions, classification reasoning, rules-of-origin rule
 * selection — is a pure function in this package, computed over reference
 * data. No LLM calls, no network access. Enforced by
 * scripts/check-engine-boundary.mjs in CI.
 */
export * from "./mismatch/index";
export * from "./classification/index";
export * from "./roo/index";
