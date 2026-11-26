import { useState } from "react";
import { CAMERA_LIMITS, type Camera } from "../schema/config.ts";
import type { Storyboard } from "../schema/storyboard.ts";
import { INPUT_CLASS, LABEL_CLASS, Section } from "./style-fields.tsx";

type Cameras = Readonly<Record<string, Camera>>;

/** Where a scene's camera starts: framed as it fits. */
const FITTED: Camera = { zoom: 1, x: 0, y: 0 };

/** A camera that changes nothing is left out, so it compares equal to one never set. */
const isFitted = (camera: Camera) => camera.zoom === 1 && camera.x === 0 && camera.y === 0;

/** One slider, in percent of the value it sets. */
const Slider = ({
  id,
  label,
  value,
  min,
  max,
  set,
  show,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  set: (value: number) => void;
  show: (value: number) => string;
}) => (
  <>
    <label className={LABEL_CLASS} htmlFor={id}>
      {label} <span className="font-normal text-muted">{show(value)}</span>
    </label>
    <input
      id={id}
      type="range"
      className="mt-1.5 w-full accent-accent"
      min={Math.round(min * 100)}
      max={Math.round(max * 100)}
      step={1}
      value={Math.round(value * 100)}
      onChange={(e) => set(Number(e.target.value) / 100)}
    />
  </>
);

/**
 * The style gate's camera (decision 044): for one scene at a time, zoom in
 * and move the graph from where it fits, with the preview redrawing as the
 * sliders move, and Reset to fit it again.
 */
export const CameraCard = ({
  scenes,
  cameras,
  change,
}: {
  scenes: Storyboard["scenes"];
  cameras: Cameras;
  /** The cameras as they now are; empty when every scene fits. */
  change: (cameras: Cameras) => void;
}) => {
  const [picked, setPicked] = useState(scenes[0]?.id);
  const scene = scenes.find((s) => s.id === picked) ?? scenes[0];
  if (!scene) return null;
  const camera = cameras[scene.id] ?? FITTED;
  const set = (next: Partial<Camera>) => {
    const { [scene.id]: _old, ...others } = cameras;
    const moved = { ...camera, ...next };
    change(isFitted(moved) ? others : { ...others, [scene.id]: moved });
  };
  const { zoom, move } = CAMERA_LIMITS;
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const signed = (less: string, more: string) => (value: number) =>
    value === 0 ? "centred" : `${Math.round(Math.abs(value) * 100)}% ${value < 0 ? less : more}`;
  return (
    <Section title="Camera">
      <p className="text-muted text-sm">
        Zoom in and move the graph, for a scene with room around it. The checks say if it no longer
        fits.
      </p>
      {scenes.length > 1 && (
        <>
          <label className={LABEL_CLASS} htmlFor="style-camera-scene">
            Scene
          </label>
          <select
            id="style-camera-scene"
            className={INPUT_CLASS}
            value={scene.id}
            onChange={(e) => setPicked(e.target.value)}
          >
            {scenes.map((s, i) => (
              <option key={s.id} value={s.id}>
                {i + 1} · {s.title}
              </option>
            ))}
          </select>
        </>
      )}
      <Slider
        id="style-camera-zoom"
        label="Zoom"
        value={camera.zoom}
        min={zoom.min}
        max={zoom.max}
        set={(value) => set({ zoom: value })}
        show={percent}
      />
      <Slider
        id="style-camera-x"
        label="Left or right"
        value={camera.x}
        min={-move}
        max={move}
        set={(value) => set({ x: value })}
        show={signed("left", "right")}
      />
      <Slider
        id="style-camera-y"
        label="Up or down"
        value={camera.y}
        min={-move}
        max={move}
        set={(value) => set({ y: value })}
        show={signed("up", "down")}
      />
      <button
        type="button"
        className="mt-3 text-muted text-sm underline hover:text-ink disabled:no-underline disabled:opacity-50"
        disabled={isFitted(camera)}
        onClick={() => set(FITTED)}
      >
        Reset
      </button>
    </Section>
  );
};
