/**
 * Where the control plane runs its safekeepers (docs-internal/platform/
 * control-plane.mdx, "Safekeeper layout"). A pure function of the cluster's
 * nodes and the safekeepers that exist, so it is unit-tested without a cluster.
 *
 * Policy, for `count` safekeepers (3 in production):
 *
 * - spread over as many distinct eligible nodes as there are, up to `count`:
 *   1 node holds all 3, 2 nodes hold 2 + 1, 3 or more hold one each;
 * - nodes that already hold safekeepers keep them (no churn when a node with
 *   more free space joins); new nodes are chosen by most free capacity, then
 *   lowest id;
 * - at most one safekeeper moves per plan, so a timeline's quorum is never
 *   disturbed by two simultaneous replacements.
 *
 * Availability zones do not matter here: every safekeeper has its own logical
 * zone (`az-<id>`), so the storage controller's distinct-zone rule is met on any
 * number of nodes (neon/safekeepers.ts).
 */

export interface LayoutNode {
  id: number;
  /** Carries the label that allows safekeepers (`alloydb.net/pageserver=true`). */
  eligible: boolean;
  /** The node's Ready condition. */
  ready: boolean;
  /**
   * Estimate of free space for new data, in bytes: the node's allocatable
   * ephemeral storage minus the volumes our safekeepers already claim there.
   * Only used to rank candidates, never as a hard limit.
   */
  freeBytes: number;
}

export interface LayoutSafekeeper {
  id: number;
  nodeId: number;
}

export interface LayoutPlan {
  /** Node for each missing safekeeper, in creation order (fresh clusters and losses). */
  create: number[];
  /** Replace one safekeeper by a new one on another node, or null when balanced. */
  move: { remove: number; fromNodeId: number; toNodeId: number } | null;
  /**
   * Safekeepers the policy cannot move: their node is gone or not Ready. A
   * transient outage resolves itself; a lost node needs the manual procedure.
   */
  stranded: number[];
  /** Why nothing can be planned (for example no eligible Ready node), else null. */
  blocked: string | null;
  /** Desired safekeepers per eligible Ready node. */
  target: Record<number, number>;
}

interface PlanInput {
  nodes: LayoutNode[];
  /** Safekeepers that exist and are not being retired (`creating` or `active`). */
  safekeepers: LayoutSafekeeper[];
  count: number;
}

const byCapacityThenId = (a: LayoutNode, b: LayoutNode) =>
  b.freeBytes - a.freeBytes || a.id - b.id;

export function planSafekeeperLayout(input: PlanInput): LayoutPlan {
  const { count } = input;
  const nodes = new Map(input.nodes.map((n) => [n.id, n]));
  const usable = input.nodes.filter((n) => n.eligible && n.ready);
  const usableIds = new Set(usable.map((n) => n.id));

  const held = new Map<number, LayoutSafekeeper[]>();
  for (const sk of input.safekeepers) {
    held.set(sk.nodeId, [...(held.get(sk.nodeId) ?? []), sk]);
  }
  const heldOn = (nodeId: number) => held.get(nodeId)?.length ?? 0;

  // A safekeeper on a node that exists, is Ready and lost its label is
  // evacuated. One on a node that is gone or not Ready stays where it is.
  const evacuating = input.safekeepers.filter((sk) => {
    const node = nodes.get(sk.nodeId);
    return node?.ready && !node.eligible;
  });
  const fixed = input.safekeepers.filter(
    (sk) => !usableIds.has(sk.nodeId) && !evacuating.includes(sk),
  );

  const plan: LayoutPlan = {
    create: [],
    move: null,
    stranded: fixed.map((sk) => sk.id),
    blocked: null,
    target: {},
  };
  if (usable.length === 0) {
    plan.blocked = 'no eligible node is Ready';
    return plan;
  }

  // Desired count per usable node: what the fixed safekeepers leave, spread
  // evenly. Holders rank first (fewest moves), then free capacity, and the first
  // `extra` nodes take one more.
  const spreadable = Math.max(0, count - fixed.length);
  const hosts = Math.min(usable.length, spreadable);
  const ranked = [...usable].sort(
    (a, b) => heldOn(b.id) - heldOn(a.id) || byCapacityThenId(a, b),
  );
  for (const node of usable) plan.target[node.id] = 0;
  ranked.slice(0, hosts).forEach((node, index) => {
    plan.target[node.id] =
      Math.floor(spreadable / hosts) + (index < spreadable % hosts ? 1 : 0);
  });

  // Room left on a node: its target minus what it holds and what this plan adds.
  const planned = new Map<number, number>();
  const room = (node: LayoutNode) =>
    (plan.target[node.id] ?? 0) - heldOn(node.id) - (planned.get(node.id) ?? 0);
  const nextHost = () =>
    usable
      .filter((node) => room(node) > 0)
      .sort((a, b) => room(b) - room(a) || byCapacityThenId(a, b))[0];

  const missing = count - input.safekeepers.length;
  for (let i = 0; i < missing; i++) {
    const node = nextHost();
    if (!node) {
      plan.blocked = 'every eligible node already holds its share';
      break;
    }
    plan.create.push(node.id);
    planned.set(node.id, (planned.get(node.id) ?? 0) + 1);
  }
  if (missing > 0) return plan;

  // Fully populated: the one move that brings the fleet closest to the target.
  // Evacuations first, then the node most over its share.
  const destination = nextHost();
  if (!destination) return plan;
  const leaving = evacuating.at(-1);
  if (leaving) {
    plan.move = {
      remove: leaving.id,
      fromNodeId: leaving.nodeId,
      toNodeId: destination.id,
    };
    return plan;
  }
  const overage = (node: LayoutNode) =>
    heldOn(node.id) - (plan.target[node.id] ?? 0);
  const over = usable
    .filter((node) => overage(node) > 0)
    .sort((a, b) => overage(b) - overage(a) || a.id - b.id)[0];
  const victim = over
    ? [...(held.get(over.id) ?? [])].sort((a, b) => b.id - a.id)[0]
    : undefined;
  if (over && victim) {
    plan.move = {
      remove: victim.id,
      fromNodeId: over.id,
      toNodeId: destination.id,
    };
  }
  return plan;
}
