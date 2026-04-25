import { Architect, MockAIGovernor } from "./Architect.ts";
import { buildAuditSummary } from "./AuditSummary.ts";
import { Sentinel } from "./Sentinel.ts";
import { readFile, writeFile } from "node:fs/promises";
import { ORIGINAL_WORKFLOW_ENGINE_SOURCE } from "./runtime/workflow-engine.fixture.ts";

const TARGET_FILE = "src/runtime/workflow-engine.ts";

async function main(): Promise<void> {
  await writeFile(TARGET_FILE, ORIGINAL_WORKFLOW_ENGINE_SOURCE, "utf8");

  const architect = new Architect();
  const sentinel = new Sentinel(architect, {
    serviceName: "sentinel-core",
    autoEscalateThreshold: "high",
  });

  const complexRuntimeFailure = {
    message:
      "Unhandled exception: orchestration race in complex decision tree caused overflow",
    code: "E_COMPLEX_RUNTIME",
    source: "application" as const,
    service: "workflow-engine",
    metadata: {
      executionMode: "autonomous",
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
        functionSource: [
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
      "at resolveBranchSet (/srv/aegis/branching.ts:74:9)",
      "at projectFutureState (/srv/aegis/planner.ts:53:7)",
      "at consolidatePredictions (/srv/aegis/planner.ts:33:5)",
      "at hydrateSharedState (/srv/aegis/runtime.ts:27:3)",
      "at commitTransition (/srv/aegis/runtime.ts:15:2)",
      "at bootstrapLoop (/srv/aegis/index.ts:9:1)",
    ].join("\n"),
  };

  const incident = await sentinel.detectAndEscalate(complexRuntimeFailure);

  console.log("[Demo] Sentinel incident:");
  console.log(JSON.stringify(incident, null, 2));

  console.log("[Demo] Architect latest report:");
  console.log(JSON.stringify(architect.getLatestReport(), null, 2));

  console.log("[Demo] Architect summary:");
  console.log(JSON.stringify(architect.getLatestSummary(), null, 2));

  console.log("[Demo] Audit summary:");
  console.log(JSON.stringify(await buildAuditSummary(), null, 2));

  console.log("[Demo] Patched runtime file:");
  console.log(await readFile(TARGET_FILE, "utf8"));
}

void main().catch((error) => {
  console.error("[Demo] Fatal bootstrap failure", error);
  process.exitCode = 1;
});
