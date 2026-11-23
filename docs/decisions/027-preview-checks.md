# 027: The checks from the Preview gate

## Context

Slice 3.13 adds the checks to the preview gate. Its "Done when" is that a
warning in the example jumps to its beat. The checks already ran from
`explain-it check` and MCP's `check` (2.6, 2.7, 4.3), and wrote
`checks.json` and the contact sheet. The gate already speaks the voice and
mixes the soundtrack as a render does (3.8, decision 026). The checks take
10–30 s on the example, mostly Chrome seeking every beat.

## Decision

- **A button starts them, as a server job.** `POST
  /api/projects/:slug/checks` starts a run; `GET` returns the run's state
  and the last report; the contact sheet is served beside it. Progress goes
  over the event stream as `preview-checks`, beat by beat. A newer run
  stops the older and starts once that one has ended, so two runs never
  write the report at the same time.
- **They wait for the preview's sound.** Narration fit is then timed by the
  measured voice. Loudness measures the preview's soundtrack,
  `cache/preview/<key>.wav`, which is already the render's mix, instead of
  mixing a second one. If the voice failed, narration fit and loudness are
  skipped, as `check` skips them. If only the mix failed, loudness is
  skipped with the mix's own words. `explain-it check` and MCP's `check`
  still mix their own scratch soundtrack.
- **The report names the files it checked.** `files` in `checks.json` is a
  key of the graph, the script, the layout and the style. The gate compares
  it with the files as they are now, and shows an older report marked as
  out of date rather than hiding it. The voice's measured lengths are left
  out of the key, because they follow from the script and the voice
  settings.
- **Under the player, three tabs: Beats, Checks and Contact sheet.** A
  warning jumps to where it shows (its `at`, inside its beat) and opens the
  Beats tab there. Beats with warnings carry a count in the beat list.
  Loudness and the skipped checks name no beat, so they are listed above
  the beat warnings.

## Alternatives

- **Run the checks by themselves whenever the sound is ready.** No button,
  but Chrome would start on every edit, for 10–30 s each time.
- **A scratch mix for loudness, as `check` makes.** That leaves
  `check.ts` alone, but mixes the same soundtrack twice.
- **Hide a report that is out of date.** That is simpler, but the warnings
  from the last run are still a good guide while the user edits.
- **Warnings inline in the beat list.** This keeps one list. The tabs
  follow the carried-over note from 3.8, and keep the beat list as short as
  it is now.
