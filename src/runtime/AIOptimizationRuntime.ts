export interface AIRuntimeGovernorDecision {
  action: "retry" | "fallback" | "short-circuit" | "continue";
  reason: string;
  fallbackValue?: unknown;
}

export interface AIRuntimeGovernor {
  decide(context: {
    error: string;
    functionName: string;
    args: unknown[];
    attempt: number;
  }): Promise<AIRuntimeGovernorDecision>;
}

export function createAIOptimizationWrapper<TArgs extends unknown[], TResult>(
  functionName: string,
  target: (...args: TArgs) => Promise<TResult> | TResult,
  governor: AIRuntimeGovernor,
) {
  return async (...args: TArgs): Promise<TResult | unknown> => {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await target(...args);
      } catch (error) {
        const decision = await governor.decide({
          error: error instanceof Error ? error.message : String(error),
          functionName,
          args,
          attempt,
        });

        if (decision.action === "retry" && attempt < 2) {
          continue;
        }

        if (decision.action === "fallback") {
          return decision.fallbackValue as TResult;
        }

        if (decision.action === "short-circuit") {
          throw new Error(
            `AIOptimizationWrapper halted ${functionName}: ${decision.reason}`,
          );
        }

        throw error;
      }
    }

    throw new Error(`AIOptimizationWrapper exhausted retries for ${functionName}`);
  };
}
