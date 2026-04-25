import type {
  ArchitectPort,
  ArchitectRepairRequest,
  SentinelIncident,
} from "./Sentinel.ts";
import { buildAIOptimizationTemplate } from "./AIOptimizationTemplate.ts";
import { GovernorRegistry } from "./GovernorRegistry.ts";
import { PatchApplier } from "./PatchApplier.ts";
import { PatchExecutor } from "./PatchExecutor.ts";
import { PatchFinalizer } from "./PatchFinalizer.ts";
import { PatchPlanner } from "./PatchPlanner.ts";
import type { AIRuntimeGovernor } from "./runtime/AIOptimizationRuntime.ts";

export type PatchStrategy =
  | "guard-clause"
  | "retry-policy"
  | "null-safety"
  | "ai-optimization-wrapper"
  | "manual-diagnosis";

export interface StackFrame {
  raw: string;
  functionName?: string;
  filePath?: string;
  line?: number;
  column?: number;
}

export interface IncidentAnalysis {
  probableCause: string;
  targetFunction: string;
  targetFile: string;
  strategy: PatchStrategy;
  complexityDetected: boolean;
  confidenceScore: number;
  frames: StackFrame[];
  sourceContext?: SourceContext;
}

export interface GeneratedPatch {
  strategy: PatchStrategy;
  targetFile: string;
  targetFunction: string;
  patch: string;
  summary: string;
  finalized?: boolean;
  finalizationNotes?: string[];
}

export interface IntegrityVerdict {
  status: "verified" | "uncertain" | "rejected";
  confidenceScore: number;
  judge: "architect-ai";
  rationale: string[];
  followUp: string[];
}

export interface ArchitectRepairReport {
  requestId: string;
  analysis: IncidentAnalysis;
  generatedPatch: GeneratedPatch;
  patchPlan: import("./PatchPlanner.ts").PatchPlan;
  dryRunValidation: import("./PatchApplier.ts").DryRunValidation;
  execution?: import("./PatchExecutor.ts").PatchExecutionResult;
  integrity: IntegrityVerdict;
  generatedAt: string;
}

export interface ArchitectReportSummary {
  requestId: string;
  target: string;
  strategy: PatchStrategy;
  integrity: IntegrityVerdict["status"];
  confidenceScore: number;
  canApply: boolean;
  executionStatus: "pending" | "applied" | "skipped" | "failed";
}

export interface ArchitectOptions {
  serviceName?: string;
  now?: () => Date;
  logger?: Pick<Console, "log" | "warn">;
  autoApplyVerified?: boolean;
}

export interface SourceContext {
  filePath: string;
  functionName?: string;
  functionSource?: string;
  surroundingSource?: string;
  governorProfileId?: string;
}

const DEFAULT_OPTIONS: Required<ArchitectOptions> = {
  serviceName: "aegis-flow",
  now: () => new Date(),
  logger: console,
  autoApplyVerified: true,
};

export class Architect implements ArchitectPort {
  private readonly options: Required<ArchitectOptions>;
  private readonly reports: ArchitectRepairReport[] = [];
  private readonly governorRegistry = new GovernorRegistry();
  private readonly patchPlanner = new PatchPlanner();
  private readonly patchApplier = new PatchApplier();
  private readonly patchExecutor = new PatchExecutor();
  private readonly patchFinalizer = new PatchFinalizer();

