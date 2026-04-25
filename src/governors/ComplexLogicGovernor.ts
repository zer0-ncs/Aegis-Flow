import type { AIRuntimeGovernor } from "../runtime/AIOptimizationRuntime.ts";

export function createComplexLogicGovernor(): AIRuntimeGovernor {
  return {
    async decide(context) {
      const haystack = `${context.error} ${context.functionName}`.toLowerCase();

      if (context.attempt === 1) {
        return {
          action: "retry",
          reason: "Complex orchestration failures get one controlled retry.",
        };
      }

      if (/(overflow|recursive|race|branch|orchestrat)/.test(haystack)) {
        return {
          action: "fallback",
          reason: "Complexity signature persisted, switching to bounded fallback result.",
          fallbackValue: {
            recovered: true,
            mode: "complex-logic-fallback",
          },
        };
      }

      return {
        action: "short-circuit",
        reason: "Complex governor blocked unbounded continuation.",
      };
    },
  };
}
