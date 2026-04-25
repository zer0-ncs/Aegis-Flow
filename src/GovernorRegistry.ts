export interface GovernorProfile {
  id: string;
  importPath: string;
  exportName: string;
  factoryExpression: string;
  description: string;
}

export class GovernorRegistry {
  private readonly profiles = new Map<string, GovernorProfile>([
    [
      "default-runtime",
      {
        id: "default-runtime",
        importPath: "./governors/DefaultRuntimeGovernor.ts",
        exportName: "createDefaultRuntimeGovernor",
        factoryExpression: "createDefaultRuntimeGovernor()",
        description: "Balanced runtime governor for generic containment and retry decisions.",
      },
    ],
    [
      "complex-logic",
      {
        id: "complex-logic",
        importPath: "./governors/ComplexLogicGovernor.ts",
        exportName: "createComplexLogicGovernor",
        factoryExpression: "createComplexLogicGovernor()",
        description: "Aggressive governor for orchestration-heavy and branching failures.",
      },
    ],
  ]);

  resolve(profileId?: string): GovernorProfile {
    if (profileId && this.profiles.has(profileId)) {
      return this.profiles.get(profileId)!;
    }

    return this.profiles.get("default-runtime")!;
  }
}

export function createGovernorRegistry(): GovernorRegistry {
  return new GovernorRegistry();
}
