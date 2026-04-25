import type { GeneratedPatch, SourceContext } from "./Architect.ts";
import type { GovernorProfile } from "./GovernorRegistry.ts";

export interface FinalizedPatch {
  strategy: GeneratedPatch["strategy"];
  targetFile: string;
  targetFunction: string;
  patch: string;
  summary: string;
  finalized: boolean;
  finalizationNotes: string[];
}

export class PatchFinalizer {
  finalize(
    generatedPatch: GeneratedPatch,
    governorProfile: GovernorProfile,
    sourceContext?: SourceContext,
  ): FinalizedPatch {
    let patch = generatedPatch.patch;
    const notes: string[] = [];

    if (patch.includes("aiGovernor")) {
      patch = this.injectGovernorBinding(patch, governorProfile, sourceContext);
      notes.push(`Injected governor profile ${governorProfile.id}.`);
    }

    if (patch.includes("TODO: inject a concrete AIRuntimeGovernor implementation")) {
      patch = patch.replace(
        " // TODO: inject a concrete AIRuntimeGovernor implementation",
        "",
      );
    }

    patch = this.normalizeModuleLayout(patch);

    return {
      strategy: generatedPatch.strategy,
      targetFile: generatedPatch.targetFile,
      targetFunction: generatedPatch.targetFunction,
      patch,
      summary: `${generatedPatch.summary} Finalized with governor profile ${governorProfile.id}.`,
      finalized: true,
      finalizationNotes: notes,
    };
  }

  private injectGovernorBinding(
    patch: string,
    governorProfile: GovernorProfile,
    sourceContext?: SourceContext,
  ): string {
    const targetFile = sourceContext?.filePath ?? "src/unknown.ts";
    const relativeImport = this.resolveRelativeImport(targetFile, governorProfile.importPath);

    const importLine = `import { ${governorProfile.exportName} } from "${relativeImport}";`;
    const bindingLine = `const aiGovernor = ${governorProfile.factoryExpression};`;

    const hasImport = patch.includes(importLine);
    const withImport = hasImport ? patch : `${importLine}\n\n${patch}`;

    if (withImport.includes(bindingLine)) {
      return withImport;
    }

    return withImport.replace(
      /const\s+[A-Za-z0-9_]+Protected\s*=\s*createAIOptimizationWrapper\(/,
      (match) => `${bindingLine}\n\n${match}`,
    );
  }

  private resolveRelativeImport(targetFile: string, registryPath: string): string {
    const depth = targetFile.split("/").slice(0, -1).length;
    const up = depth <= 1 ? "." : "../".repeat(depth - 1).replace(/\/$/, "");
    const normalized = registryPath.replace(/^\.\//, "");
    return `${up}/${normalized}`;
  }

  private normalizeModuleLayout(patch: string): string {
    const lines = patch.split("\n");
    const importLines = lines.filter((line) => line.startsWith("import "));
    const bodyLines = lines.filter((line) => !line.startsWith("import "));
    const uniqueImports = [...new Set(importLines)].sort();
    const normalizedBody = this.trimEdgeBlankLines(this.collapseBlankLines(bodyLines));

    return [...uniqueImports, "", ...normalizedBody].join("\n").trim();
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

  private trimEdgeBlankLines(lines: string[]): string[] {
    let start = 0;
    let end = lines.length;

    while (start < end && lines[start]?.trim() === "") {
      start += 1;
    }

    while (end > start && lines[end - 1]?.trim() === "") {
      end -= 1;
    }

    return lines.slice(start, end);
  }
}

export function createPatchFinalizer(): PatchFinalizer {
  return new PatchFinalizer();
}
