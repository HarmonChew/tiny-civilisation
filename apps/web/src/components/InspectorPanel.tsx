import {
  BookOpen,
  Focus,
  LocateFixed,
  PackageOpen,
  Route,
  Sparkles,
  UsersRound,
} from "lucide-react";
import type {
  CandidateView,
  CreatureView,
  EntityId,
  MemoryView,
  RelationshipView,
  TimelineEventView,
  WorldView,
} from "../model";
import { ticksPerSecond } from "../sim-adapter";
import { IconButton, Meter, SectionTitle, formatScore, humanize, tickLabel } from "./ui";

function CandidateRow({ candidate, rank }: { candidate: CandidateView; rank: number }) {
  const positives = candidate.factors.filter((factor) => factor.contribution > 0);
  const negatives = candidate.factors.filter((factor) => factor.contribution < 0);
  return (
    <details className="candidate" open={candidate.selected || rank === 0}>
      <summary>
        <span className="candidate__rank">{rank + 1}</span>
        <span className="candidate__name">
          <strong>{humanize(candidate.action)}</strong>
          <small>
            {humanize(candidate.desire)} → {humanize(candidate.plan)}
          </small>
          {candidate.selected ? <em>chosen</em> : null}
        </span>
        <span className="candidate__score number">{formatScore(candidate.utility)}</span>
      </summary>
      <div className="factor-list">
        {candidate.factors.length === 0 ? (
          <span className="empty-copy">
            No factor detail retained for this alternative.
          </span>
        ) : (
          <>
            {positives.map((factor, index) => (
              <div className="factor factor--positive" key={`${factor.key}-p-${index}`}>
                <span aria-hidden="true">+</span>
                <span>
                  {factor.factLabel ?? factor.label}
                  {factor.factValue === undefined ? null : (
                    <small>retained value {factor.factValue}</small>
                  )}
                </span>
                <strong className="number">
                  {formatScore(Math.abs(factor.contribution))}
                </strong>
              </div>
            ))}
            {negatives.map((factor, index) => (
              <div className="factor factor--negative" key={`${factor.key}-n-${index}`}>
                <span aria-hidden="true">−</span>
                <span>
                  {factor.factLabel ?? factor.label}
                  {factor.factValue === undefined ? null : (
                    <small>retained value {factor.factValue}</small>
                  )}
                </span>
                <strong className="number">
                  {formatScore(Math.abs(factor.contribution))}
                </strong>
              </div>
            ))}
          </>
        )}
      </div>
    </details>
  );
}

function MemoryLine({
  memory,
  creatures,
}: {
  memory: MemoryView;
  creatures: CreatureView[];
}) {
  const subject = creatures.find((creature) => creature.id === memory.subjectId);
  const tone = memory.valence < -0.05 ? "harm" : memory.valence > 0.05 ? "help" : "neutral";
  return (
    <li className={`memory-line memory-line--${tone}`}>
      <span className="memory-line__mark" aria-hidden="true" />
      <div>
        <strong>{humanize(memory.kind)}</strong>
        <span>
          {subject ? `involving ${subject.name} · ` : ""}
          strength {Math.round(memory.strength)}
        </span>
      </div>
      <time>{Math.round(memory.ageTicks / ticksPerSecond)}s ago</time>
    </li>
  );
}

function RelationshipLine({
  relationship,
  onSelect,
}: {
  relationship: RelationshipView;
  onSelect: (id: EntityId) => void;
}) {
  const trustLabel =
    relationship.trust > 0.2
      ? "trusted"
      : relationship.trust < -0.2
        ? "distrusted"
        : "uncertain";
  return (
    <li className="relationship-line">
      <button type="button" onClick={() => onSelect(relationship.otherId)}>
        <span>
          <strong>{relationship.otherName}</strong>
          <em>
            {relationship.direction === "toward"
              ? "feels toward"
              : "feels toward this subject"}
          </em>
        </span>
        <span className={`relationship-trust relationship-trust--${trustLabel}`}>
          {trustLabel}
        </span>
      </button>
      <div className="relationship-measures">
        <span>trust {Math.round(relationship.trust * 100)}</span>
        <span>fear {Math.round(relationship.fear)}</span>
        <span>familiarity {Math.round(relationship.familiarity)}</span>
      </div>
    </li>
  );
}

