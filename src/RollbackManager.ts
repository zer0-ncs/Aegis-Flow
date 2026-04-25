import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeStatusSnapshot } from "./StateStore.ts";

export interface RollbackResult {
  status: "restored" | "skipped" | "failed";
  targetFile: string;
  backupFile?: string;
  auditLogFile: string;
  reason: string;
}

export interface RollbackManagerOptions {
  auditDir?: string;
  backupDir?: string;
  now?: () => Date;
}

const DEFAULT_OPTIONS: Required<RollbackManagerOptions> = {
  auditDir: ".aegis-flow/audit",
  backupDir: ".aegis-flow/backups",
  now: () => new Date(),
};

export class RollbackManager {
  private readonly options: Required<RollbackManagerOptions>;

  constructor(options: RollbackManagerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async rollbackLatest(targetFile: string): Promise<RollbackResult> {
    const auditLogFile = join(this.options.auditDir, "rollback-log.jsonl");
    const prefix = `${targetFile.replaceAll("/", "__")}--`;
    let backupCandidates: string[] = [];

    try {
      const backupIndex = await readFile(join(this.options.backupDir, ".index"), "utf8");
      backupCandidates = backupIndex
        .split("\n")
        .filter((line) => line.includes(prefix))
        .sort();
    } catch {
      backupCandidates = [];
    }

    const latestEntry = backupCandidates.at(-1);

    if (!latestEntry) {
      const result: RollbackResult = {
        status: "skipped",
        targetFile,
        auditLogFile,
        reason: "No backup index entry found for target file.",
      };
      await this.appendAuditLog(result);
      await this.writeStatus(result);
      return result;
    }

    const backupFile = latestEntry;

    try {
      const backupContents = await readFile(backupFile, "utf8");
      await mkdir(dirname(targetFile), { recursive: true });
      await writeFile(targetFile, backupContents, "utf8");

      const result: RollbackResult = {
        status: "restored",
        targetFile,
        backupFile,
        auditLogFile,
        reason: "Rollback restored target file from latest backup.",
      };
      await this.appendAuditLog(result);
      await this.writeStatus(result);
      return result;
    } catch (error) {
      const result: RollbackResult = {
        status: "failed",
        targetFile,
        backupFile,
        auditLogFile,
        reason: error instanceof Error ? error.message : String(error),
      };
      await this.appendAuditLog(result);
      await this.writeStatus(result);
      return result;
    }
  }

  private async appendAuditLog(result: RollbackResult): Promise<void> {
    const auditLogFile = join(this.options.auditDir, "rollback-log.jsonl");
    await mkdir(dirname(auditLogFile), { recursive: true });

    let existing = "";
    try {
      existing = await readFile(auditLogFile, "utf8");
    } catch {
      existing = "";
    }

    const entry = {
      recordedAt: this.options.now().toISOString(),
      result,
    };

    await writeFile(auditLogFile, `${existing}${JSON.stringify(entry)}\n`, "utf8");
  }

  private async writeStatus(result: RollbackResult): Promise<void> {
    await writeStatusSnapshot({
      updatedAt: this.options.now().toISOString(),
      channel: "rollback",
      payload: {
        result,
      },
    });
  }
}

export function createRollbackManager(
  options?: RollbackManagerOptions,
): RollbackManager {
  return new RollbackManager(options);
}
