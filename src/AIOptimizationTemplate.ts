import type { SourceContext } from "./Architect.ts";

export interface AIOptimizationTemplateInput {
  targetFile: string;
  functionName: string;
  sourceContext?: SourceContext;
}

export function buildAIOptimizationTemplate(
  input: AIOptimizationTemplateInput,
): string {
  const runtimeImportPath = resolveRuntimeImportPath(input.targetFile);
  const sourceSnapshotComment = input.sourceContext?.functionSource
    ? "// Source snapshot matched during synthesis."
    : null;

  return [
    `import { createAIOptimizationWrapper } from "${runtimeImportPath}";`,
    "",
    `// Architect generated containment patch for ${input.functionName}.`,
    `// Target: ${input.targetFile}`,
    ...(sourceSnapshotComment ? [sourceSnapshotComment] : []),
    "",
    `const ${input.functionName}Protected = createAIOptimizationWrapper(`,
    `  "${input.functionName}",`,
    `  ${input.functionName},`,
    `  aiGovernor, // TODO: inject a concrete AIRuntimeGovernor implementation`,
    `);`,
  ].join("\n");
}

export function buildWrappedCoreExport(
  functionSource: string,
  functionName: string,
): string | null {
  const match =
    /^export\s+(async\s+)?function\s+[A-Za-z0-9_]+\s*(\([^)]*\)\s*\{[\s\S]*\})$/.exec(
      functionSource,
    );

  if (!match) {
    return null;
  }

  const asyncKeyword = match[1] ?? "";
  const signatureAndBody = match[2];

  return [
    `const ${functionName}Core = ${asyncKeyword}function ${signatureAndBody}`,
    "",
    `export const ${functionName} = createAIOptimizationWrapper(`,
    `  "${functionName}",`,
    `  ${functionName}Core,`,
    `  aiGovernor,`,
    `);`,
  ].join("\n");
}

function resolveRuntimeImportPath(targetFile: string): string {
  const depth = targetFile.split("/").slice(0, -1).length;
  const up = depth <= 1 ? "." : "../".repeat(depth - 1).replace(/\/$/, "");
  return `${up}/runtime/AIOptimizationRuntime.ts`;
}