export function InspectorPanel({
  creature,
  view,
  evidenceEvent,
  followed,
  onFollow,
  onSelect,
}: {
  creature: CreatureView | null;
  view: WorldView;
  evidenceEvent: TimelineEventView | null;
  followed: boolean;
  onFollow: () => void;
  onSelect: (id: EntityId) => void;
}) {
  if (!creature) {
    return (
      <div className="inspector-empty">
        <Focus aria-hidden="true" size={28} />
        <span className="eyebrow">Subject notebook</span>
        <h2>Select a creature in the dish</h2>
        <p>
          Inspect its current intention, alternatives, remembered events, and directional
          relationships. Nothing shown here changes its decisions.
        </p>
      </div>
    );
  }

  const group = view.groups.find((item) => item.id === creature.groupId);
  const evidenceCandidates = evidenceEvent?.decisionCandidates ?? [];
  const shownCandidates =
    evidenceCandidates.length > 0 ? evidenceCandidates : creature.candidates;
  return (
    <div className="inspector-scroll">
      <section className="subject-header" aria-labelledby="subject-heading">
        <div className="subject-header__top">
          <div className="subject-avatar" aria-hidden="true">
            <span
              style={{
                backgroundColor: `#${creature.color.toString(16).padStart(6, "0")}`,
              }}
            />
          </div>
          <div>
            <span className="eyebrow">
              {creature.role}
              {group ? ` · ${group.name}` : " · ungrouped"}
            </span>
            <h2 id="subject-heading">{creature.name}</h2>
          </div>
          <IconButton
            label={followed ? `Stop following ${creature.name}` : `Follow ${creature.name}`}
            icon={LocateFixed}
            pressed={followed}
            onClick={onFollow}
          />
        </div>
        <div className="subject-summary" aria-label={`${creature.name} current summary`}>
          <span className="eyebrow">Current intent</span>
          <dl>
            <div>
              <dt>Desire</dt>
              <dd>{creature.summary.desire}</dd>
            </div>
            <div>
              <dt>Plan / action</dt>
              <dd>
                {creature.summary.plan} {creature.summary.action}
              </dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>{creature.summary.reason}</dd>
            </div>
          </dl>
        </div>
        <div className="vitals-grid">
          <Meter label="Health" value={creature.health} tone="moss" />
          <Meter label="Hunger" value={creature.hunger} tone="coral" inverse />
          <Meter label="Fatigue" value={creature.fatigue} tone="gold" inverse />
        </div>
      </section>

      <section className="inspector-section" aria-labelledby="intentions-heading">
        <SectionTitle
          icon={Route}
          annotation={evidenceCandidates.length > 0 ? "event evidence" : "top five"}
        >
          <span id="intentions-heading">Considered paths</span>
        </SectionTitle>
        {evidenceCandidates.length > 0 && evidenceEvent ? (
          <div className="evidence-note">
            <span>Decision retained at {tickLabel(evidenceEvent.tick)}</span>
            <strong>{evidenceEvent.title}</strong>
          </div>
        ) : null}
        {shownCandidates.length === 0 ? (
          <p className="empty-copy">
            This creature has not retained a decision record yet. Let the simulation run
            until its next reconsideration.
          </p>
        ) : (
          <div className="candidate-list">
            {shownCandidates.map((candidate, index) => (
              <CandidateRow
                candidate={candidate}
                rank={index}
                key={`${candidate.action}-${candidate.targetId ?? "none"}-${index}`}
              />
            ))}
          </div>
        )}
      </section>

      <section className="inspector-section" aria-labelledby="traits-heading">
        <SectionTitle icon={Sparkles}>
          <span id="traits-heading">Disposition</span>
        </SectionTitle>
        <div className="trait-list">
          {creature.traits.map((trait) => (
            <Meter key={trait.key} label={trait.label} value={trait.value} tone="water" />
          ))}
        </div>
      </section>

      <section className="inspector-section" aria-labelledby="inventory-heading">
        <SectionTitle icon={PackageOpen}>
          <span id="inventory-heading">Carried things</span>
        </SectionTitle>
        {creature.inventory.length === 0 ? (
          <p className="empty-copy">Nothing carried.</p>
        ) : (
          <dl className="inventory-list">
            {creature.inventory.map((stack) => (
              <div key={stack.kind}>
                <dt>{humanize(stack.kind)}</dt>
                <dd className="number">{stack.quantity}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="inspector-section" aria-labelledby="memory-heading">
        <SectionTitle icon={BookOpen} annotation={`${creature.memories.length} retained`}>
          <span id="memory-heading">Salient memories</span>
        </SectionTitle>
        {creature.memories.length === 0 ? (
          <p className="empty-copy">No strong episodic memory has formed yet.</p>
        ) : (
          <ol className="memory-list">
            {creature.memories.map((memory) => (
              <MemoryLine key={memory.id} memory={memory} creatures={view.creatures} />
            ))}
          </ol>
        )}
      </section>

      <section className="inspector-section" aria-labelledby="relationships-heading">
        <SectionTitle icon={UsersRound} annotation="directional">
          <span id="relationships-heading">Relationships</span>
        </SectionTitle>
        {creature.relationships.length === 0 ? (
          <p className="empty-copy">
            No relationship edge is strong enough to keep. Shared time and consequential
            interactions will create one.
          </p>
        ) : (
          <ol className="relationship-list">
            {creature.relationships.map((relationship) => (
              <RelationshipLine
                key={`${relationship.direction}-${relationship.otherId}`}
                relationship={relationship}
                onSelect={onSelect}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
