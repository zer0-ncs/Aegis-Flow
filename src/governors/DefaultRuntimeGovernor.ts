import type { AIRuntimeGovernor } from "../runtime/AIOptimizationRuntime.ts";

export function createDefaultRuntimeGovernor(): AIRuntimeGovernor {
  return {
    async decide(context) {
      const haystack = `${context.error} ${context.functionName}`.toLowerCase();

      if (context.attempt === 1 && /(timeout|transient|retry|503|502)/.test(haystack)) {
        return {
          action: "retry",
          reason: "Transient runtime signature detected.",
        };
      }

      if (/(undefined|null|missing)/.test(haystack)) {
        return {
          action: "fallback",
          reason: "Nullability risk detected, returning a safe empty object.",
          fallbackValue: {},
        };
      }

      return {
        action: "short-circuit",
        reason: "Default governor rejected unsafe continuation.",
      };
    },
  };
}
