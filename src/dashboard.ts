import { renderOperatorDashboard } from "./OperatorDashboard.ts";

async function main(): Promise<void> {
  const quiet = process.argv.includes("--quiet");
  const output = await renderOperatorDashboard();
  console.log(quiet ? output.replace(/\n{2,}/g, "\n") : output);
}

void main().catch((error) => {
  console.error("[Dashboard] failed", error);
  process.exitCode = 1;
});
