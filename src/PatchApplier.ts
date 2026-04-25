import type { SourceContext } from "./Architect.ts";
import type { PatchPlan } from "./PatchPlanner.ts";

export interface DryRunValidation {
  targetFile: string;
  mode: PatchPlan["mode"];
  canApply: boolean;
  matchedSource: boolean;
  simulatedOutput?: string;
  reasons: string[];
}

export class PatchApplier {
  dryRun(plan: PatchPlan, sourceContext?: SourceContext): DryRunValidation {
    const reasons: string[] = [];

    if (plan.warnings.length > 0) {
      reasons.push(...plan.warnings);
    }

    if (plan.mode === "replace-function") {
      return this.validateFunctionReplacement(plan, sourceContext, reasons);
    }

    if (plan.mode === "append") {
      return this.validateAppend(plan, sourceContext, reasons);
    }

    return {
      targetFile: plan.targetFile,
      mode: plan.mode,
      canApply: false,
      matchedSource: false,
      reasons: [...reasons, "Unsupported patch mode for dry-run validation."],
    };
  }

  private validateFunctionReplacement(
    plan: PatchPlan,
    sourceContext: SourceContext | undefined,
    reasons: string[],
  ): DryRunValidation {
    const originalSource = sourceContext?.functionSource;

    if (!originalSource) {
      return {
        targetFile: plan.targetFile,
        mode: plan.mode,
        canApply: false,
        matchedSource: false,
        reasons: [...reasons, "Missing functionSource snapshot for replacement validation."],
      };
    }

    const removedLines = this.extractDiffLines(plan.diff, "-");
    const addedLines = this.extractDiffLines(plan.diff, "+");
    const removedBlock = removedLines.join("\n");
    const addedBlock = addedLines.join("\n");
    const matchedSource = removedBlock.includes(originalSource);

    if (!matchedSource) {
      return {
        targetFile: plan.targetFile,
        mode: plan.mode,
        canApply: false,
        matchedSource: false,
        reasons: [
          ...reasons,
          "Replacement diff does not match the provided functionSource snapshot.",
        ],
      };
    }

    return {
      targetFile: plan.targetFile,
      mode: plan.mode,
      canApply: reasons.length === 0,
      matchedSource: true,
      simulatedOutput: originalSource.replace(originalSource, addedBlock),
      reasons: reasons.length ? reasons : ["Dry-run replacement matched the source snapshot."],
    };
  }

  private validateAppend(
    plan: PatchPlan,
    sourceContext: SourceContext | undefined,
    reasons: string[],
  ): DryRunValidation {
    const baseSource = sourceContext?.surroundingSource ?? sourceContext?.functionSource ?? "";
    const addedBlock = this.extractDiffLines(plan.diff, "+").join("\n");

    return {
      targetFile: plan.targetFile,
      mode: plan.mode,
      canApply: false,
      matchedSource: Boolean(baseSource),
      simulatedOutput: baseSource ? `${baseSource}\n\n${addedBlock}` : addedBlock,
      reasons: reasons.length
        ? reasons
        : ["Append dry-run generated preview, but exact replacement scope is unavailable."],
    };
  }

  private extractDiffLines(diff: string, prefix: "+" | "-"): string[] {
    return diff
      .split("\n")
      .filter((line) => line.startsWith(prefix) && !line.startsWith(`${prefix}${prefix}${prefix}`))
      .map((line) => line.slice(1));
  }
}

export function createPatchApplier(): PatchApplier {
  return new PatchApplier();
}
