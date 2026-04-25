import { readFile } from "node:fs/promises";

export interface PatchAuditEntry {
  recordedAt?: string;
  result?: {
    status?: string;
    targetFile?: string;
    backupFile?: string;
    reason?: string;
  };
  plan?: {
    targetFile?: string;
    mode?: string;
    applyReady?: boolean;
  };
  dryRunValidation?: {
    canApply?: boolean;
    matchedSource?: boolean;
    reasons?: string[];
  };
}

export interface RollbackAuditEntry {
  recordedAt?: string;
  result?: {
    status?: string;
    targetFile?: string;
    backupFile?: string;
    reason?: string;
  };
}

export interface AuditSummary {
  patchEvents: number;
  rollbackEvents: number;
  lastPatchStatus?: string;
  lastRollbackStatus?: string;
  lastPatchedTarget?: string;
  lastPatchAt?: string;
  lastPatchReason?: string;
  lastRollbackAt?: string;
  lastRollbackReason?: string;
}

export async function buildAuditSummary(): Promise<AuditSummary> {
  const patchEntries = await readPatchAuditEntries();
  const rollbackEntries = await readRollbackAuditEntries();

  const lastPatch = patchEntries.at(-1);
  const lastRollback = rollbackEntries.at(-1);

  return {
    patchEvents: patchEntries.length,
    rollbackEvents: rollbackEntries.length,
    lastPatchStatus: lastPatch?.result?.status,
    lastRollbackStatus: lastRollback?.result?.status,
    lastPatchedTarget: lastPatch?.result?.targetFile,
    lastPatchAt: lastPatch?.recordedAt,
    lastPatchReason: lastPatch?.result?.reason,
    lastRollbackAt: lastRollback?.recordedAt,
    lastRollbackReason: lastRollback?.result?.reason,
  };
}

export async function readPatchAuditEntries(): Promise<PatchAuditEntry[]> {
  return (await readJsonLines(".aegis-flow/audit/patch-log.jsonl")) as PatchAuditEntry[];
}

export async function readRollbackAuditEntries(): Promise<RollbackAuditEntry[]> {
  return (await readJsonLines(".aegis-flow/audit/rollback-log.jsonl")) as RollbackAuditEntry[];
}

async function readJsonLines(path: string): Promise<unknown[]> {
  try {
    const content = await readFile(path, "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}
