import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SourceContext } from "./Architect.ts";
import type { DryRunValidation } from "./PatchApplier.ts";
import type { PatchPlan } from "./PatchPlanner.ts";
import { writeStatusSnapshot } from "./StateStore.ts";

export interface PatchExecutionResult {
  status: "applied" | "skipped" | "failed";
  targetFile: string;
  backupFile?: string;
  auditLogFile: string;
  reason: string;
}

export interface PatchExecutorOptions {
  auditDir?: string;
  backupDir?: string;
  now?: () => Date;
}

const DEFAULT_OPTIONS: Required<PatchExecutorOptions> = {
  auditDir: ".aegis-flow/audit",
  backupDir: ".aegis-flow/backups",
  now: () => new Date(),
};

export class PatchExecutor {
  private readonly options: Required<PatchExecutorOptions>;

  constructor(options: PatchExecutorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async execute(
    plan: PatchPlan,
    dryRunValidation: DryRunValidation,
    sourceContext?: SourceContext,
  ): Promise<PatchExecutionResult> {
    const auditLogFile = join(this.options.auditDir, "patch-log.jsonl");

    if (!dryRunValidation.canApply || !dryRunValidation.matchedSource) {
      const result: PatchExecutionResult = {
        status: "skipped",
        targetFile: plan.targetFile,
        auditLogFile,
        reason: "Guardrails rejected apply because dry-run validation was not fully green.",
      };
      await this.appendAuditLog(result, plan, dryRunValidation);
      await this.writeStatus(result, plan, dryRunValidation);
      return result;
    }

    if (!sourceContext?.functionSource || !dryRunValidation.simulatedOutput) {
      const result: PatchExecutionResult = {
        status: "failed",
        targetFile: plan.targetFile,
        auditLogFile,
        reason: "Missing source snapshot or simulated output for guarded apply.",
      };
      await this.appendAuditLog(result, plan, dryRunValidation);
      await this.writeStatus(result, plan, dryRunValidation);
      return result;
    }

    const currentContents = await readFile(plan.targetFile, "utf8");

    if (!currentContents.includes(sourceContext.functionSource)) {
      const result: PatchExecutionResult = {
        status: "failed",
        targetFile: plan.targetFile,
        auditLogFile,
        reason: "Live file no longer matches the functionSource snapshot.",
      };
      await this.appendAuditLog(result, plan, dryRunValidation);
      await this.writeStatus(result, plan, dryRunValidation);
      return result;
    }

    const updatedContents = currentContents.replace(
      sourceContext.functionSource,
      dryRunValidation.simulatedOutput,
    );
    const normalizedContents = this.normalizeAppliedModule(updatedContents);
    const timestamp = this.options.now().toISOString().replace(/[:.]/g, "-");
    const backupFile = join(
      this.options.backupDir,
      `${plan.targetFile.replaceAll("/", "__")}--${timestamp}.bak`,
    );

    await mkdir(dirname(backupFile), { recursive: true });
    await mkdir(dirname(plan.targetFile), { recursive: true });
    await mkdir(dirname(auditLogFile), { recursive: true });

    await writeFile(backupFile, currentContents, "utf8");
    await this.appendBackupIndex(backupFile);
    await writeFile(plan.targetFile, normalizedContents, "utf8");

    const result: PatchExecutionResult = {
      status: "applied",
      targetFile: plan.targetFile,
      backupFile,
      auditLogFile,
      reason: "Guarded apply completed with backup and audit trail.",
    };
    await this.appendAuditLog(result, plan, dryRunValidation);
    await this.writeStatus(result, plan, dryRunValidation);
    return result;
  }

  private async appendAuditLog(
    result: PatchExecutionResult,
    plan: PatchPlan,
    dryRunValidation: DryRunValidation,
  ): Promise<void> {
    const auditLogFile = join(this.options.auditDir, "patch-log.jsonl");
    await mkdir(dirname(auditLogFile), { recursive: true });

    const entry = {
      recordedAt: this.options.now().toISOString(),
      result,
      plan: {
        targetFile: plan.targetFile,
        mode: plan.mode,
        applyReady: plan.applyReady,
      },
      dryRunValidation: {
        canApply: dryRunValidation.canApply,
        matchedSource: dryRunValidation.matchedSource,
        reasons: dryRunValidation.reasons,
      },
    };

    let existing = "";
    try {
      existing = await readFile(auditLogFile, "utf8");
    } catch {
      existing = "";
    }

    const line = `${JSON.stringify(entry)}\n`;
    await writeFile(auditLogFile, `${existing}${line}`, "utf8");
  }

  private async appendBackupIndex(backupFile: string): Promise<void> {
    const indexFile = join(this.options.backupDir, ".index");

    let existing = "";
    try {
      existing = await readFile(indexFile, "utf8");
    } catch {
      existing = "";
    }

    await writeFile(indexFile, `${existing}${backupFile}\n`, "utf8");
  }

  private async writeStatus(
    result: PatchExecutionResult,
    plan: PatchPlan,
    dryRunValidation: DryRunValidation,
  ): Promise<void> {
    await writeStatusSnapshot({
      updatedAt: this.options.now().toISOString(),
      channel: "patch",
      payload: {
        result,
        plan: {
          targetFile: plan.targetFile,
          mode: plan.mode,
          applyReady: plan.applyReady,
        },
        dryRunValidation: {
          canApply: dryRunValidation.canApply,
          matchedSource: dryRunValidation.matchedSource,
          reasons: dryRunValidation.reasons,
        },
      },
    });
  }

  private normalizeAppliedModule(contents: string): string {
    const lines = contents.split("\n");
    const importLines = [...new Set(lines.filter((line) => line.startsWith("import ")))].sort();
    const bodyLines = lines.filter((line) => !line.startsWith("import "));
    const collapsedBody = this.collapseBlankLines(bodyLines);

    return [...importLines, "", ...collapsedBody].join("\n").trimEnd() + "\n";
  }

  private collapseBlankLines(lines: string[]): string[] {
    const output: string[] = [];
    let previousBlank = false;

    for (const line of lines) {
      const isBlank = line.trim() === "";
      if (isBlank && previousBlank) {
        continue;
      }

      output.push(line);
      previousBlank = isBlank;
    }

    return output;
  }
}

export function createPatchExecutor(options?: PatchExecutorOptions): PatchExecutor {
  return new PatchExecutor(options);
}
