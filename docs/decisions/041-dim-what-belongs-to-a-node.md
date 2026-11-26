# 041: A dim fades what belongs to the nodes it fades

## Context

In a user's preview, a beat dimmed every neuron of a "Hidden layer" zone. The
boxes and their labels faded, but the zone's name stayed at full strength
beside its faint dashed platform, and a badge ("0.45") on one of the faded
neurons stayed bright, reading as that node's label. Decision 035 made a dim
fade nodes and the edges touching them; zones and the overlays on a node had
no `dim` of their own, and the overlays are drawn in an HTML layer that a
node's opacity does not reach.

## Decision

- **A zone fades when the focus keeps none of its nodes**, platform and name
  together. A zone with a kept node stays bright, so a focus inside a zone
  still shows where it is.
- **A badge or callout fades with the node it is on**, and comes back with it.
- `focusTweens` gives these targets the same `dim` as nodes and edges, and
  every drawing fades by one rule, `dimOpacity` (`src/engine/iso/tweens.ts`).

## Alternatives

- **Read a node's `dim` in the overlay's drawing code.** Fewer tweens, but the
  state at time t would no longer say what is faded, and the zone still needs
  its own rule.
- **Fade a zone when any of its nodes fades.** A focus on one node of a zone
  would then fade the zone it stands in.
