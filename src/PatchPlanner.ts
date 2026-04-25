import { buildWrappedCoreExport } from "./AIOptimizationTemplate.ts";
import type { GeneratedPatch, SourceContext } from "./Architect.ts";

export interface PatchPlan {
  targetFile: string;
  mode: "create" | "append" | "replace-function";
  summary: string;
  diff: string;
  applyReady: boolean;
  warnings: string[];
}

export class PatchPlanner {
  buildPlan(
    generatedPatch: GeneratedPatch,
    sourceContext?: SourceContext,
  ): PatchPlan {
    if (sourceContext?.functionSource && sourceContext.functionName) {
      return this.buildFunctionReplacementPlan(generatedPatch, sourceContext);
    }

    return this.buildAppendPlan(generatedPatch, sourceContext);
  }

  private buildFunctionReplacementPlan(
    generatedPatch: GeneratedPatch,
    sourceContext: SourceContext,
  ): PatchPlan {
    const before = sourceContext.functionSource ?? "";
    const after = this.decorateReplacementSource(generatedPatch, sourceContext);
    const warnings = this.collectWarnings(generatedPatch.patch);

    return {
      targetFile: sourceContext.filePath,
      mode: "replace-function",
      summary: `Replace ${sourceContext.functionName} with generated recovery wrapper preview.`,
      diff: [
        `--- a/${sourceContext.filePath}`,
        `+++ b/${sourceContext.filePath}`,
        `@@ replace ${sourceContext.functionName ?? generatedPatch.targetFunction} @@`,
        ...before.split("\n").map((line) => `-${line}`),
        ...after.split("\n").map((line) => `+${line}`),
      ].join("\n"),
      applyReady: warnings.length === 0,
      warnings,
    };
  }

  private buildAppendPlan(
    generatedPatch: GeneratedPatch,
    sourceContext?: SourceContext,
  ): PatchPlan {
    const targetFile = sourceContext?.filePath ?? generatedPatch.targetFile;
    const warnings = this.collectWarnings(generatedPatch.patch);

    return {
      targetFile,
      mode: "append",
      summary: "Append generated patch preview because no exact function body snapshot was available.",
      diff: [
        `--- a/${targetFile}`,
        `+++ b/${targetFile}`,
        "@@ append architect patch preview @@",
        ...generatedPatch.patch.split("\n").map((line) => `+${line}`),
      ].join("\n"),
      applyReady: false,
      warnings: warnings.length
        ? warnings
        : ["Missing functionSource snapshot; planner fell back to append mode."],
    };
  }

  private decorateReplacementSource(
    generatedPatch: GeneratedPatch,
    sourceContext: SourceContext,
  ): string {
    const functionName = sourceContext.functionName ?? generatedPatch.targetFunction;
    const finalizedRuntime =
      this.buildFinalizedRuntimeSource(generatedPatch.patch, sourceContext) ??
      generatedPatch.patch;

    return [
      ...finalizedRuntime.split("\n"),
    ].join("\n");
  }

  private buildFinalizedRuntimeSource(
    patch: string,
    sourceContext: SourceContext,
  ): string | null {
    const functionSource = sourceContext.functionSource;
    const functionName = sourceContext.functionName;

    if (!functionSource || !functionName) {
      return null;
    }

    const wrappedRuntime = buildWrappedCoreExport(functionSource, functionName);
    if (!wrappedRuntime) {
      return null;
    }

    const protectedLinePattern = new RegExp(
      `const\\s+${functionName}Protected\\s*=\\s*createAIOptimizationWrapper\\([\\s\\S]*?\\);`,
    );

    if (protectedLinePattern.test(patch)) {
      return patch.replace(protectedLinePattern, wrappedRuntime);
    }

    return `${patch}\n\n${wrappedRuntime}`;
  }

  private collectWarnings(patch: string): string[] {
    const warnings: string[] = [];

    if (patch.includes("TODO")) {
      warnings.push("Patch still contains TODO placeholders.");
    }

    if (patch.includes("aiGovernor") && !/const\s+aiGovernor\s*=/.test(patch)) {
      warnings.push("Patch requires a concrete aiGovernor injection before apply.");
    }

    return warnings;
  }
}

export function createPatchPlanner(): PatchPlanner {
  return new PatchPlanner();
}
