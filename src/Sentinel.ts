export type SentinelSeverity = "low" | "medium" | "high" | "critical";

export type SentinelSource =
  | "runtime"
  | "application"
  | "network"
  | "filesystem"
  | "security"
  | "unknown";

export interface SentinelSignal {
  message?: string;
  stack?: string;
  source?: SentinelSource;
  service?: string;
  code?: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

export interface SentinelIncident {
  id: string;
  title: string;
  message: string;
  severity: SentinelSeverity;
  source: SentinelSource;
  service: string;
  code?: string;
  stack?: string;
  fingerprint: string;
  metadata: Record<string, unknown>;
  detectedAt: string;
  recommendedAction: string;
}

export interface ArchitectRepairRequest {
  incident: SentinelIncident;
  repairMode: "diagnose" | "hot-patch";
  requestedAt: string;
}

export interface ArchitectPort {
  handleIncident(request: ArchitectRepairRequest): Promise<void>;
}

export interface SentinelOptions {
  serviceName?: string;
  dedupeWindowMs?: number;
  autoEscalateThreshold?: SentinelSeverity;
  now?: () => Date;
}

const SEVERITY_ORDER: Record<SentinelSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const DEFAULT_OPTIONS: Required<SentinelOptions> = {
  serviceName: "aegis-flow",
  dedupeWindowMs: 30_000,
  autoEscalateThreshold: "high",
  now: () => new Date(),
};

export class Sentinel {
  private readonly architect: ArchitectPort;
  private readonly options: Required<SentinelOptions>;
  private readonly incidentHistory = new Map<string, number>();

  constructor(architect: ArchitectPort, options: SentinelOptions = {}) {
    this.architect = architect;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async detectAndEscalate(
    input: Error | SentinelSignal | string,
  ): Promise<SentinelIncident | null> {
    const incident = this.createIncident(input);

    if (this.isDuplicate(incident)) {
      return null;
    }

    if (!this.shouldEscalate(incident.severity)) {
      return incident;
    }

    await this.architect.handleIncident({
      incident,
      repairMode: incident.severity === "critical" ? "hot-patch" : "diagnose",
      requestedAt: this.options.now().toISOString(),
    });

    return incident;
  }

  createIncident(input: Error | SentinelSignal | string): SentinelIncident {
    const signal = this.normalizeSignal(input);
    const message = signal.message ?? "Unknown failure detected";
    const source = signal.source ?? this.classifySource(message, signal.stack);
    const severity = this.classifySeverity(message, signal.stack, signal.code);
    const detectedAt = signal.timestamp ?? this.options.now().toISOString();
    const fingerprint = this.createFingerprint({
      source,
      service: signal.service ?? this.options.serviceName,
      code: signal.code,
      message,
    });

    return {
      id: this.createIncidentId(fingerprint, detectedAt),
      title: this.createTitle(source, severity),
      message,
      severity,
      source,
      service: signal.service ?? this.options.serviceName,
      code: signal.code,
      stack: signal.stack,
      fingerprint,
      metadata: signal.metadata ?? {},
      detectedAt,
      recommendedAction: this.recommendAction(source, severity),
    };
  }

  private normalizeSignal(input: Error | SentinelSignal | string): SentinelSignal {
    if (typeof input === "string") {
      return { message: input, source: "unknown" };
    }

    if (input instanceof Error) {
      return {
        message: input.message,
        stack: input.stack,
        source: "runtime",
        metadata: { name: input.name },
      };
    }

    return input;
  }

  private classifySeverity(
    message: string,
    stack?: string,
    code?: string,
  ): SentinelSeverity {
    const haystack = `${code ?? ""} ${message} ${stack ?? ""}`.toLowerCase();

    if (
      /(panic|fatal|segmentation|outofmemory|oom|unhandled|crash|corrupt|breach|rce)/.test(
        haystack,
      )
    ) {
      return "critical";
    }

    if (
      /(timeout|refused|503|502|failed|exception|denied|unavailable|disconnect)/.test(
        haystack,
      )
    ) {
      return "high";
    }

    if (/(warn|degraded|retry|latency|slow|throttle)/.test(haystack)) {
      return "medium";
    }

    return "low";
  }

  private classifySource(message: string, stack?: string): SentinelSource {
    const haystack = `${message} ${stack ?? ""}`.toLowerCase();

    if (/(fetch|http|socket|dns|tls|network|connection)/.test(haystack)) {
      return "network";
    }

    if (/(enoent|eacces|filesystem|disk|write|read file|permission)/.test(haystack)) {
      return "filesystem";
    }

    if (/(auth|token|permission|forbidden|attack|breach|security)/.test(haystack)) {
      return "security";
    }

    if (/(typeerror|referenceerror|syntaxerror|runtime|exception|stack)/.test(haystack)) {
      return "runtime";
    }

    return "application";
  }

  private createFingerprint(parts: {
    source: SentinelSource;
    service: string;
    code?: string;
    message: string;
  }): string {
    const base = [parts.source, parts.service, parts.code ?? "none", parts.message]
      .join("|")
      .toLowerCase();

    let hash = 0;
    for (let index = 0; index < base.length; index += 1) {
      hash = (hash << 5) - hash + base.charCodeAt(index);
      hash |= 0;
    }

    return `sentinel-${Math.abs(hash)}`;
  }

  private createIncidentId(fingerprint: string, detectedAt: string): string {
    const compactTime = detectedAt.replace(/[-:.TZ]/g, "");
    return `${fingerprint}-${compactTime}`;
  }

  private createTitle(
    source: SentinelSource,
    severity: SentinelSeverity,
  ): string {
    return `${severity.toUpperCase()} ${source.toUpperCase()} incident detected`;
  }

  private recommendAction(
    source: SentinelSource,
    severity: SentinelSeverity,
  ): string {
    if (severity === "critical") {
      return "Trigger immediate containment, generate a hot patch, and verify service recovery.";
    }

    if (source === "network") {
      return "Inspect upstream dependency health, retry policy, and connection exhaustion.";
    }

    if (source === "filesystem") {
      return "Validate file paths, permissions, and storage availability before retrying.";
    }

    if (source === "security") {
      return "Contain the event, rotate credentials if needed, and inspect access boundaries.";
    }

    return "Collect diagnostics, isolate the faulty path, and prepare a targeted repair.";
  }

  private shouldEscalate(severity: SentinelSeverity): boolean {
    return (
      SEVERITY_ORDER[severity] >=
      SEVERITY_ORDER[this.options.autoEscalateThreshold]
    );
  }

  private isDuplicate(incident: SentinelIncident): boolean {
    const now = this.options.now().getTime();
    const previous = this.incidentHistory.get(incident.fingerprint);

    this.incidentHistory.set(incident.fingerprint, now);

    if (previous === undefined) {
      return false;
    }

    return now - previous < this.options.dedupeWindowMs;
  }
}

export function createSentinel(
  architect: ArchitectPort,
  options?: SentinelOptions,
): Sentinel {
  return new Sentinel(architect, options);
}
