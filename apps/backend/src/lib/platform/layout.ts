import type {
  AdminSafekeeper,
  AdminSafekeeperLayout,
} from "@repo/control-plane-contract";
import type { Tone } from "./format";

export interface LayoutLine {
  tone: Tone;
  text: string;
}

/**
 * The safekeeper layout block in plain words. `nodeNames` maps node ids to
 * names; an id it does not know (a node the portal could not load) is shown
 * as `node <id>`.
 */
export function describeLayout(
  layout: AdminSafekeeperLayout,
  safekeepers: AdminSafekeeper[],
  nodeNames: ReadonlyMap<number, string>,
): LayoutLine[] {
  const name = (id: number) => nodeNames.get(id) ?? `node ${id}`;
  const lines: LayoutLine[] = [];
  const live = safekeepers.filter(
    (sk) => sk.state === "creating" || sk.state === "active",
  );

  lines.push({
    tone: live.length === layout.desired_count ? "good" : "warn",
    text: `The cluster is set to run ${layout.desired_count} safekeepers and ${live.length} ${live.length === 1 ? "is" : "are"} running or starting.`,
  });

  const targets = Object.entries(layout.target_per_node)
    .map(([id, count]) => [Number(id), count] as const)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a - b);
  if (targets.length > 0) {
    const spread = targets
      .map(([id, count]) => `${name(id)} ${count}`)
      .join(", ");
    lines.push({
      tone: "neutral",
      text: `Spread as widely as the Ready nodes allow, the target is: ${spread}.`,
    });
  }

  if (layout.create_on_nodes.length > 0) {
    lines.push({
      tone: "info",
      text: `${layout.create_on_nodes.length} missing safekeeper${layout.create_on_nodes.length === 1 ? "" : "s"} will be started on ${layout.create_on_nodes.map(name).join(", ")}. The worker does this by itself.`,
    });
  }

  if (layout.next_move) {
    const move = layout.next_move;
    lines.push({
      tone: "warn",
      text: `A spread would move safekeeper ${move.remove_safekeeper} from ${name(move.from_node_id)} to ${name(move.to_node_id)}: it starts a new one there, moves the data over, then retires the old one. Run "Spread safekeepers" for each such move.`,
    });
  } else if (layout.blocked === null) {
    lines.push({
      tone: "good",
      text: "Nothing to move: the safekeepers are as spread out as the nodes allow.",
    });
  }

  if (layout.stranded.length > 0) {
    lines.push({
      tone: "bad",
      text: `Safekeeper${layout.stranded.length === 1 ? "" : "s"} ${layout.stranded.join(", ")} ${layout.stranded.length === 1 ? "sits" : "sit"} on a node that is gone or not Ready. They are never moved automatically; bring the node back or replace it by hand.`,
    });
  }

  if (layout.blocked !== null) {
    lines.push({
      tone: "bad",
      text: `Nothing can be planned right now: ${layout.blocked}`,
    });
  }
  return lines;
}
