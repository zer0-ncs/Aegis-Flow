import {
  buildAuditSummary,
  readPatchAuditEntries,
  readRollbackAuditEntries,
} from "./AuditSummary.ts";
import { getStatusSnapshotPath } from "./StateStore.ts";
import { readFile } from "node:fs/promises";

export interface OperatorDashboard {
  generatedAt: string;
  statusFile: string;
  latestStatus?: unknown;
  audit: Awaited<ReturnType<typeof buildAuditSummary>>;
  latestPatch?: {
    at?: string;
    status?: string;
    target?: string;
    mode?: string;
    applyReady?: boolean;
    canApply?: boolean;
    matchedSource?: boolean;
    reason?: string;
  };
  latestRollback?: {
    at?: string;
    status?: string;
    target?: string;
    reason?: string;
  };
}

export async function buildOperatorDashboard(): Promise<OperatorDashboard> {
  const [audit, patchEntries, rollbackEntries] = await Promise.all([
    buildAuditSummary(),
    readPatchAuditEntries(),
    readRollbackAuditEntries(),
  ]);
  const latestStatus = await readLatestStatus();

  const latestPatch = patchEntries.at(-1);
  const latestRollback = rollbackEntries.at(-1);

  return {
    generatedAt: new Date().toISOString(),
    statusFile: getStatusSnapshotPath(),
    latestStatus,
    audit,
    latestPatch: latestPatch
      ? {
          at: latestPatch.recordedAt,
          status: latestPatch.result?.status,
          target: latestPatch.result?.targetFile,
          mode: latestPatch.plan?.mode,
          applyReady: latestPatch.plan?.applyReady,
          canApply: latestPatch.dryRunValidation?.canApply,
          matchedSource: latestPatch.dryRunValidation?.matchedSource,
          reason: latestPatch.result?.reason,
        }
      : undefined,
    latestRollback: latestRollback
      ? {
          at: latestRollback.recordedAt,
          status: latestRollback.result?.status,
          target: latestRollback.result?.targetFile,
          reason: latestRollback.result?.reason,
        }
      : undefined,
  };
}

export async function renderOperatorDashboard(): Promise<string> {
  const dashboard = await buildOperatorDashboard();

  const lines = [
    "Aegis-Flow Operator Dashboard",
    `Generated: ${dashboard.generatedAt}`,
    `Status file: ${dashboard.statusFile}`,
    "",
    "Audit",
    `  Patch events: ${dashboard.audit.patchEvents}`,
    `  Rollback events: ${dashboard.audit.rollbackEvents}`,
    `  Last patch: ${dashboard.audit.lastPatchStatus ?? "n/a"} ${dashboard.audit.lastPatchedTarget ?? ""}`.trim(),
    `  Last rollback: ${dashboard.audit.lastRollbackStatus ?? "n/a"}`,
    "",
    "Latest Patch",
    `  At: ${dashboard.latestPatch?.at ?? "n/a"}`,
    `  Status: ${dashboard.latestPatch?.status ?? "n/a"}`,
    `  Target: ${dashboard.latestPatch?.target ?? "n/a"}`,
    `  Mode: ${dashboard.latestPatch?.mode ?? "n/a"}`,
    `  Apply ready: ${String(dashboard.latestPatch?.applyReady ?? false)}`,
    `  Dry-run can apply: ${String(dashboard.latestPatch?.canApply ?? false)}`,
    `  Matched source: ${String(dashboard.latestPatch?.matchedSource ?? false)}`,
    `  Reason: ${dashboard.latestPatch?.reason ?? "n/a"}`,
    "",
    "Latest Rollback",
    `  At: ${dashboard.latestRollback?.at ?? "n/a"}`,
    `  Status: ${dashboard.latestRollback?.status ?? "n/a"}`,
    `  Target: ${dashboard.latestRollback?.target ?? "n/a"}`,
    `  Reason: ${dashboard.latestRollback?.reason ?? "n/a"}`,
  ];

  return lines.join("\n");
}

async function readLatestStatus(): Promise<unknown | undefined> {
  try {
    const content = await readFile(getStatusSnapshotPath(), "utf8");
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}
