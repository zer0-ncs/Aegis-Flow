export interface DecisionInput {
  requestId: string;
}

interface BranchNode {
  evaluate(): Record<string, unknown>;
}

interface Projection {
  nodes: BranchNode[];
}

const seedState = {
  merge(value: Record<string, unknown>) {
    return { ...value };
  },
};

async function buildBranchGraph(input: DecisionInput): Promise<DecisionInput> {
  return input;
}

async function projectFutureState(_: DecisionInput): Promise<Projection> {
  return {
    nodes: [
      {
        evaluate() {
          return { status: "projected" };
        },
      },
    ],
  };
}

export async function processDecisionTree(input: DecisionInput) {
  const branchGraph = await buildBranchGraph(input);
  const projection = await projectFutureState(branchGraph);
  return projection.nodes.reduce((state, node) => state.merge(node.evaluate()), seedState);
}
