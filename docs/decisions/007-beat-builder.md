# 007: Beat builder timing, cues and scene layers

## Context

Slice 1.8 turns a storyboard into one timeline. SPEC gave the beat-length
rule, but not where narration and actions sit inside a beat, how narration
longer than the two-line caption band is shown, or what a scene change does
to the nodes and edges already on screen.

## Decision

- **0.3 s either side.** Narration and actions start 0.3 s into a beat and
  end at least 0.3 s before it ends, so the 0.6 s in the beat rule pads
  actions as well as narration. An action-led beat starting its first tween
  on the beat's first frame looked abrupt next to the step caption entering.
- **Cues by characters.** Narration is split into cues of at most 84
  characters (two 42-character lines), between sentences, else clauses, else
  words. Each cue is on screen for its share of the line's characters. The
  same cues feed `__cues` and the `.srt` in slice 1.9.
- **One layer per scene.** Each scene is drawn on its own layer and framed to
  its own nodes, so the camera stays fixed within a scene. Layers crossfade
  over 0.8 s. A scene starts fresh: it draws only the edges it flows, nodes
  without an `appear` are there from its start, and a zone's platform rises
  with the first of its nodes to appear.
- **Targets are scoped by scene.** The same node or edge has its own timeline
  target in every scene (`node:<scene>/<id>`), so a scene's state never leaks
  into the next.
- **The builder is pure.** `buildBeats` returns tween specs, scene and beat
  spans, planned overlays (naming nodes by id) and cues. The page resolves
  node shapes and draws; the plan is unit-tested on its own.

## Alternatives considered

- One shared stage with a camera move between scenes: SPEC leaves camera
  moves within a scene to later, and a crossfade needs no camera state.
- Carrying drawn edges over into the next scene: the next scene's framing
  differs, and a fresh scene reads more clearly.
- Measuring cue lines against the caption font: needs the DOM, so the core
  could not split cues; a fixed limit fits the band at every caption size.
