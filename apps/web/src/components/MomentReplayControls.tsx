import { ChevronLeft, ChevronRight, CornerUpLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import type { MomentReplayPresentation } from "../hooks/useExperimentWorkspace";
import "../styles/moment-replay.css";
import { tickLabel } from "./ui";

export function MomentReplayControls({
  replay,
  onSelectBeat,
  onExit,
}: {
  replay: MomentReplayPresentation;
  onSelectBeat: (index: number) => void;
  onExit: () => void;
}) {
  const replayRef = useRef<HTMLElement>(null);
  const activeBeat = replay.beats[replay.activeBeatIndex];

  useEffect(() => replayRef.current?.focus(), []);

  if (!activeBeat) return null;

  return (
    <section
      ref={replayRef}
      className="moment-replay"
      aria-labelledby="moment-replay-heading"
      tabIndex={-1}
    >
      <header className="moment-replay__header">
        <div>
          <span className="eyebrow">Isolated observation</span>
          <h2 id="moment-replay-heading">{replay.title}</h2>
        </div>
        <button type="button" className="moment-replay__exit" onClick={onExit}>
          <CornerUpLeft aria-hidden="true" size={15} />
          Return to live world
        </button>
      </header>

      <ol className="moment-replay__beats" aria-label="Replay beats">
        {replay.beats.map((beat, index) => (
          <li key={beat.id}>
            <button
              type="button"
              aria-pressed={index === replay.activeBeatIndex}
              className={index === replay.activeBeatIndex ? "is-active" : ""}
              onClick={() => onSelectBeat(index)}
            >
              <span>{index + 1}</span>
              {beat.label}
            </button>
          </li>
        ))}
      </ol>

      <div className="moment-replay__readout" aria-live="polite">
        <div>
          <strong>{activeBeat.label}</strong>
          <span>{tickLabel(activeBeat.tick)}</span>
        </div>
        <p>{activeBeat.summary}</p>
      </div>

      <div className="moment-replay__navigation">
        <button
          type="button"
          disabled={replay.activeBeatIndex === 0}
          onClick={() => onSelectBeat(replay.activeBeatIndex - 1)}
        >
          <ChevronLeft aria-hidden="true" size={15} />
          Previous beat
        </button>
        <span>
          Live simulation paused; replay camera locked. Returning restores your live view.
        </span>
        <button
          type="button"
          disabled={replay.activeBeatIndex === replay.beats.length - 1}
          onClick={() => onSelectBeat(replay.activeBeatIndex + 1)}
        >
          Next beat
          <ChevronRight aria-hidden="true" size={15} />
        </button>
      </div>
    </section>
  );
}
