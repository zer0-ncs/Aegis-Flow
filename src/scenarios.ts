import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Architect, MockAIGovernor } from "./Architect.ts";
import { RollbackManager } from "./RollbackManager.ts";
import { Sentinel } from "./Sentinel.ts";
import { ORIGINAL_WORKFLOW_ENGINE_SOURCE } from "./runtime/workflow-engine.fixture.ts";

const TARGET_FILE = "src/runtime/workflow-engine.ts";

async function seedRuntimeFixture(): Promise<void> {
  await writeFile(TARGET_FILE, ORIGINAL_WORKFLOW_ENGINE_SOURCE, "utf8");
}

async function createComplexIncident(overrides?: {
  functionSource?: string;
}): Promise<{
  message: string;
  code: string;
  source: "application";
  service: string;
  metadata: {
    governorPreview: Awaited<ReturnType<MockAIGovernor["decide"]>>;
    sourceSnapshot: {
      filePath: string;
      functionName: string;
      governorProfileId: string;
      functionSource: string;
    };
  };
  stack: string;
}> {
  return {
    message:
      "Unhandled exception: orchestration race in complex decision tree caused overflow",
    code: "E_COMPLEX_RUNTIME",
    source: "application",
    service: "workflow-engine",
    metadata: {
      governorPreview: await new MockAIGovernor().decide({
        error: "complex orchestration overflow",
        functionName: "processDecisionTree",
        args: [{ requestId: "REQ-42" }],
        attempt: 1,
      }),
      sourceSnapshot: {
        filePath: TARGET_FILE,
        functionName: "processDecisionTree",
        governorProfileId: "complex-logic",
        functionSource:
          overrides?.functionSource ??
          [
            "export async function processDecisionTree(input: DecisionInput) {",
            "  const branchGraph = await buildBranchGraph(input);",
            "  const projection = await projectFutureState(branchGraph);",
            "  return projection.nodes.reduce((state, node) => state.merge(node.evaluate()), seedState);",
            "}",
          ].join("\n"),
      },
    },
    stack: [
      "Error: orchestration race in complex decision tree caused overflow",
      "at processDecisionTree (/srv/aegis/workflow-engine.ts:148:21)",
      "at coordinateAgents (/srv/aegis/orchestrator.ts:92:13)",
    ].join("\n"),
  };
}

async function runApplyScenario(): Promise<void> {
  await seedRuntimeFixture();

  const architect = new Architect();
  const sentinel = new Sentinel(architect, {
    serviceName: "sentinel-core",
    autoEscalateThreshold: "high",
  });

  const incident = await sentinel.detectAndEscalate(await createComplexIncident());

  assert.ok(incident, "Sentinel should escalate the complex runtime failure.");

  const report = architect.getLatestReport();
  assert.ok(report, "Architect should produce a report.");
  assert.equal(report.execution?.status, "applied");
  assert.equal(report.dryRunValidation.canApply, true);

  const patchedContents = await readFile(TARGET_FILE, "utf8");
  assert.match(patchedContents, /createComplexLogicGovernor/);
  assert.match(patchedContents, /export const processDecisionTree = createAIOptimizationWrapper/);
}

async function runGuardedSkipScenario(): Promise<void> {
  await seedRuntimeFixture();

  const architect = new Architect();
  const sentinel = new Sentinel(architect, {
    serviceName: "sentinel-core",
    autoEscalateThreshold: "high",
  });

  await sentinel.detectAndEscalate(
    await createComplexIncident({
      functionSource: [
        "export async function processDecisionTree(input: DecisionInput) {",
        "  throw new Error('stale snapshot');",
        "}",
      ].join("\n"),
    }),
  );

  const report = architect.getLatestReport();
  assert.ok(report, "Architect should still produce a report for guarded skip.");
  assert.equal(report.dryRunValidation.matchedSource, true);
  assert.equal(report.execution?.status, "failed");

  const currentContents = await readFile(TARGET_FILE, "utf8");
  assert.equal(currentContents, ORIGINAL_WORKFLOW_ENGINE_SOURCE);
}

async function runRollbackScenario(): Promise<void> {
  const rollbackManager = new RollbackManager();
  const result = await rollbackManager.rollbackLatest(TARGET_FILE);

  assert.equal(result.status, "restored");

  const restoredContents = await readFile(TARGET_FILE, "utf8");
  assert.equal(restoredContents, ORIGINAL_WORKFLOW_ENGINE_SOURCE);
}

async function main(): Promise<void> {
  await runApplyScenario();
  await runRollbackScenario();
  await runGuardedSkipScenario();
  console.log("[Scenarios] apply + rollback + guarded-skip passed");
}

void main().catch((error) => {
  console.error("[Scenarios] failed", error);
  process.exitCode = 1;
});