  constructor(options: ArchitectOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async handleIncident(request: ArchitectRepairRequest): Promise<void> {
    const report = await this.buildRepairReport(request);
    this.reports.push(report);

    this.options.logger.log(
      `[Architect] Generated patch for ${report.analysis.targetFunction} in ${report.analysis.targetFile}`,
    );
    this.options.logger.log(report.generatedPatch.patch);
    this.options.logger.log(report.patchPlan.diff);
    this.options.logger.log(
      `[Architect] Dry-run apply: ${report.dryRunValidation.canApply} (matchedSource=${report.dryRunValidation.matchedSource})`,
    );
    if (report.execution) {
      this.options.logger.log(
        `[Architect] Execution: ${report.execution.status} (${report.execution.reason})`,
      );
    }
    this.options.logger.log(
      `[Architect] Integrity verdict: ${report.integrity.status} (${report.integrity.confidenceScore})`,
    );
  }

  async buildRepairReport(
    request: ArchitectRepairRequest,
  ): Promise<ArchitectRepairReport> {
    const analysis = this.analyzeIncident(request.incident);
    const draftPatch = this.generatePatch(request.incident, analysis);
    const governorProfile = this.governorRegistry.resolve(
      analysis.sourceContext?.governorProfileId,
    );
    const generatedPatch = this.patchFinalizer.finalize(
      draftPatch,
      governorProfile,
      analysis.sourceContext,
    );
    const patchPlan = this.patchPlanner.buildPlan(
      generatedPatch,
      analysis.sourceContext,
    );
    const dryRunValidation = this.patchApplier.dryRun(
      patchPlan,
      analysis.sourceContext,
    );
    const integrity = await this.verifyIntegrity(
      request.incident,
      analysis,
      generatedPatch,
      dryRunValidation,
    );
    const execution =
      this.options.autoApplyVerified &&
      integrity.status === "verified" &&
      dryRunValidation.canApply
        ? await this.patchExecutor.execute(
            patchPlan,
            dryRunValidation,
            analysis.sourceContext,
          )
        : undefined;

    return {
      requestId: request.incident.id,
      analysis,
      generatedPatch,
      patchPlan,
      dryRunValidation,
      execution,
      integrity,
      generatedAt: this.options.now().toISOString(),
    };
  }

  analyzeIncident(incident: SentinelIncident): IncidentAnalysis {
    const frames = this.parseStackTrace(incident.stack);
    const primaryFrame = frames[0];
    const complexityDetected = this.isComplexLogicFailure(incident, frames);
    const strategy = this.selectStrategy(incident, complexityDetected);
    const sourceContext = this.extractSourceContext(incident, primaryFrame);

    return {
      probableCause: this.detectProbableCause(incident, complexityDetected),
      targetFunction:
        sourceContext?.functionName ?? primaryFrame?.functionName ?? "unknownFunction",
      targetFile: sourceContext?.filePath ?? primaryFrame?.filePath ?? "src/unknown.ts",
      strategy,
      complexityDetected,
      confidenceScore: this.estimateAnalysisConfidence(incident, frames),
      frames,
      sourceContext,
    };
  }

  generatePatch(
    incident: SentinelIncident,
    analysis: IncidentAnalysis,
  ): GeneratedPatch {
    if (analysis.strategy === "ai-optimization-wrapper") {
      return {
        strategy: analysis.strategy,
        targetFile: analysis.targetFile,
        targetFunction: analysis.targetFunction,
        summary:
          "Wrap the unstable function with AIOptimizationWrapper to constrain runtime failures.",
        patch: this.createAIWrapperPatch(analysis),
      };
    }

    return {
      strategy: analysis.strategy,
      targetFile: analysis.targetFile,
      targetFunction: analysis.targetFunction,
      summary: "Generate a targeted guard patch from the Sentinel incident.",
      patch: this.createStandardPatch(incident, analysis),
    };
  }

  async verifyIntegrity(
    incident: SentinelIncident,
    analysis: IncidentAnalysis,
    generatedPatch: GeneratedPatch,
    dryRunValidation: import("./PatchApplier.ts").DryRunValidation,
  ): Promise<IntegrityVerdict> {
    const rationale: string[] = [];
    const followUp: string[] = [];
    let confidenceScore = analysis.confidenceScore;

    rationale.push(`Patch strategy selected: ${generatedPatch.strategy}`);

    if (analysis.targetFunction !== "unknownFunction") {
      rationale.push(`Primary stack frame isolated: ${analysis.targetFunction}`);
      confidenceScore += 0.12;
    } else {
      followUp.push("No stable function name found in stack trace.");
      confidenceScore -= 0.2;
    }

    if (generatedPatch.patch.includes("TODO")) {
      rationale.push("Generated patch still contains placeholders.");
      followUp.push("Replace TODO placeholders before applying the patch.");
      confidenceScore -= 0.25;
    }

    if (analysis.sourceContext?.functionSource) {
      rationale.push("Source snapshot was available for patch synthesis.");
      confidenceScore += 0.1;
    } else {
      followUp.push("Patch was synthesized without a concrete function body snapshot.");
    }

    if (analysis.complexityDetected) {
      rationale.push(
        "Complexity-triggered failure detected; wrapper adds runtime containment and fallback.",
      );
    }

    if (dryRunValidation.matchedSource) {
      rationale.push("Dry-run validation matched the available source snapshot.");
      confidenceScore += 0.08;
    } else {
      followUp.push("Dry-run validation could not match the generated diff to source.");
      confidenceScore -= 0.18;
    }

    if (!dryRunValidation.canApply) {
      followUp.push(...dryRunValidation.reasons);
      confidenceScore -= 0.08;
    }

    if (incident.severity === "critical") {
      rationale.push("Incident severity is critical; automated verification remains cautious.");
      confidenceScore -= 0.08;
    }

    confidenceScore = Math.max(0, Math.min(0.99, confidenceScore));

    if (confidenceScore >= 0.78) {
      return {
        status: "verified",
        confidenceScore,
        judge: "architect-ai",
        rationale,
        followUp,
      };
    }

    if (confidenceScore >= 0.5) {
      followUp.push("Run execution-path validation before promoting this patch.");
      return {
        status: "uncertain",
        confidenceScore,
        judge: "architect-ai",
        rationale,
        followUp,
      };
    }

    followUp.push("Require manual review or richer telemetry before auto-apply.");
    return {
      status: "rejected",
      confidenceScore,
      judge: "architect-ai",
      rationale,
      followUp,
    };
  }

  getReports(): ArchitectRepairReport[] {
    return [...this.reports];
  }

  getLatestReport(): ArchitectRepairReport | null {
    return this.reports.at(-1) ?? null;
  }

  getLatestSummary(): ArchitectReportSummary | null {
    const report = this.getLatestReport();
    if (!report) {
      return null;
    }

    return {
      requestId: report.requestId,
      target: `${report.analysis.targetFile}:${report.analysis.targetFunction}`,
      strategy: report.analysis.strategy,
      integrity: report.integrity.status,
      confidenceScore: report.integrity.confidenceScore,
      canApply: report.dryRunValidation.canApply,
      executionStatus: report.execution?.status ?? "pending",
    };
  }

  private parseStackTrace(stack?: string): StackFrame[] {
    if (!stack) {
      return [];
    }

    return stack
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((raw) => {
        const withFunction =
          /^at\s+(?<functionName>[^\s(]+)\s+\((?<filePath>.+):(?<line>\d+):(?<column>\d+)\)$/.exec(
            raw,
          );

        if (withFunction?.groups) {
          return {
            raw,
            functionName: withFunction.groups.functionName,
            filePath: withFunction.groups.filePath,
            line: Number(withFunction.groups.line),
            column: Number(withFunction.groups.column),
          };
        }

        const withoutFunction =
          /^at\s+(?<filePath>.+):(?<line>\d+):(?<column>\d+)$/.exec(raw);

        if (withoutFunction?.groups) {
          return {
            raw,
            filePath: withoutFunction.groups.filePath,
            line: Number(withoutFunction.groups.line),
            column: Number(withoutFunction.groups.column),
          };
        }

        return { raw };
      });
  }

  private isComplexLogicFailure(
    incident: SentinelIncident,
    frames: StackFrame[],
  ): boolean {
    const haystack = `${incident.message} ${incident.stack ?? ""} ${incident.code ?? ""}`
      .toLowerCase();

    if (
      /(complex|branch|recursive|recursion|state machine|race|concurrent|orchestrat|decision tree|cyclic|overflow)/.test(
        haystack,
      )
    ) {
      return true;
    }

    return frames.length >= 8 && incident.source === "application";
  }

  private selectStrategy(
    incident: SentinelIncident,
    complexityDetected: boolean,
  ): PatchStrategy {
    if (complexityDetected) {
      return "ai-optimization-wrapper";
    }

    const haystack = `${incident.message} ${incident.code ?? ""}`.toLowerCase();

    if (/(undefined|null|cannot read)/.test(haystack)) {
      return "null-safety";
    }

    if (/(timeout|503|502|connection|refused|unavailable)/.test(haystack)) {
      return "retry-policy";
    }

    if (/(invalid|range|guard|assert|unexpected)/.test(haystack)) {
      return "guard-clause";
    }

    return "manual-diagnosis";
  }

  private detectProbableCause(
    incident: SentinelIncident,
    complexityDetected: boolean,
  ): string {
    if (complexityDetected) {
      return "The failing path appears to have excessive branching or orchestration complexity.";
    }

    switch (incident.source) {
      case "network":
        return "Upstream dependency or connectivity path is unstable.";
      case "filesystem":
        return "File path, permission, or storage dependency is invalid.";
      case "runtime":
        return "Unhandled runtime exception propagated without local containment.";
      case "security":
        return "Access boundary or credential flow rejected the operation.";
      default:
        return "Application logic failed without a narrow local recovery path.";
    }
  }

  private extractSourceContext(
    incident: SentinelIncident,
    primaryFrame?: StackFrame,
  ): SourceContext | undefined {
    const metadata = incident.metadata;
    const sourceSnapshot = metadata.sourceSnapshot;

    if (
      sourceSnapshot &&
      typeof sourceSnapshot === "object" &&
      !Array.isArray(sourceSnapshot)
    ) {
      const candidate = sourceSnapshot as Record<string, unknown>;
      const filePath =
        typeof candidate.filePath === "string"
          ? candidate.filePath
          : primaryFrame?.filePath ?? "src/unknown.ts";

      const functionName =
        typeof candidate.functionName === "string"
          ? candidate.functionName
          : primaryFrame?.functionName;

      const functionSource =
        typeof candidate.functionSource === "string"
          ? candidate.functionSource
          : undefined;

      const surroundingSource =
        typeof candidate.surroundingSource === "string"
          ? candidate.surroundingSource
          : undefined;
      const governorProfileId =
        typeof candidate.governorProfileId === "string"
          ? candidate.governorProfileId
          : undefined;

      return {
        filePath,
        functionName,
        functionSource,
        surroundingSource,
        governorProfileId,
      };
    }

    return primaryFrame?.filePath
      ? {
          filePath: primaryFrame.filePath,
          functionName: primaryFrame.functionName,
        }
      : undefined;
  }

  private estimateAnalysisConfidence(
    incident: SentinelIncident,
    frames: StackFrame[],
  ): number {
    let score = 0.45;

    if (incident.stack) {
      score += 0.18;
    }

    if (frames.length > 0) {
      score += 0.14;
    }

    if (incident.code) {
      score += 0.07;
    }

    if (incident.source !== "unknown") {
      score += 0.05;
    }

    return Math.max(0, Math.min(0.95, score));
  }

  private createStandardPatch(
    incident: SentinelIncident,
    analysis: IncidentAnalysis,
  ): string {
    const functionName = analysis.targetFunction;
    const sourceHint = incident.source;
    const sourceContext = analysis.sourceContext;
    const sourcePreview = sourceContext?.functionSource ?? sourceContext?.surroundingSource;

    return [
      `// Generated by The Architect for incident ${incident.id}`,
      `// Strategy: ${analysis.strategy}`,
      `// Target: ${analysis.targetFile} -> ${functionName}`,
      ...(sourcePreview
        ? [
            `// Source snapshot used during synthesis:`,
            ...sourcePreview.split("\n").map((line) => `// ${line}`),
          ]
        : []),
      "",
      `function ${functionName}Patched(...args: unknown[]) {`,
      `  try {`,
      `    if (!args) {`,
      `      throw new Error("Guard rejected invalid invocation.");`,
      `    }`,
      "",
      `    // TODO: Replace with the original ${functionName} implementation.`,
      `    return ${functionName}(...args as never[]);`,
      `  } catch (error) {`,
      `    console.error("[Architect Patch] ${sourceHint} failure intercepted", error);`,
      `    throw error;`,
      `  }`,
      `}`,
    ].join("\n");
  }

  private createAIWrapperPatch(analysis: IncidentAnalysis): string {
    return buildAIOptimizationTemplate({
      targetFile: analysis.targetFile,
      functionName: analysis.targetFunction,
      sourceContext: analysis.sourceContext,
    });
  }
}

export function createArchitect(options?: ArchitectOptions): Architect {
  return new Architect(options);
}

export class MockAIGovernor implements AIRuntimeGovernor {
  async decide(context: {
    error: string;
    functionName: string;
    args: unknown[];
    attempt: number;
  }): Promise<{
    action: "retry" | "fallback" | "short-circuit" | "continue";
    reason: string;
    fallbackValue?: unknown;
  }> {
    const haystack = `${context.error} ${context.functionName}`.toLowerCase();

    if (context.attempt === 1 && /(timeout|race|concurrent|complex|overflow)/.test(haystack)) {
      return {
        action: "retry",
        reason: "Transient or orchestration-heavy failure detected, retrying once.",
      };
    }

    if (/(undefined|null|cannot read|missing)/.test(haystack)) {
      return {
        action: "fallback",
        reason: "Nullability failure detected, returning a safe fallback payload.",
        fallbackValue: { recovered: true, mode: "safe-fallback" },
      };
    }

    return {
      action: "short-circuit",
      reason: "Risk remains too high for uncontrolled runtime continuation.",
    };
  }
}
