import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface AegisFlowStatus {
  updatedAt: string;
  channel: "patch" | "rollback";
  payload: Record<string, unknown>;
}

const STATUS_FILE = ".aegis-flow/status.json";

export async function writeStatusSnapshot(status: AegisFlowStatus): Promise<void> {
  await mkdir(dirname(STATUS_FILE), { recursive: true });
  await writeFile(STATUS_FILE, `${JSON.stringify(status, null, 2)}\n`, "utf8");
}

export function getStatusSnapshotPath(): string {
  return STATUS_FILE;
}
