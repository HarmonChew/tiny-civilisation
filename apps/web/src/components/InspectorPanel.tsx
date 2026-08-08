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
  GroupView,
  LifeRecordView,
  MemorialView,
  MemoryView,
  RelationshipView,
  StructureView,
  TimelineEventView,
  WorldView,
} from "../model";
import type { WorldRef } from "../focus";
import { ticksPerSecond } from "../sim-adapter";
import { IconButton, Meter, SectionTitle, formatScore, humanize, tickLabel } from "./ui";

function retainedFactText(factor: CandidateView["factors"][number]): string | null {
  if (factor.factValue === undefined) return null;
  if (factor.factUnit === "MOVE_COST") {
    return `weighted travel cost ${factor.factValue} move-cost units`;
  }
  return `retained value ${factor.factValue}`;
}

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
                  {retainedFactText(factor) ? (
                    <small>{retainedFactText(factor)}</small>
                  ) : null}
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
                  {retainedFactText(factor) ? (
                    <small>{retainedFactText(factor)}</small>
                  ) : null}
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

function CreatureNotebook({
  creature,
  view,
  evidenceEvent,
  followed,
  onFollow,
  onSelect,
  onSelectSubject,
}: {
  creature: CreatureView | null;
  view: WorldView;
  evidenceEvent: TimelineEventView | null;
  followed: boolean;
  onFollow: () => void;
  onSelect: (id: EntityId) => void;
  onSelectSubject?: ((ref: WorldRef) => void) | undefined;
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
  const remembered = view.lifeRecords ?? [];
  const nameFor = (id: EntityId | undefined): string | null => {
    if (id === undefined) return null;
    return (
      view.creatures.find((candidate) => candidate.id === id)?.name ??
      remembered.find((candidate) => candidate.id === id)?.name ??
      `Identity ${id}`
    );
  };
  const parentNames = [nameFor(creature.motherId), nameFor(creature.fatherId)].filter(
    (name): name is string => name !== null,
  );
  const childNames = (creature.childIds ?? [])
    .map((id) => nameFor(id))
    .filter((name): name is string => name !== null);
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
          <Meter label="Thirst" value={creature.thirst} tone="water" inverse />
          <Meter label="Fatigue" value={creature.fatigue} tone="gold" inverse />
        </div>
        <details className="subject-summary subject-summary--lifecycle" open>
          <summary>Lifecycle and lineage</summary>
          <dl>
            <div>
              <dt>Biological sex / stage</dt>
              <dd>
                {humanize(creature.sex ?? "UNKNOWN")} /{" "}
                {humanize(creature.lifeStage ?? "UNKNOWN")}
              </dd>
            </div>
            <div>
              <dt>Age</dt>
              <dd>{creature.ageTicks ?? 0} ticks</dd>
            </div>
            <div>
              <dt>Parents</dt>
              <dd>
                {parentNames.length > 0 ? parentNames.join(" and ") : "No recorded parents"}
              </dd>
            </div>
            <div>
              <dt>Children</dt>
              <dd>{childNames.length > 0 ? childNames.join(", ") : "None recorded"}</dd>
            </div>
            {creature.pregnant ? (
              <div>
                <dt>Pregnancy</dt>
                <dd>Due at tick {creature.pregnancyDueTick}</dd>
              </div>
            ) : null}
            {creature.dependent ? (
              <div>
                <dt>Dependent youth</dt>
                <dd>
                  {creature.caregiverId === undefined
                    ? "Caregiver assignment pending"
                    : `Caregiver: ${nameFor(creature.caregiverId)}`}
                </dd>
              </div>
            ) : null}
          </dl>
          {(creature.inheritedTraits?.length ?? 0) > 0 ? (
            <div className="inherited-potential">
              <span className="eyebrow">Inherited trait / skill potential</span>
              <p>
                {[...(creature.inheritedTraits ?? []), ...(creature.skillPotential ?? [])]
                  .map((trait) => `${trait.label} ${Math.round(trait.value)}%`)
                  .join(" / ")}
              </p>
            </div>
          ) : null}
          {(creature.motherId !== undefined || creature.fatherId !== undefined) &&
          onSelectSubject ? (
            <div className="lineage-links" aria-label="Recorded parent links">
              {[creature.motherId, creature.fatherId]
                .filter((id): id is number => id !== undefined)
                .map((id) => {
                  const living = view.creatures.some((candidate) => candidate.id === id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() =>
                        onSelectSubject({ kind: living ? "creature" : "life-record", id })
                      }
                    >
                      Open {nameFor(id)}
                    </button>
                  );
                })}
            </div>
          ) : null}
        </details>
        <div className="subject-summary" aria-label={`${creature.name} water access`}>
          <span className="eyebrow">Nearest potable source</span>
          {creature.waterAccess ? (
            <dl>
              <div>
                <dt>Source stock</dt>
                <dd>
                  Source {creature.waterAccess.sourceId}: {creature.waterAccess.sourceStock}
                  /{creature.waterAccess.sourceCapacity}
                </dd>
              </div>
              <div>
                <dt>Weighted access</dt>
                <dd>{creature.waterAccess.weightedCost} move-cost units</dd>
              </div>
              <div>
                <dt>Source slots</dt>
                <dd>
                  {creature.waterAccess.claimedInteractionSlots}/
                  {creature.waterAccess.interactionCapacity} claimed; reaches{" "}
                  {creature.waterAccess.reachableSources}/
                  {creature.waterAccess.totalSources} sources
                </dd>
              </div>
            </dl>
          ) : (
            <p>No reachable potable source.</p>
          )}
        </div>
        <div className="subject-summary" aria-label={`${creature.name} shelter access`}>
          <span className="eyebrow">Rest destination</span>
          {creature.shelterAccess ? (
            <dl>
              <div>
                <dt>Destination</dt>
                <dd>
                  {creature.shelterAccess.destination === "SHELTERED"
                    ? creature.shelterAccess.shelterId === null
                      ? "Sheltered rest (site identity unavailable)"
                      : `Shelter ${creature.shelterAccess.shelterId}`
                    : creature.shelterAccess.destination === "OUTDOOR"
                      ? "Outdoor rest selected"
                      : "No rest destination"}
                </dd>
              </div>
              <div>
                <dt>Eligibility</dt>
                <dd>
                  {creature.shelterAccess.eligibility === null
                    ? "No shelter evaluated"
                    : humanize(creature.shelterAccess.eligibility)}
                </dd>
              </div>
              <div>
                <dt>Access</dt>
                <dd>
                  {creature.shelterAccess.weightedCost === null
                    ? "No reachable eligible shelter route"
                    : `${creature.shelterAccess.weightedCost} move-cost units`}
                  ; {creature.shelterAccess.reservedSpaces}/
                  {creature.shelterAccess.effectiveCapacity} spaces reserved
                </dd>
              </div>
              <div>
                <dt>Condition</dt>
                <dd>
                  {creature.shelterAccess.condition === null
                    ? "Not applicable to outdoor rest"
                    : `${Math.round(creature.shelterAccess.condition)} percent`}
                </dd>
              </div>
              <div>
                <dt>Why</dt>
                <dd>{creature.shelterAccess.reason}</dd>
              </div>
            </dl>
          ) : (
            <p>
              {creature.action === "REST" ? (
                <>
                  <strong>Outdoor rest selected.</strong> {creature.summary.reason} No
                  reachable eligible communal shelter is recorded, so recovery is weaker.
                </>
              ) : (
                "No current rest destination and no reachable eligible communal shelter. Outdoor rest remains the weaker fallback if fatigue presses."
              )}
            </p>
          )}
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

function LifeRecordNotebook({
  record,
  view,
  onSelectSubject,
}: {
  record: LifeRecordView;
  view: WorldView;
  onSelectSubject?: ((ref: WorldRef) => void) | undefined;
}) {
  const allRecords = view.lifeRecords ?? [];
  const nameFor = (id: EntityId | undefined): string =>
    id === undefined
      ? "Not recorded"
      : (view.creatures.find((candidate) => candidate.id === id)?.name ??
        allRecords.find((candidate) => candidate.id === id)?.name ??
        `Identity ${id}`);
  const group = view.groups.find((candidate) => candidate.id === record.finalGroupId);
  return (
    <div className="inspector-scroll">
      <section
        className="subject-header subject-header--remembered"
        aria-labelledby="subject-heading"
      >
        <div className="subject-header__top">
          <div className="subject-avatar subject-avatar--remembered" aria-hidden="true">
            <BookOpen size={18} />
          </div>
          <div>
            <span className="eyebrow">Permanent life record</span>
            <h2 id="subject-heading">{record.name}</h2>
          </div>
        </div>
        <p className="empty-copy">
          This compact record remains after the full actor state has left the living set.
        </p>
        <dl className="life-record-facts">
          <div>
            <dt>Biological sex</dt>
            <dd>{humanize(record.sex)}</dd>
          </div>
          <div>
            <dt>Life span</dt>
            <dd>
              {record.deathTick < 0
                ? `${record.ageTicks} ticks; exact death tick not recorded`
                : `Tick ${record.birthTick} to ${record.deathTick} (${record.ageTicks} ticks)`}
            </dd>
          </div>
          <div>
            <dt>Final stage</dt>
            <dd>{humanize(record.finalLifeStage)}</dd>
          </div>
          <div>
            <dt>Death cause</dt>
            <dd>{humanize(record.deathCause)}</dd>
          </div>
          <div>
            <dt>Parents</dt>
            <dd>
              {[record.motherId, record.fatherId]
                .filter((id) => id !== undefined)
                .map((id) => nameFor(id))
                .join(" and ") || "No recorded parents"}
            </dd>
          </div>
          <div>
            <dt>Children</dt>
            <dd>
              {record.childIds.map((id) => nameFor(id)).join(", ") || "None recorded"}
            </dd>
          </div>
          <div>
            <dt>Heir</dt>
            <dd>{nameFor(record.heirId)}</dd>
          </div>
          <div>
            <dt>Final group</dt>
            <dd>{group?.name ?? "No final group"}</dd>
          </div>
          <div>
            <dt>Inherited traits</dt>
            <dd>
              {record.inheritedTraits
                .map((trait) => `${trait.label} ${Math.round(trait.value)}%`)
                .join(", ")}
            </dd>
          </div>
          <div>
            <dt>Skill potential</dt>
            <dd>
              {record.skillPotential
                .map((skill) => `${skill.label} ${Math.round(skill.value)}%`)
                .join(", ")}
            </dd>
          </div>
        </dl>
        {onSelectSubject ? (
          <div className="lineage-links" aria-label="Permanent lineage links">
            {[record.motherId, record.fatherId, ...record.childIds, record.heirId]
              .filter((id): id is number => id !== undefined)
              .filter((id, index, values) => values.indexOf(id) === index)
              .map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    onSelectSubject({
                      kind: view.creatures.some((candidate) => candidate.id === id)
                        ? "creature"
                        : "life-record",
                      id,
                    })
                  }
                >
                  Open {nameFor(id)}
                </button>
              ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function MemorialNotebook({
  memorial,
  view,
  onSelectSubject,
}: {
  memorial: MemorialView;
  view: WorldView;
  onSelectSubject?: ((ref: WorldRef) => void) | undefined;
}) {
  const record = (view.lifeRecords ?? []).find(
    (candidate) => candidate.id === memorial.deceasedId,
  );
  const heirName =
    memorial.heirId === undefined
      ? "No recorded heir"
      : (view.creatures.find((candidate) => candidate.id === memorial.heirId)?.name ??
        (view.lifeRecords ?? []).find((candidate) => candidate.id === memorial.heirId)
          ?.name ??
        `Identity ${memorial.heirId.toString()}`);
  return (
    <div className="inspector-scroll">
      <section
        className="subject-header subject-header--remembered"
        aria-labelledby="subject-heading"
      >
        <span className="eyebrow">Temporary memorial</span>
        <h2 id="subject-heading">{memorial.deceasedName}</h2>
        <dl className="life-record-facts">
          <div>
            <dt>Visible until</dt>
            <dd>Tick {memorial.expiresTick}</dd>
          </div>
          <div>
            <dt>Mourners remaining</dt>
            <dd>{memorial.mournersRemaining}</dd>
          </div>
          <div>
            <dt>Heir</dt>
            <dd>{heirName}</dd>
          </div>
          <div>
            <dt>Estate</dt>
            <dd>
              {memorial.estate.water} water, {memorial.estate.food} food,{" "}
              {memorial.estate.material} material
            </dd>
          </div>
        </dl>
        {record && onSelectSubject ? (
          <div className="lineage-links">
            <button
              type="button"
              onClick={() => onSelectSubject({ kind: "life-record", id: record.id })}
            >
              Open permanent life record for {record.name}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function LinkedEvidence({
  events,
  onInspectEvent,
}: {
  events: readonly TimelineEventView[];
  onInspectEvent?: ((event: TimelineEventView) => void) | undefined;
}) {
  return (
    <section className="inspector-section" aria-labelledby="subject-evidence-heading">
      <SectionTitle icon={BookOpen} annotation={`${events.length} linked`}>
        <span id="subject-evidence-heading">Linked observations</span>
      </SectionTitle>
      {events.length === 0 ? (
        <p className="empty-copy">No retained settlement observation links here yet.</p>
      ) : (
        <ol className="subject-evidence-list">
          {events.slice(0, 8).map((event) => (
            <li key={event.id}>
              <button type="button" onClick={() => onInspectEvent?.(event)}>
                <span>{tickLabel(event.tick)}</span>
                <strong>{event.title}</strong>
                <small>{event.detail}</small>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function GroupNotebook({
  group,
  view,
  onSelect,
  onSelectSubject,
  onInspectEvent,
}: {
  group: GroupView;
  view: WorldView;
  onSelect: (id: EntityId) => void;
  onSelectSubject?: ((ref: WorldRef) => void) | undefined;
  onInspectEvent?: ((event: TimelineEventView) => void) | undefined;
}) {
  const leader = view.creatures.find((creature) => creature.id === group.leaderId);
  const members = group.memberIds
    .map((id) => view.creatures.find((creature) => creature.id === id))
    .filter((creature): creature is CreatureView => creature !== undefined);
  const activeShelter = view.structures.find(
    (structure) => structure.id === group.activeShelterId,
  );
  const pendingShelter = view.structures.find(
    (structure) => structure.id === group.pendingShelterId,
  );
  const linkedEvents = view.events.filter(
    (event) =>
      /SHELTER|SETTLEMENT|GROUP|STORAGE|FOUNDED|RELOCAT|ABANDON/i.test(event.type) &&
      ((event.groupIds ?? []).includes(group.id) ||
        event.targetIds.some((id) =>
          view.structures.some(
            (structure) => structure.id === id && structure.groupId === group.id,
          ),
        ) ||
        event.actorIds.some((id) => group.memberIds.includes(id))),
  );
  return (
    <div className="inspector-scroll">
      <section className="subject-header" aria-labelledby="subject-heading">
        <div className="subject-header__top">
          <div className="subject-avatar subject-avatar--group" aria-hidden="true">
            <UsersRound size={19} />
          </div>
          <div>
            <span className="eyebrow">
              {group.stage === "PERSISTENT" ? "Persistent group" : "Group subject"}
            </span>
            <h2 id="subject-heading">{group.name}</h2>
          </div>
        </div>
        <div className="subject-summary" aria-label={`${group.name} settlement summary`}>
          <span className="eyebrow">Settlement state</span>
          <dl>
            <div>
              <dt>Members</dt>
              <dd>
                {group.memberIds.length}
                {leader ? `; ${leader.name} leads` : "; no current leader"}
              </dd>
            </div>
            <div>
              <dt>Cohesion</dt>
              <dd>{Math.round(group.cohesion)} percent</dd>
            </div>
            <div>
              <dt>Home</dt>
              <dd>
                {activeShelter
                  ? `Shelter ${activeShelter.id} at ${Math.round(activeShelter.condition ?? 0)} percent condition`
                  : pendingShelter
                    ? `Site ${pendingShelter.id}, ${Math.round(pendingShelter.progress)} percent built`
                    : "No communal shelter"}
              </dd>
            </div>
            <div>
              <dt>Relocation</dt>
              <dd>
                {group.activeShelterId === undefined
                  ? "No active home to relocate"
                  : `${group.shelterRelocations ?? 0} of 1 used${
                      (group.shelterCommitUntilTick ?? 0) > view.tick
                        ? `; committed through tick ${group.shelterCommitUntilTick}`
                        : "; eligible for reevaluation"
                    }`}
              </dd>
            </div>
            {group.shelterRelocationCandidate ? (
              <div>
                <dt>Alternative under review</dt>
                <dd>
                  Tile {group.shelterRelocationCandidate.tileIndex}; better by{" "}
                  {group.shelterRelocationCandidate.scoreImprovement} score units across{" "}
                  {group.shelterRelocationCandidate.consecutiveEvaluations} repeated
                  evaluations
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </section>
      <section className="inspector-section" aria-labelledby="group-homes-heading">
        <SectionTitle icon={Route} annotation="active and pending">
          <span id="group-homes-heading">Communal shelter</span>
        </SectionTitle>
        <div className="subject-link-list">
          {activeShelter ? (
            <button
              type="button"
              onClick={() => onSelectSubject?.({ kind: "structure", id: activeShelter.id })}
            >
              <strong>Active shelter {activeShelter.id}</strong>
              <span>
                {activeShelter.restingCreatures ?? 0} resting;{" "}
                {activeShelter.reservedSpaces ?? 0}/{activeShelter.effectiveCapacity ?? 0}{" "}
                spaces reserved
              </span>
            </button>
          ) : null}
          {pendingShelter ? (
            <button
              type="button"
              onClick={() =>
                onSelectSubject?.({ kind: "structure", id: pendingShelter.id })
              }
            >
              <strong>Pending site {pendingShelter.id}</strong>
              <span>{Math.round(pendingShelter.progress)} percent built</span>
            </button>
          ) : null}
          {!activeShelter && !pendingShelter ? (
            <p className="empty-copy">
              Persistent groups begin shelter planning only after completing shared storage.
            </p>
          ) : null}
        </div>
      </section>
      <section className="inspector-section" aria-labelledby="group-members-heading">
        <SectionTitle icon={UsersRound} annotation={`${members.length} living or retained`}>
          <span id="group-members-heading">Members</span>
        </SectionTitle>
        <div className="subject-link-list">
          {members.map((member) => (
            <button type="button" key={member.id} onClick={() => onSelect(member.id)}>
              <strong>{member.name}</strong>
              <span>
                {member.role} · {humanize(member.action)}
              </span>
            </button>
          ))}
        </div>
      </section>
      <LinkedEvidence events={linkedEvents} onInspectEvent={onInspectEvent} />
    </div>
  );
}

function StructureNotebook({
  structure,
  view,
  onSelectSubject,
  onInspectEvent,
}: {
  structure: StructureView;
  view: WorldView;
  onSelectSubject?: ((ref: WorldRef) => void) | undefined;
  onInspectEvent?: ((event: TimelineEventView) => void) | undefined;
}) {
  const group = view.groups.find((candidate) => candidate.id === structure.groupId);
  const isActiveShelter = structure.kind === "SHELTER";
  const isAbandonedShelter = structure.kind === "ABANDONED_SHELTER";
  const isStorage = structure.kind === "STORAGE" || structure.kind === "STORAGE_SITE";
  const isConstructionSite =
    structure.kind === "STORAGE_SITE" || structure.kind === "SHELTER_SITE";
  const tileIndex = Math.floor(structure.y) * view.width + Math.floor(structure.x);
  const state =
    structure.kind === "SHELTER_SITE"
      ? "Site under construction"
      : structure.kind === "ABANDONED_SHELTER"
        ? "Abandoned former home"
        : structure.kind === "SHELTER"
          ? structure.upkeepNeeded
            ? "Active; upkeep needed"
            : "Active communal shelter"
          : structure.progress >= 99
            ? "Complete shared storage"
            : "Storage under construction";
  const linkedEvents = view.events.filter(
    (event) =>
      event.targetIds.includes(structure.id) ||
      (event.locationTileIndex === tileIndex &&
        /SHELTER|SETTLEMENT|STORAGE|RELOCAT|ABANDON/i.test(event.type)),
  );
  return (
    <div className="inspector-scroll">
      <section className="subject-header" aria-labelledby="subject-heading">
        <div className="subject-header__top">
          <div className="subject-avatar subject-avatar--structure" aria-hidden="true">
            <PackageOpen size={19} />
          </div>
          <div>
            <span className="eyebrow">Structure notebook</span>
            <h2 id="subject-heading">{humanize(structure.kind)}</h2>
          </div>
        </div>
        <div className="subject-summary" aria-label={`${humanize(structure.kind)} state`}>
          <span className="eyebrow">Observed state</span>
          <dl>
            <div>
              <dt>Status</dt>
              <dd>{state}</dd>
            </div>
            <div>
              <dt>Position</dt>
              <dd>
                Column {structure.x}, row {structure.y}
              </dd>
            </div>
            <div>
              <dt>Group</dt>
              <dd>
                {group ? (
                  <button
                    type="button"
                    className="inline-subject-link"
                    onClick={() => onSelectSubject?.({ kind: "group", id: group.id })}
                  >
                    {group.name}
                  </button>
                ) : (
                  "No linked group"
                )}
              </dd>
            </div>
            <div>
              <dt>Progress</dt>
              <dd>{Math.round(structure.progress)} percent</dd>
            </div>
            {structure.builtFromShelterId !== undefined ? (
              <div>
                <dt>Replaced former home</dt>
                <dd>
                  <button
                    type="button"
                    className="inline-subject-link"
                    onClick={() =>
                      onSelectSubject?.({
                        kind: "structure",
                        id: structure.builtFromShelterId!,
                      })
                    }
                  >
                    Shelter {structure.builtFromShelterId}
                  </button>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
        {isActiveShelter ? (
          <div className="vitals-grid">
            <Meter label="Condition" value={structure.condition ?? 0} tone="gold" />
            <Meter
              label="Reserved"
              value={
                (100 * (structure.reservedSpaces ?? 0)) /
                Math.max(1, structure.effectiveCapacity ?? 1)
              }
              tone="water"
            />
          </div>
        ) : null}
      </section>
      {isActiveShelter ? (
        <section className="inspector-section" aria-labelledby="shelter-capacity-heading">
          <SectionTitle
            icon={UsersRound}
            annotation={structure.upkeepNeeded ? "upkeep due" : "live"}
          >
            <span id="shelter-capacity-heading">Use and upkeep</span>
          </SectionTitle>
          <dl className="settlement-facts">
            <div>
              <dt>Usable spaces</dt>
              <dd>
                {structure.effectiveCapacity ?? 0} of {structure.baseCapacity ?? 0}
              </dd>
            </div>
            <div>
              <dt>Reserved / resting</dt>
              <dd>
                {structure.reservedSpaces ?? 0} / {structure.restingCreatures ?? 0}
              </dd>
            </div>
            <div>
              <dt>Inside now</dt>
              <dd>
                {structure.memberOccupancy ?? 0} members; {structure.guestOccupancy ?? 0}{" "}
                guests
              </dd>
            </div>
            <div>
              <dt>Upkeep</dt>
              <dd>
                {structure.upkeepNeeded ? "Material maintenance needed" : "No upkeep due"}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
      {isStorage ? (
        <section className="inspector-section" aria-labelledby="storage-contents-heading">
          <SectionTitle
            icon={PackageOpen}
            annotation={
              structure.kind === "STORAGE" ? "shared inventory" : "site inventory"
            }
          >
            <span id="storage-contents-heading">Stored provisions</span>
          </SectionTitle>
          <dl className="settlement-facts">
            <div>
              <dt>Food stored</dt>
              <dd>{structure.stored} units</dd>
            </div>
            <div>
              <dt>Material stored</dt>
              <dd>{structure.storedMaterial ?? 0} units</dd>
            </div>
            <div className="settlement-facts__total">
              <dt>Shared capacity</dt>
              <dd>
                {structure.stored + (structure.storedMaterial ?? 0)} of {structure.capacity}{" "}
                units used
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
      {isConstructionSite ? (
        <section
          className="inspector-section"
          aria-labelledby="construction-inputs-heading"
        >
          <SectionTitle icon={PackageOpen} annotation="physical progress">
            <span id="construction-inputs-heading">Construction inputs</span>
          </SectionTitle>
          <dl className="settlement-facts">
            <div>
              <dt>Material deposited</dt>
              <dd>
                {structure.materialDeposited ?? 0} of {structure.materialRequired ?? 0}{" "}
                units
              </dd>
            </div>
            <div>
              <dt>Work progress</dt>
              <dd>{Math.round(structure.progress)} percent</dd>
            </div>
            <div className="settlement-facts__total">
              <dt>Work target</dt>
              <dd>{structure.workRequired ?? 0} work units</dd>
            </div>
          </dl>
        </section>
      ) : null}
      {isAbandonedShelter ? (
        <section className="inspector-section" aria-labelledby="former-home-heading">
          <SectionTitle icon={PackageOpen} annotation="retained evidence">
            <span id="former-home-heading">Former home record</span>
          </SectionTitle>
          <dl className="settlement-facts">
            <div>
              <dt>Final condition</dt>
              <dd>{Math.round(structure.condition ?? 0)} percent</dd>
            </div>
            <div>
              <dt>Original rest footprint</dt>
              <dd>{structure.baseCapacity ?? 0} spaces</dd>
            </div>
            <div className="settlement-facts__total">
              <dt>Use now</dt>
              <dd>Inspectable history only; no rest or upkeep claims</dd>
            </div>
          </dl>
        </section>
      ) : null}
      {structure.siteAssessment ? (
        <section className="inspector-section" aria-labelledby="site-rationale-heading">
          <SectionTitle
            icon={Route}
            annotation={`chosen at ${tickLabel(structure.siteAssessment.selectedAtTick)}`}
          >
            <span id="site-rationale-heading">Why this site</span>
          </SectionTitle>
          <p className="empty-copy">
            Lower total scores are preferred; each retained cost records what the leader
            compared.
          </p>
          <dl className="settlement-facts settlement-facts--site">
            <div>
              <dt>Member travel</dt>
              <dd>{structure.siteAssessment.memberTravelCost} cost</dd>
            </div>
            <div>
              <dt>Store access</dt>
              <dd>{structure.siteAssessment.storageTravelCost} cost</dd>
            </div>
            <div>
              <dt>Food access</dt>
              <dd>{structure.siteAssessment.foodAccessCost} cost</dd>
            </div>
            <div>
              <dt>Material access</dt>
              <dd>{structure.siteAssessment.materialAccessCost} cost</dd>
            </div>
            <div>
              <dt>Water access</dt>
              <dd>{structure.siteAssessment.waterAccessCost} cost</dd>
            </div>
            <div>
              <dt>Crowding</dt>
              <dd>{structure.siteAssessment.crowdingCost} cost</dd>
            </div>
            <div>
              <dt>Construction</dt>
              <dd>{structure.siteAssessment.constructionInvestmentCost} cost</dd>
            </div>
            <div>
              <dt>Relocation change</dt>
              <dd>{structure.siteAssessment.relocationChangeCost} cost</dd>
            </div>
            <div className="settlement-facts__total">
              <dt>Total score</dt>
              <dd>{structure.siteAssessment.totalScore} (lower is better)</dd>
            </div>
          </dl>
        </section>
      ) : null}
      <LinkedEvidence events={linkedEvents} onInspectEvent={onInspectEvent} />
    </div>
  );
}

export function InspectorPanel({
  creature,
  subjectRef,
  view,
  evidenceEvent,
  followed,
  onFollow,
  onSelect,
  onSelectSubject,
  onInspectEvent,
}: {
  creature: CreatureView | null;
  subjectRef?: WorldRef | null | undefined;
  view: WorldView;
  evidenceEvent: TimelineEventView | null;
  followed: boolean;
  onFollow: () => void;
  onSelect: (id: EntityId) => void;
  onSelectSubject?: ((ref: WorldRef) => void) | undefined;
  onInspectEvent?: ((event: TimelineEventView) => void) | undefined;
}) {
  if (subjectRef?.kind === "life-record") {
    const record = (view.lifeRecords ?? []).find(
      (candidate) => candidate.id === subjectRef.id,
    );
    if (record) {
      return (
        <LifeRecordNotebook record={record} view={view} onSelectSubject={onSelectSubject} />
      );
    }
  }
  if (subjectRef?.kind === "memorial") {
    const memorial = (view.memorials ?? []).find(
      (candidate) => candidate.id === subjectRef.id,
    );
    if (memorial) {
      return (
        <MemorialNotebook
          memorial={memorial}
          view={view}
          onSelectSubject={onSelectSubject}
        />
      );
    }
  }
  if (subjectRef?.kind === "creature") {
    const record = (view.lifeRecords ?? []).find(
      (candidate) => candidate.id === subjectRef.id,
    );
    const living = view.creatures.some((candidate) => candidate.id === subjectRef.id);
    if (!living && record) {
      return (
        <LifeRecordNotebook record={record} view={view} onSelectSubject={onSelectSubject} />
      );
    }
  }
  if (subjectRef?.kind === "group") {
    const group = view.groups.find((candidate) => candidate.id === subjectRef.id);
    if (group) {
      return (
        <GroupNotebook
          group={group}
          view={view}
          onSelect={onSelect}
          onSelectSubject={onSelectSubject}
          onInspectEvent={onInspectEvent}
        />
      );
    }
  }
  if (subjectRef?.kind === "structure") {
    const structure = view.structures.find((candidate) => candidate.id === subjectRef.id);
    if (structure) {
      return (
        <StructureNotebook
          structure={structure}
          view={view}
          onSelectSubject={onSelectSubject}
          onInspectEvent={onInspectEvent}
        />
      );
    }
  }
  const selectedCreature =
    subjectRef?.kind === "creature"
      ? (view.creatures.find((candidate) => candidate.id === subjectRef.id) ?? null)
      : creature;
  return (
    <CreatureNotebook
      creature={selectedCreature}
      view={view}
      evidenceEvent={evidenceEvent}
      followed={followed}
      onFollow={onFollow}
      onSelect={onSelect}
      onSelectSubject={onSelectSubject}
    />
  );
}
