# 035: A dim is its beat's focus

## Context

A video the assistant made (scene 2 of a neural-network explainer) went
semi-transparent. Its backprop scene dimmed to a different pair of nodes in
three beats, then had a beat with no dim. The engine only ever faded things
out: a later dim did not bring back what it kept, nothing ended a dim before
the scene did, and edges drawn after a dim started faint. By the third beat
the whole scene was faint, and the fourth, meant to show every layer, stayed
so. The SPEC said nothing about how long a dim lasts; the guide said "dim to
focus on a few nodes", which the model read, reasonably, as moving a focus.

## Decision

- **A dim is its beat's focus.** From the dim's start, every node it does
  not keep, and each edge touching one, fades back; whatever it keeps that
  was faint comes back. A later dim moves the focus; a node both keep stays
  bright with no flash.
- **A beat without a dim brings everything back** as it starts.
- **The last beat's focus holds** through the scene's fade-out, so a scene
  that ends on a focus (as the example does) looks as before.
- The builder records each beat's focus and turns the changes between them
  into tweens (`focusTweens`, `src/engine/beats/build.ts`); the action's
  description and the guide say the focus lasts its beat.

## Alternatives

- **A dim lasts until the next dim or the scene's end.** Closer to the old
  behaviour, but the beat that should show everything again stays focused,
  and a scene needs a way to clear a dim that the schema does not have.
- **A separate "undim" action.** More for every author to remember, and the
  model would still forget it.
