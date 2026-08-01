import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FlagTriangleRight,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import { useId } from "react";
import type { EventPacingPreference } from "@tiny-civ/sim-core";
import type { EntityId } from "../model";
import type { MomentQueueItem } from "../moments/event-presentation";
import "../styles/moments.css";
import { tickLabel } from "./ui";

function participantNames(
  moment: MomentQueueItem,
  resolveParticipantName: ((id: EntityId) => string | undefined) | undefined,
): string[] {
  if (!resolveParticipantName) return [];
  return [...new Set([...moment.latestEvent.actorIds, ...moment.latestEvent.targetIds])]
    .map(resolveParticipantName)
    .filter((name): name is string => Boolean(name));
}

export function MomentQueue({
  moments,
  activeMomentId,
  resolveParticipantName,
  onSelectMoment,
  onInspectMoment,
  onReplayMoment,
  onContinueMoment,
  onDismissMoment,
  pacingPreference,
  onPacingPreferenceChange,
}: {
  moments: readonly MomentQueueItem[];
  activeMomentId: number | null;
  resolveParticipantName?: (id: EntityId) => string | undefined;
  onSelectMoment: (momentId: number) => void;
  onInspectMoment: (momentId: number) => void;
  onReplayMoment: (momentId: number) => void;
  onContinueMoment: (momentId: number) => void;
  onDismissMoment: (momentId: number) => void;
  pacingPreference: EventPacingPreference;
  onPacingPreferenceChange: (preference: EventPacingPreference) => void;
}) {
  const headingId = useId();
  if (moments.length === 0) return null;
  const activeIndex = Math.max(
    0,
    moments.findIndex((moment) => moment.id === activeMomentId),
  );
  const moment = moments[activeIndex] ?? moments[0];
  if (!moment) return null;
  const participants = participantNames(moment, resolveParticipantName);
  const previous = moments[(activeIndex - 1 + moments.length) % moments.length];
  const next = moments[(activeIndex + 1) % moments.length];
  const repeated = moment.occurrenceCount > 1;

  return (
    <section
      className={`moment-queue moment-queue--${moment.attentionTier.toLowerCase()}`}
      aria-labelledby={headingId}
    >
      <header className="moment-queue__header">
        <div>
          <span className="eyebrow">Recoverable observation</span>
          <h2 id={headingId}>Moment queue</h2>
        </div>
        <div className="moment-queue__settings">
          <label>
            <span>Pacing</span>
            <select
              value={pacingPreference}
              onChange={(event) =>
                onPacingPreferenceChange(event.target.value as EventPacingPreference)
              }
            >
              <option value="HIGHLIGHT_ONLY">Highlight</option>
              <option value="SLOW_SIGNIFICANT">Slow at significant</option>
              <option value="PAUSE_CRITICAL">Pause at critical</option>
            </select>
          </label>
          <span className="moment-queue__count" aria-label={`${moments.length} moments`}>
            {activeIndex + 1}/{moments.length}
          </span>
        </div>
      </header>

      <article className="moment-card">
        <div className="moment-card__meta">
          <span className="moment-card__tier">
            <FlagTriangleRight aria-hidden="true" size={13} />
            {moment.attentionTier === "CRITICAL" ? "Critical" : "Significant"}
          </span>
          <time>{tickLabel(moment.latestTick)}</time>
        </div>
        <h3>{moment.latestEvent.title}</h3>
        <p className="moment-card__detail">
          <span>Recorded outcome</span>
          {moment.latestEvent.detail}
        </p>
        <p className="moment-card__reason">
          <span>Factual reason</span>
          {moment.latestEvent.reason ??
            "No linked decision reason was retained for this observation."}
        </p>
        {participants.length > 0 ? (
          <p className="moment-card__participants">
            <span>Participants</span>
            <strong>{participants.join(", ")}</strong>
          </p>
        ) : null}
        {repeated ? (
          <p className="moment-card__repeat">
            {moment.occurrenceCount} related observations, first seen at{" "}
            {tickLabel(moment.firstTick)}.
          </p>
        ) : null}
        <div className="moment-card__actions">
          <button type="button" onClick={() => onInspectMoment(moment.id)}>
            <Eye aria-hidden="true" size={15} />
            Inspect evidence
          </button>
          <button type="button" onClick={() => onReplayMoment(moment.id)}>
            <RotateCcw aria-hidden="true" size={15} />
            Replay
          </button>
          <button
            type="button"
            className="moment-card__continue"
            onClick={() => onContinueMoment(moment.id)}
          >
            <Play aria-hidden="true" size={15} />
            Continue
          </button>
          <button
            type="button"
            className="moment-card__dismiss"
            onClick={() => onDismissMoment(moment.id)}
          >
            <X aria-hidden="true" size={15} />
            Dismiss
          </button>
        </div>
      </article>

      {moments.length > 1 && previous && next ? (
        <nav className="moment-queue__navigation" aria-label="Queued moments">
          <button
            type="button"
            aria-label="Show newer queued moment"
            onClick={() => onSelectMoment(previous.id)}
          >
            <ChevronLeft aria-hidden="true" size={15} />
          </button>
          <span>{moments.length - 1} more retained</span>
          <button
            type="button"
            aria-label="Show older queued moment"
            onClick={() => onSelectMoment(next.id)}
          >
            <ChevronRight aria-hidden="true" size={15} />
          </button>
        </nav>
      ) : null}
    </section>
  );
}
