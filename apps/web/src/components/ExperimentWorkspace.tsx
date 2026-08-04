import {
  Bookmark,
  Check,
  ChevronRight,
  CircleAlert,
  Download,
  FileUp,
  FlaskConical,
  GitCompareArrows,
  History,
  LoaderCircle,
  MapPin,
  Pause,
  Play,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import type { CausalEvidenceRef, EntityId } from "@tiny-civ/sim-core";
import "../styles/experiment.css";

export type OperationPhase = "idle" | "working" | "success" | "error";

export interface OperationStatus {
  phase: OperationPhase;
  message?: string;
}

export interface ScenarioOption {
  id: string;
  label: string;
  description: string;
  role?: string;
  startingFacts?: readonly string[];
  observableTensions?: readonly string[];
}

export interface SeedPreset {
  seed: number;
  label: string;
  description?: string;
}

export interface ExperimentSetupDialogProps {
  open: boolean;
  scenarios: readonly ScenarioOption[];
  scenarioId: string;
  seed: string;
  seedPresets?: readonly SeedPreset[];
  busy?: boolean;
  error?: string;
  seedMin?: number;
  seedMax?: number;
  onScenarioChange: (scenarioId: string) => void;
  onSeedChange: (seed: string) => void;
  onStart: () => void;
  onDismiss?: () => void;
}

export interface NewExperimentDialogProps {
  open: boolean;
  hasUnsavedChanges: boolean;
  busy?: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export interface ExperimentActionProps {
  canLoad: boolean;
  disabled?: boolean;
  status?: OperationStatus;
  onSave: () => void;
  onLoad: () => void;
  onImport: (file: File) => void;
  onExport: () => void;
  onRequestNew: () => void;
}

export type InterventionRecordStatus = "pending" | "applied" | "rejected";

export type InterventionNavigationTarget =
  | { readonly kind: "raw-evidence"; readonly ref: CausalEvidenceRef }
  | { readonly kind: "location"; readonly tileIndex: number }
  | { readonly kind: "responding-creature"; readonly creatureId: EntityId }
  | { readonly kind: "linked-evidence"; readonly ref: CausalEvidenceRef }
  | { readonly kind: "linked-moment"; readonly eventId: number }
  | { readonly kind: "comparison"; readonly branchId: string }
  | { readonly kind: "branch-replay"; readonly branchId: string };

export interface InterventionNavigationAction {
  readonly id: string;
  readonly label: string;
  readonly target: InterventionNavigationTarget;
}

export interface InterventionRecord {
  id: string;
  tick: number;
  label: string;
  target: string;
  status: InterventionRecordStatus;
  selectable?: boolean;
  quantity?: number;
  detail?: string;
  reason?: string;
  response?: {
    phase: "waiting" | "observing" | "closed";
    window: string;
    summary: string;
    participantLines: readonly string[];
  };
  navigationActions?: readonly InterventionNavigationAction[];
}

export interface InterventionLedgerProps {
  interventions: readonly InterventionRecord[];
  onSelect?: (interventionId: string) => void;
  onNavigate?: (interventionId: string, action: InterventionNavigationAction) => void;
}

export interface ExperimentBookmark {
  id: string;
  tick: number;
  label: string;
  note?: string;
}

export interface BookmarkPanelProps {
  bookmarks: readonly ExperimentBookmark[];
  draftLabel: string;
  currentTick: number;
  disabled?: boolean;
  onDraftLabelChange: (value: string) => void;
  onAdd: () => void;
  onVisit: (bookmarkId: string) => void;
  onRemove?: (bookmarkId: string) => void;
}

export interface PickerOption {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export type InterventionTargetKind = "none" | "creature" | "object" | "tile";

export interface InterventionToolOption {
  id: string;
  label: string;
  description: string;
  targetKind: InterventionTargetKind;
  supportsQuantity?: boolean;
}

export interface InterventionComposerProps {
  tools: readonly InterventionToolOption[];
  toolId: string;
  creatures: readonly PickerOption[];
  creatureId: string;
  objects: readonly PickerOption[];
  objectId: string;
  targetX: string;
  targetY: string;
  quantity: string;
  status?: OperationStatus;
  validationMessage?: string;
  preview?: {
    target: string;
    applyTick: number;
    category: string;
    mechanicalChange: string;
  };
  disabled?: boolean;
  onToolChange: (toolId: string) => void;
  onCreatureChange: (creatureId: string) => void;
  onObjectChange: (objectId: string) => void;
  onTargetXChange: (value: string) => void;
  onTargetYChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onSubmit: () => void;
}

export type HashVerificationStatus = "unverified" | "verifying" | "match" | "mismatch";

export interface HashVerification {
  status: HashVerificationStatus;
  expected?: string;
  actual?: string;
  message?: string;
}

export type ReplayPhase = "idle" | "running" | "complete" | "cancelled" | "error";

export interface ReplayState {
  phase: ReplayPhase;
  currentTick: number;
  targetTick: number;
  progressPercent: number;
  message?: string;
  hash: HashVerification;
}

export interface ReplayPanelProps {
  replay: ReplayState;
  disabled?: boolean;
  onReplay: () => void;
  onCancel: () => void;
}

export type ComparisonStatus = "empty" | "loading" | "ready" | "incompatible" | "error";

export interface ComparisonMetric {
  id: string;
  label: string;
  baseline: string | number;
  branch: string | number;
  delta: string | number;
  deltaTone?: "positive" | "negative" | "neutral";
  note?: string;
}

export interface ComparisonState {
  status: ComparisonStatus;
  baselineLabel: string;
  branchLabel: string;
  baselineTick: number;
  branchTick: number;
  metrics: readonly ComparisonMetric[];
  message?: string;
}

export interface CausalLink {
  id: string;
  label: string;
  kind:
    | "event"
    | "decision"
    | "memory"
    | "relationship"
    | "factor"
    | "history"
    | "creature"
    | "group"
    | "structure"
    | "resource"
    | "desire"
    | "plan"
    | "tile";
  tick?: number;
  summary?: string;
}

export interface CausalFactor {
  id: string;
  label: string;
  contribution: string | number;
  direction: "for" | "against" | "neutral";
  evidence: readonly CausalLink[];
}

export interface CausalAlternative {
  id: string;
  label: string;
  score?: string | number;
  chosen?: boolean;
  factors: readonly CausalFactor[];
}

export interface CausalDecision {
  actorLabel: string;
  chosenAction: string;
  alternatives: readonly CausalAlternative[];
}

export interface CausalEventDetail {
  id: string;
  tick: number;
  title: string;
  summary: string;
  immediateCauses: readonly CausalLink[];
  decision?: CausalDecision;
  socialEvidence: readonly CausalLink[];
  consequences: readonly CausalLink[];
}

export type CausalExplorerStatus = "empty" | "loading" | "ready" | "error";

export interface CausalExplorerProps {
  status: CausalExplorerStatus;
  breadcrumbs: readonly CausalLink[];
  detail?: CausalEventDetail;
  message?: string;
  onNavigate: (id: string) => void;
  onRetry?: () => void;
}

export type ExperimentSection = "record" | "replay" | "compare" | "explain";

export interface ExperimentDrawerProps {
  open: boolean;
  section: ExperimentSection;
  experimentName: string;
  scenarioLabel: string;
  scenarioQuestion?: string;
  startingFacts?: readonly string[];
  developedSummary?: string;
  seed: number;
  currentTick: number;
  dirty: boolean;
  actions: ExperimentActionProps;
  interventions: readonly InterventionRecord[];
  bookmarks: BookmarkPanelProps;
  composer: InterventionComposerProps;
  replay: ReplayPanelProps;
  comparison: ComparisonState;
  causal: CausalExplorerProps;
  onSectionChange: (section: ExperimentSection) => void;
  onClose: () => void;
  onSelectIntervention?: (interventionId: string) => void;
  onNavigateIntervention?: (
    interventionId: string,
    action: InterventionNavigationAction,
  ) => void;
}

export interface ExperimentWorkspaceProps extends ExperimentDrawerProps {
  setup?: ExperimentSetupDialogProps;
  newExperimentDialog?: NewExperimentDialogProps;
}

const sectionOptions: ReadonlyArray<{
  id: ExperimentSection;
  label: string;
  icon: typeof History;
}> = [
  { id: "record", label: "Record", icon: History },
  { id: "replay", label: "Replay", icon: Play },
  { id: "compare", label: "Compare", icon: GitCompareArrows },
  { id: "explain", label: "Explain", icon: FlaskConical },
];

function useNativeDialog(
  open: boolean,
  dialogRef: React.RefObject<HTMLDialogElement | null>,
  initialFocusRef: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const returnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
      }
    }
    initialFocusRef.current?.focus();

    return () => {
      if (dialog.open) {
        if (typeof dialog.close === "function") dialog.close();
        else dialog.removeAttribute("open");
      }
      returnFocus?.focus();
    };
  }, [dialogRef, initialFocusRef, open]);
}

function DialogScrim({ open }: { open: boolean }) {
  return open ? <span className="experiment-dialog-scrim" aria-hidden="true" /> : null;
}

export function ExperimentSetupDialog({
  open,
  scenarios,
  scenarioId,
  seed,
  seedPresets = [],
  busy = false,
  error,
  seedMin = 0,
  seedMax = 0xffff_ffff,
  onScenarioChange,
  onSeedChange,
  onStart,
  onDismiss,
}: ExperimentSetupDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  useNativeDialog(open, dialogRef, firstFieldRef);

  const selectedScenario = scenarios.find((scenario) => scenario.id === scenarioId);
  const numericSeed = Number(seed);
  const seedIsValid =
    seed.trim().length > 0 &&
    Number.isInteger(numericSeed) &&
    numericSeed >= seedMin &&
    numericSeed <= seedMax;
  const formIsValid = Boolean(selectedScenario) && seedIsValid;
  const errorId = error ? "experiment-setup-error" : undefined;

  if (!open) return null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (formIsValid && !busy) onStart();
  };

  return (
    <>
      <DialogScrim open={open} />
      <dialog
        ref={dialogRef}
        className="experiment-dialog experiment-setup-dialog"
        aria-labelledby="experiment-setup-title"
        aria-describedby="experiment-setup-intro"
        onCancel={(event) => {
          event.preventDefault();
          onDismiss?.();
        }}
      >
        <form onSubmit={submit}>
          <header className="experiment-dialog__header">
            <span className="experiment-dialog__mark" aria-hidden="true">
              <FlaskConical size={21} strokeWidth={1.8} />
            </span>
            <div>
              <span className="experiment-eyebrow">New field study</span>
              <h1 id="experiment-setup-title">Set up an experiment</h1>
            </div>
          </header>

          <p id="experiment-setup-intro" className="experiment-setup__intro">
            Choose a scenario and seed. The dish opens paused at tick 0, so the first
            observation only happens when you deliberately play or step.
          </p>

          <ol className="experiment-orientation" aria-label="Experiment workflow">
            <li>
              <Pause aria-hidden="true" size={17} />
              <span>
                <strong>Observe from stillness.</strong> Confirm the starting conditions
                before time advances.
              </span>
            </li>
            <li>
              <Bookmark aria-hidden="true" size={17} />
              <span>
                <strong>Mark the baseline.</strong> Bookmark a tick before introducing a
                condition.
              </span>
            </li>
            <li>
              <GitCompareArrows aria-hidden="true" size={17} />
              <span>
                <strong>Compare with evidence.</strong> Replay equal horizons, then trace
                changed outcomes to their causes.
              </span>
            </li>
          </ol>

          <div className="experiment-setup__fields">
            <div className="experiment-field">
              <label htmlFor="experiment-scenario">Scenario</label>
              <select
                id="experiment-scenario"
                ref={firstFieldRef}
                value={scenarioId}
                required
                aria-describedby="scenario-description"
                onChange={(event) => onScenarioChange(event.currentTarget.value)}
              >
                <option value="" disabled>
                  Select a scenario
                </option>
                {scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.label}
                  </option>
                ))}
              </select>
              <small id="scenario-description">
                {selectedScenario?.description ??
                  "Choose a versioned starting structure for this field study."}
              </small>
            </div>

            <div className="experiment-field">
              <label htmlFor="experiment-seed">Seed</label>
              <input
                id="experiment-seed"
                type="number"
                inputMode="numeric"
                step={1}
                min={seedMin}
                max={seedMax}
                required
                value={seed}
                aria-invalid={seed.trim().length > 0 && !seedIsValid}
                aria-describedby={
                  errorId ? `seed-description ${errorId}` : "seed-description"
                }
                onChange={(event) => onSeedChange(event.currentTarget.value)}
              />
              <small id="seed-description">
                The seed varies deterministic choices inside this scenario; it does not
                choose the scenario.
              </small>
            </div>
          </div>

          {selectedScenario ? (
            <section className="scenario-brief" aria-labelledby="scenario-brief-title">
              <div>
                <span className="experiment-eyebrow">
                  {selectedScenario.role ?? "Starting conditions"}
                </span>
                <h2 id="scenario-brief-title">What is true at tick 0</h2>
              </div>
              <ul>
                {(selectedScenario.startingFacts ?? []).map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
              {selectedScenario.observableTensions?.length ? (
                <p>
                  <strong>Watch for:</strong>{" "}
                  {selectedScenario.observableTensions.join(" ")}
                </p>
              ) : null}
            </section>
          ) : null}

          {seedPresets.length > 0 ? (
            <fieldset className="seed-presets">
              <legend>Seed shortcuts</legend>
              <div>
                {seedPresets.map((preset) => (
                  <button
                    type="button"
                    key={preset.seed}
                    className={String(preset.seed) === seed ? "is-selected" : ""}
                    aria-pressed={String(preset.seed) === seed}
                    title={preset.description}
                    onClick={() => onSeedChange(String(preset.seed))}
                  >
                    <strong>{preset.label}</strong>
                    <span>{preset.seed}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          {error ? (
            <StatusNotice
              id="experiment-setup-error"
              status={{ phase: "error", message: error }}
            />
          ) : null}

          <footer className="experiment-dialog__actions">
            {onDismiss ? (
              <button type="button" className="experiment-button" onClick={onDismiss}>
                Not now
              </button>
            ) : null}
            <button
              type="submit"
              className="experiment-button experiment-button--primary"
              disabled={!formIsValid || busy}
            >
              {busy ? (
                <LoaderCircle className="is-spinning" aria-hidden="true" size={17} />
              ) : (
                <Pause aria-hidden="true" size={17} />
              )}
              {busy ? "Preparing study" : "Open paused at tick 0"}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}

export function NewExperimentDialog({
  open,
  hasUnsavedChanges,
  busy = false,
  title = "Start a new experiment?",
  description,
  confirmLabel = "Start new experiment",
  onCancel,
  onConfirm,
}: NewExperimentDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useNativeDialog(open, dialogRef, cancelRef);

  if (!open) return null;

  return (
    <>
      <DialogScrim open={open} />
      <dialog
        ref={dialogRef}
        className="experiment-dialog experiment-confirm-dialog"
        aria-labelledby="new-experiment-title"
        aria-describedby="new-experiment-description"
        onCancel={(event) => {
          event.preventDefault();
          onCancel();
        }}
      >
        <div className="experiment-dialog__header">
          <span className="experiment-dialog__mark experiment-dialog__mark--warning">
            <RotateCcw aria-hidden="true" size={20} />
          </span>
          <div>
            <span className="experiment-eyebrow">Change field study</span>
            <h2 id="new-experiment-title">{title}</h2>
          </div>
        </div>
        <p id="new-experiment-description">
          {description ??
            (hasUnsavedChanges
              ? "This study has changes that are not saved. Export or save it before starting again if you want to keep the record."
              : "The current dish will close and setup will return to tick 0.")}
        </p>
        <div className="experiment-dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            className="experiment-button"
            disabled={busy}
            onClick={onCancel}
          >
            Keep current study
          </button>
          <button
            type="button"
            className="experiment-button experiment-button--danger"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? (
              <LoaderCircle className="is-spinning" aria-hidden="true" size={17} />
            ) : (
              <RotateCcw aria-hidden="true" size={17} />
            )}
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}

export function StatusNotice({ status, id }: { status: OperationStatus; id?: string }) {
  if (status.phase === "idle" && !status.message) return null;

  const icon =
    status.phase === "working" ? (
      <LoaderCircle className="is-spinning" aria-hidden="true" size={17} />
    ) : status.phase === "success" ? (
      <Check aria-hidden="true" size={17} />
    ) : status.phase === "error" ? (
      <CircleAlert aria-hidden="true" size={17} />
    ) : null;
  const fallback =
    status.phase === "working"
      ? "Working..."
      : status.phase === "success"
        ? "Complete."
        : status.phase === "error"
          ? "The action could not be completed."
          : "";

  return (
    <div
      id={id}
      className={`experiment-notice experiment-notice--${status.phase}`}
      role={status.phase === "error" ? "alert" : "status"}
      aria-live={status.phase === "error" ? "assertive" : "polite"}
    >
      {icon}
      <span>{status.message ?? fallback}</span>
    </div>
  );
}

function ExperimentActions({
  canLoad,
  disabled = false,
  status,
  onSave,
  onLoad,
  onImport,
  onExport,
  onRequestNew,
}: ExperimentActionProps) {
  const busy = disabled || status?.phase === "working";
  const importId = "experiment-file-import";

  const importFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file) onImport(file);
    event.currentTarget.value = "";
  };

  return (
    <section className="experiment-sheet" aria-labelledby="study-file-heading">
      <div className="experiment-section-heading">
        <div>
          <span className="experiment-eyebrow">Study file</span>
          <h3 id="study-file-heading">Preserve this run</h3>
        </div>
        <Save aria-hidden="true" size={18} />
      </div>
      <div className="experiment-action-grid">
        <button type="button" disabled={busy} onClick={onSave}>
          <Save aria-hidden="true" size={16} />
          Save
        </button>
        <button type="button" disabled={busy || !canLoad} onClick={onLoad}>
          <History aria-hidden="true" size={16} />
          Load saved
        </button>
        <label htmlFor={importId} aria-disabled={busy}>
          <FileUp aria-hidden="true" size={16} />
          Import
        </label>
        <input
          id={importId}
          className="experiment-visually-hidden"
          type="file"
          accept="application/json,.json"
          aria-label="Import experiment file"
          disabled={busy}
          onChange={importFile}
        />
        <button type="button" disabled={busy} onClick={onExport}>
          <Download aria-hidden="true" size={16} />
          Export
        </button>
        <button
          type="button"
          className="experiment-action-grid__new"
          disabled={busy}
          onClick={onRequestNew}
        >
          <RotateCcw aria-hidden="true" size={16} />
          New experiment
        </button>
      </div>
      {status ? <StatusNotice status={status} /> : null}
    </section>
  );
}

function formatTick(tick: number) {
  return `tick ${tick.toLocaleString()}`;
}

const interventionNavigationLabels: Record<InterventionNavigationTarget["kind"], string> = {
  "raw-evidence": "Raw evidence",
  location: "Affected location",
  "responding-creature": "Responding creature",
  "linked-evidence": "Later evidence",
  "linked-moment": "Later moment",
  comparison: "Comparison",
  "branch-replay": "Branch replay",
};

export function InterventionLedger({
  interventions,
  onSelect,
  onNavigate,
}: InterventionLedgerProps) {
  return (
    <section className="experiment-sheet" aria-labelledby="intervention-ledger-heading">
      <div className="experiment-section-heading">
        <div>
          <span className="experiment-eyebrow">Immutable record</span>
          <h3 id="intervention-ledger-heading">Intervention ledger</h3>
        </div>
        <span className="experiment-count">{interventions.length}</span>
      </div>
      {interventions.length === 0 ? (
        <EmptyState
          icon={<History aria-hidden="true" size={19} />}
          title="No interventions recorded"
          description="Applied and rejected conditions will remain here with their authoritative tick and target."
        />
      ) : (
        <ol className="intervention-ledger">
          {interventions.map((record, index) => {
            const recordContext = `${record.label} at ${formatTick(record.tick)}`;
            const content = (
              <>
                <span
                  className={`intervention-ledger__status intervention-ledger__status--${record.status}`}
                >
                  {record.status}
                </span>
                <span className="intervention-ledger__body">
                  <strong>{record.label}</strong>
                  <span>
                    {record.target}
                    {record.quantity === undefined ? "" : ` / quantity ${record.quantity}`}
                  </span>
                  {record.detail ? <small>{record.detail}</small> : null}
                  {record.reason ? <small>Reason: {record.reason}</small> : null}
                  {record.response ? (
                    <span className="intervention-ledger__response">
                      <small>
                        <strong>Response window · {record.response.phase}</strong>{" "}
                        {record.response.window}
                      </small>
                      <small>{record.response.summary}</small>
                      {record.response.participantLines.length > 0 ? (
                        <span className="intervention-ledger__responders">
                          {record.response.participantLines.map((line) => (
                            <span key={line}>{line}</span>
                          ))}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </span>
                <time>{formatTick(record.tick)}</time>
              </>
            );
            return (
              <li key={record.id}>
                {onSelect && record.status !== "pending" && record.selectable !== false ? (
                  <button
                    type="button"
                    className="intervention-ledger__record"
                    onClick={() => onSelect(record.id)}
                  >
                    <span className="experiment-visually-hidden">
                      Open intervention record {index + 1}.{" "}
                    </span>
                    {content}
                  </button>
                ) : (
                  <div className="intervention-ledger__record">{content}</div>
                )}
                {onNavigate && record.navigationActions?.length ? (
                  <div
                    className="intervention-ledger__navigation"
                    role="group"
                    aria-label={`Linked views for ${recordContext}`}
                  >
                    <span className="intervention-ledger__navigation-label">
                      Linked views
                    </span>
                    {record.navigationActions.map((action) => {
                      const kindLabel = interventionNavigationLabels[action.target.kind];
                      return (
                        <button
                          key={action.id}
                          type="button"
                          aria-label={`${action.label} (${kindLabel.toLowerCase()}) for ${recordContext}`}
                          onClick={() => onNavigate(record.id, action)}
                        >
                          <span>{kindLabel}</span>
                          <strong>{action.label}</strong>
                          <ChevronRight aria-hidden="true" size={14} />
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function BookmarkPanel({
  bookmarks,
  draftLabel,
  currentTick,
  disabled = false,
  onDraftLabelChange,
  onAdd,
  onVisit,
  onRemove,
}: BookmarkPanelProps) {
  const addBookmark = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draftLabel.trim()) onAdd();
  };

  return (
    <section className="experiment-sheet" aria-labelledby="bookmark-heading">
      <div className="experiment-section-heading">
        <div>
          <span className="experiment-eyebrow">Reference points</span>
          <h3 id="bookmark-heading">Bookmarks</h3>
        </div>
        <Bookmark aria-hidden="true" size={18} />
      </div>
      <form className="bookmark-form" onSubmit={addBookmark}>
        <label htmlFor="bookmark-label">Label current {formatTick(currentTick)}</label>
        <div>
          <input
            id="bookmark-label"
            type="text"
            maxLength={80}
            value={draftLabel}
            disabled={disabled}
            placeholder="Before food condition"
            onChange={(event) => onDraftLabelChange(event.currentTarget.value)}
          />
          <button type="submit" disabled={disabled || !draftLabel.trim()}>
            <Bookmark aria-hidden="true" size={16} />
            Add
          </button>
        </div>
      </form>
      {bookmarks.length === 0 ? (
        <p className="experiment-inline-empty">
          No bookmarks yet. Mark the baseline before changing the dish.
        </p>
      ) : (
        <ul className="bookmark-list">
          {bookmarks.map((bookmark) => (
            <li key={bookmark.id}>
              <button
                type="button"
                className="bookmark-list__visit"
                aria-label={`Visit bookmark ${bookmark.label}`}
                disabled={disabled}
                onClick={() => onVisit(bookmark.id)}
              >
                <span>
                  <strong>{bookmark.label}</strong>
                  <small>{bookmark.note ?? formatTick(bookmark.tick)}</small>
                </span>
                <ChevronRight aria-hidden="true" size={16} />
              </button>
              {onRemove ? (
                <button
                  type="button"
                  className="bookmark-list__remove"
                  aria-label={`Remove bookmark ${bookmark.label}`}
                  disabled={disabled}
                  onClick={() => onRemove(bookmark.id)}
                >
                  <Trash2 aria-hidden="true" size={15} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PickerField({
  id,
  label,
  value,
  options,
  emptyLabel,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly PickerOption[];
  emptyLabel: string;
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => option.id === value);
  return (
    <div className="experiment-field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        required
        disabled={options.length === 0}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="" disabled>
          {options.length === 0 ? emptyLabel : `Choose ${label.toLowerCase()}`}
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id} disabled={option.disabled}>
            {option.label}
            {option.description ? ` - ${option.description}` : ""}
          </option>
        ))}
      </select>
      <small>
        {selected?.description ??
          (options.length === 0 ? emptyLabel : `Use arrow keys to review ${label}.`)}
      </small>
    </div>
  );
}

export function InterventionComposer({
  tools,
  toolId,
  creatures,
  creatureId,
  objects,
  objectId,
  targetX,
  targetY,
  quantity,
  status,
  validationMessage,
  preview,
  disabled = false,
  onToolChange,
  onCreatureChange,
  onObjectChange,
  onTargetXChange,
  onTargetYChange,
  onQuantityChange,
  onSubmit,
}: InterventionComposerProps) {
  const tool = tools.find((candidate) => candidate.id === toolId);
  const busy = status?.phase === "working";
  const targetIsReady =
    tool?.targetKind === "none" ||
    (tool?.targetKind === "creature" && Boolean(creatureId)) ||
    (tool?.targetKind === "object" && Boolean(objectId)) ||
    (tool?.targetKind === "tile" && targetX.trim() !== "" && targetY.trim() !== "");
  const quantityIsReady = !tool?.supportsQuantity || Number(quantity) > 0;
  const canSubmit = Boolean(tool) && targetIsReady && quantityIsReady && !validationMessage;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSubmit && !busy && !disabled) onSubmit();
  };

  return (
    <section className="experiment-sheet" aria-labelledby="condition-heading">
      <div className="experiment-section-heading">
        <div>
          <span className="experiment-eyebrow">Condition</span>
          <h3 id="condition-heading">Introduce an intervention</h3>
        </div>
        <MapPin aria-hidden="true" size={18} />
      </div>
      <form className="intervention-composer" onSubmit={submit}>
        <div className="experiment-field">
          <label htmlFor="intervention-tool">Intervention</label>
          <select
            id="intervention-tool"
            value={toolId}
            required
            disabled={disabled || busy}
            onChange={(event) => onToolChange(event.currentTarget.value)}
          >
            <option value="" disabled>
              Choose an intervention
            </option>
            {tools.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <small>{tool?.description ?? "Choose one condition to introduce."}</small>
        </div>

        {tool?.targetKind === "creature" ? (
          <PickerField
            id="intervention-creature"
            label="Creature"
            value={creatureId}
            options={creatures}
            emptyLabel="No living creatures are available."
            onChange={onCreatureChange}
          />
        ) : null}

        {tool?.targetKind === "object" ? (
          <PickerField
            id="intervention-object"
            label="World object"
            value={objectId}
            options={objects}
            emptyLabel="No compatible objects are available."
            onChange={onObjectChange}
          />
        ) : null}

        {tool?.targetKind === "tile" ? (
          <fieldset className="coordinate-fields">
            <legend>Target tile</legend>
            <label>
              <span>X coordinate</span>
              <input
                type="number"
                inputMode="numeric"
                step={1}
                required
                value={targetX}
                disabled={disabled || busy}
                onChange={(event) => onTargetXChange(event.currentTarget.value)}
              />
            </label>
            <label>
              <span>Y coordinate</span>
              <input
                type="number"
                inputMode="numeric"
                step={1}
                required
                value={targetY}
                disabled={disabled || busy}
                onChange={(event) => onTargetYChange(event.currentTarget.value)}
              />
            </label>
          </fieldset>
        ) : null}

        {tool?.supportsQuantity ? (
          <div className="experiment-field">
            <label htmlFor="intervention-quantity">Quantity</label>
            <input
              id="intervention-quantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              step={1}
              required
              value={quantity}
              disabled={disabled || busy}
              onChange={(event) => onQuantityChange(event.currentTarget.value)}
            />
            <small>Enter a whole number greater than zero.</small>
          </div>
        ) : null}

        {preview ? (
          <aside
            className="intervention-preview"
            aria-labelledby="intervention-preview-title"
          >
            <span className="experiment-eyebrow">Before you apply</span>
            <strong id="intervention-preview-title">Intervention preview</strong>
            <dl>
              <div>
                <dt>Target</dt>
                <dd>{preview.target}</dd>
              </div>
              <div>
                <dt>Apply tick</dt>
                <dd>{preview.applyTick.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>{preview.category}</dd>
              </div>
            </dl>
            <p>{preview.mechanicalChange}</p>
            <small>
              Creatures remain autonomous; this preview does not forecast an outcome.
            </small>
          </aside>
        ) : null}

        {validationMessage ? (
          <div className="experiment-field-error" role="alert">
            <CircleAlert aria-hidden="true" size={16} />
            {validationMessage}
          </div>
        ) : null}

        <button
          type="submit"
          className="experiment-button experiment-button--primary experiment-button--wide"
          disabled={!canSubmit || busy || disabled}
        >
          {busy ? (
            <LoaderCircle className="is-spinning" aria-hidden="true" size={17} />
          ) : (
            <MapPin aria-hidden="true" size={17} />
          )}
          {busy ? "Recording condition" : `Apply ${tool?.label ?? "condition"}`}
        </button>
        {status ? <StatusNotice status={status} /> : null}
      </form>
    </section>
  );
}

function HashStatus({ hash }: { hash: HashVerification }) {
  const labels: Record<HashVerificationStatus, string> = {
    unverified: "Hash not verified",
    verifying: "Verifying final hash",
    match: "Hash matches expected replay",
    mismatch: "Hash mismatch",
  };

  return (
    <div
      className={`hash-status hash-status--${hash.status}`}
      role={hash.status === "mismatch" ? "alert" : "status"}
    >
      {hash.status === "verifying" ? (
        <LoaderCircle className="is-spinning" aria-hidden="true" size={17} />
      ) : hash.status === "match" ? (
        <Check aria-hidden="true" size={17} />
      ) : hash.status === "mismatch" ? (
        <CircleAlert aria-hidden="true" size={17} />
      ) : (
        <History aria-hidden="true" size={17} />
      )}
      <span>
        <strong>{labels[hash.status]}</strong>
        {hash.message ? <small>{hash.message}</small> : null}
        {hash.expected ? (
          <small>
            expected <code>{hash.expected}</code>
          </small>
        ) : null}
        {hash.actual ? (
          <small>
            actual <code>{hash.actual}</code>
          </small>
        ) : null}
      </span>
    </div>
  );
}

export function ReplayPanel({
  replay,
  disabled = false,
  onReplay,
  onCancel,
}: ReplayPanelProps) {
  const progress = Math.max(0, Math.min(100, replay.progressPercent));
  const running = replay.phase === "running";

  return (
    <section className="experiment-sheet replay-sheet" aria-labelledby="replay-heading">
      <div className="experiment-section-heading">
        <div>
          <span className="experiment-eyebrow">Deterministic playback</span>
          <h3 id="replay-heading">Replay experiment</h3>
        </div>
        <Play aria-hidden="true" size={18} />
      </div>

      <div className="replay-readout">
        <span>
          {formatTick(replay.currentTick)} of {formatTick(replay.targetTick)}
        </span>
        <strong>{Math.round(progress)}%</strong>
      </div>
      <progress value={progress} max={100} aria-label="Replay progress">
        {Math.round(progress)}%
      </progress>

      {replay.phase === "error" ? (
        <StatusNotice
          status={{
            phase: "error",
            message:
              replay.message ??
              "Replay stopped. The current experiment remains unchanged and can be retried.",
          }}
        />
      ) : replay.phase === "cancelled" ? (
        <StatusNotice
          status={{
            phase: "idle",
            message: replay.message ?? "Replay cancelled. No run was replaced.",
          }}
        />
      ) : replay.phase === "complete" ? (
        <StatusNotice
          status={{
            phase: "success",
            message: replay.message ?? "Replay reached its target tick.",
          }}
        />
      ) : replay.message ? (
        <StatusNotice
          status={{ phase: running ? "working" : "idle", message: replay.message }}
        />
      ) : null}

      <HashStatus hash={replay.hash} />

      <div className="replay-actions">
        {running ? (
          <button type="button" className="experiment-button" onClick={onCancel}>
            <X aria-hidden="true" size={17} />
            Cancel replay
          </button>
        ) : (
          <button
            type="button"
            className="experiment-button experiment-button--primary"
            disabled={disabled}
            onClick={onReplay}
          >
            <Play aria-hidden="true" size={17} />
            {replay.phase === "error" ? "Retry replay" : "Replay to target"}
          </button>
        )}
      </div>
    </section>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="experiment-empty-state">
      {icon}
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ComparisonTable({ comparison }: { comparison: ComparisonState }) {
  if (comparison.status === "loading") {
    return (
      <section className="experiment-sheet" aria-labelledby="comparison-heading">
        <ComparisonHeading />
        <StatusNotice
          status={{
            phase: "working",
            message: comparison.message ?? "Calculating equal-horizon outcomes...",
          }}
        />
      </section>
    );
  }

  if (comparison.status === "error" || comparison.status === "incompatible") {
    return (
      <section className="experiment-sheet" aria-labelledby="comparison-heading">
        <ComparisonHeading />
        <StatusNotice
          status={{
            phase: "error",
            message:
              comparison.message ??
              (comparison.status === "incompatible"
                ? "These runs use incompatible scenarios or behavior versions."
                : "Comparison could not be calculated. Both runs remain available."),
          }}
        />
        <p className="comparison-horizon">
          Baseline {formatTick(comparison.baselineTick)} / Branch{" "}
          {formatTick(comparison.branchTick)}
        </p>
      </section>
    );
  }

  if (comparison.status === "empty" || comparison.metrics.length === 0) {
    return (
      <section className="experiment-sheet" aria-labelledby="comparison-heading">
        <ComparisonHeading />
        <EmptyState
          icon={<GitCompareArrows aria-hidden="true" size={20} />}
          title="No branch to compare"
          description={
            comparison.message ??
            "Bookmark a baseline, introduce one condition, then replay both runs to the same tick."
          }
        />
      </section>
    );
  }

  return (
    <section className="experiment-sheet" aria-labelledby="comparison-heading">
      <ComparisonHeading />
      <p className="comparison-horizon">
        Equal horizon: {formatTick(comparison.baselineTick)}
        {comparison.baselineTick !== comparison.branchTick
          ? ` / branch ${formatTick(comparison.branchTick)}`
          : ""}
      </p>
      <div className="comparison-table-wrap">
        <table className="comparison-table">
          <caption>
            Outcome metrics for {comparison.baselineLabel} and {comparison.branchLabel}
          </caption>
          <thead>
            <tr>
              <th scope="col">Outcome</th>
              <th scope="col">{comparison.baselineLabel}</th>
              <th scope="col">{comparison.branchLabel}</th>
              <th scope="col">Delta</th>
            </tr>
          </thead>
          <tbody>
            {comparison.metrics.map((metric) => (
              <tr key={metric.id}>
                <th scope="row">
                  {metric.label}
                  {metric.note ? <small>{metric.note}</small> : null}
                </th>
                <td data-label={comparison.baselineLabel}>{metric.baseline}</td>
                <td data-label={comparison.branchLabel}>{metric.branch}</td>
                <td
                  data-label="Delta"
                  className={`comparison-delta comparison-delta--${metric.deltaTone ?? "neutral"}`}
                >
                  <span aria-hidden="true">
                    {metric.deltaTone === "positive"
                      ? "+"
                      : metric.deltaTone === "negative"
                        ? "-"
                        : "="}
                  </span>
                  {metric.delta}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ComparisonHeading() {
  return (
    <div className="experiment-section-heading">
      <div>
        <span className="experiment-eyebrow">Baseline vs branch</span>
        <h3 id="comparison-heading">Outcome comparison</h3>
      </div>
      <GitCompareArrows aria-hidden="true" size={18} />
    </div>
  );
}

function CausalLinkList({
  links,
  empty,
  onNavigate,
}: {
  links: readonly CausalLink[];
  empty: string;
  onNavigate: (id: string) => void;
}) {
  if (links.length === 0) return <p className="experiment-inline-empty">{empty}</p>;

  return (
    <ul className="causal-link-list">
      {links.map((link) => (
        <li key={link.id}>
          <button type="button" onClick={() => onNavigate(link.id)}>
            <span className="causal-link-list__kind">{link.kind}</span>
            <span>
              <strong>{link.label}</strong>
              {link.summary ? <small>{link.summary}</small> : null}
            </span>
            {link.tick === undefined ? null : <time>{formatTick(link.tick)}</time>}
            <ChevronRight aria-hidden="true" size={16} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function DecisionEvidence({
  decision,
  onNavigate,
}: {
  decision: CausalDecision;
  onNavigate: (id: string) => void;
}) {
  return (
    <section className="causal-section" aria-labelledby="retained-decision-heading">
      <div className="causal-section__heading">
        <span>03</span>
        <h4 id="retained-decision-heading">Retained decision and alternatives</h4>
      </div>
      <dl className="decision-summary">
        <div>
          <dt>Actor</dt>
          <dd>{decision.actorLabel}</dd>
        </div>
        <div>
          <dt>Chosen action</dt>
          <dd>{decision.chosenAction}</dd>
        </div>
      </dl>
      <div className="decision-alternatives">
        {decision.alternatives.map((alternative) => (
          <details key={alternative.id} open={alternative.chosen || undefined}>
            <summary>
              <span>{alternative.chosen ? "Chosen" : "Alternative"}</span>
              <strong>{alternative.label}</strong>
              {alternative.score === undefined ? null : <code>{alternative.score}</code>}
            </summary>
            {alternative.factors.length === 0 ? (
              <p className="experiment-inline-empty">No retained factor evidence.</p>
            ) : (
              <ul className="factor-evidence-list">
                {alternative.factors.map((factor) => (
                  <li key={factor.id}>
                    <div>
                      <span
                        className={`factor-evidence-list__direction factor-evidence-list__direction--${factor.direction}`}
                      >
                        {factor.direction}
                      </span>
                      <strong>{factor.label}</strong>
                      <code>{factor.contribution}</code>
                    </div>
                    {factor.evidence.length === 0 ? (
                      <small>No linked source evidence.</small>
                    ) : (
                      <div
                        className="factor-source-list"
                        aria-label={`${factor.label} sources`}
                      >
                        {factor.evidence.map((source) => (
                          <button
                            type="button"
                            key={source.id}
                            onClick={() => onNavigate(source.id)}
                          >
                            {source.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </details>
        ))}
      </div>
    </section>
  );
}

export function CausalExplorer({
  status,
  breadcrumbs,
  detail,
  message,
  onNavigate,
  onRetry,
}: CausalExplorerProps) {
  return (
    <section className="experiment-sheet causal-sheet" aria-labelledby="causal-heading">
      <div className="experiment-section-heading">
        <div>
          <span className="experiment-eyebrow">Evidence trail</span>
          <h3 id="causal-heading">Causal explorer</h3>
        </div>
        <FlaskConical aria-hidden="true" size={18} />
      </div>

      {status === "loading" ? (
        <StatusNotice
          status={{ phase: "working", message: message ?? "Loading retained evidence..." }}
        />
      ) : status === "error" ? (
        <EmptyState
          icon={<CircleAlert aria-hidden="true" size={20} />}
          title="Evidence could not be loaded"
          description={
            message ??
            "The run remains intact. Retry the evidence query or choose another event."
          }
          action={
            onRetry ? (
              <button type="button" className="experiment-button" onClick={onRetry}>
                <RotateCcw aria-hidden="true" size={16} />
                Retry evidence
              </button>
            ) : null
          }
        />
      ) : status === "empty" || !detail ? (
        <EmptyState
          icon={<FlaskConical aria-hidden="true" size={20} />}
          title="Choose an observed event"
          description={
            message ??
            "Select a chronicle entry or changed comparison metric to trace causes and consequences."
          }
        />
      ) : (
        <>
          <nav className="causal-breadcrumbs" aria-label="Causal evidence path">
            <ol>
              {breadcrumbs.map((crumb, index) => {
                const current = index === breadcrumbs.length - 1;
                return (
                  <li key={crumb.id}>
                    {index > 0 ? <ChevronRight aria-hidden="true" size={13} /> : null}
                    <button
                      type="button"
                      aria-current={current ? "page" : undefined}
                      disabled={current}
                      onClick={() => onNavigate(crumb.id)}
                    >
                      {crumb.label}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <article className="causal-event">
            <header>
              <span className="causal-event__tick">{formatTick(detail.tick)}</span>
              <h4>{detail.title}</h4>
              <p>{detail.summary}</p>
            </header>

            <section className="causal-section" aria-labelledby="immediate-causes-heading">
              <div className="causal-section__heading">
                <span>02</span>
                <h4 id="immediate-causes-heading">Immediate causes</h4>
              </div>
              <CausalLinkList
                links={detail.immediateCauses}
                empty="No earlier event was retained as an immediate cause."
                onNavigate={onNavigate}
              />
            </section>

            {detail.decision ? (
              <DecisionEvidence decision={detail.decision} onNavigate={onNavigate} />
            ) : (
              <section
                className="causal-section"
                aria-labelledby="retained-decision-heading"
              >
                <div className="causal-section__heading">
                  <span>03</span>
                  <h4 id="retained-decision-heading">Retained decision</h4>
                </div>
                <p className="experiment-inline-empty">
                  This event has no retained creature decision.
                </p>
              </section>
            )}

            <section className="causal-section" aria-labelledby="social-evidence-heading">
              <div className="causal-section__heading">
                <span>04</span>
                <h4 id="social-evidence-heading">Memories and relationships</h4>
              </div>
              <CausalLinkList
                links={detail.socialEvidence}
                empty="No memory or relationship evidence was attached."
                onNavigate={onNavigate}
              />
            </section>

            <section className="causal-section" aria-labelledby="consequences-heading">
              <div className="causal-section__heading">
                <span>05</span>
                <h4 id="consequences-heading">Later consequences</h4>
              </div>
              <CausalLinkList
                links={detail.consequences}
                empty="No later consequence has been linked yet."
                onNavigate={onNavigate}
              />
            </section>
          </article>
        </>
      )}
    </section>
  );
}

export function ExperimentDrawer({
  open,
  section,
  experimentName,
  scenarioLabel,
  scenarioQuestion,
  startingFacts = [],
  developedSummary,
  seed,
  currentTick,
  dirty,
  actions,
  interventions,
  bookmarks,
  composer,
  replay,
  comparison,
  causal,
  onSectionChange,
  onClose,
  onSelectIntervention,
  onNavigateIntervention,
}: ExperimentDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const returnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    drawerRef.current?.focus();
    return () => returnFocus?.focus();
  }, [open]);

  const sectionContent = useMemo(() => {
    switch (section) {
      case "record":
        return (
          <>
            <section
              className="experiment-scenario-context"
              aria-labelledby="experiment-scenario-context-heading"
            >
              <span className="experiment-eyebrow">Starting structure</span>
              <h3 id="experiment-scenario-context-heading">
                {scenarioQuestion ?? scenarioLabel}
              </h3>
              {startingFacts.length > 0 ? (
                <ul>
                  {startingFacts.map((fact) => (
                    <li key={fact}>{fact}</li>
                  ))}
                </ul>
              ) : null}
              {developedSummary ? (
                <p>
                  <strong>Current factual readout:</strong> {developedSummary}
                </p>
              ) : null}
            </section>
            <ExperimentActions {...actions} />
            <InterventionComposer {...composer} />
            <InterventionLedger
              interventions={interventions}
              {...(onSelectIntervention ? { onSelect: onSelectIntervention } : {})}
              {...(onNavigateIntervention ? { onNavigate: onNavigateIntervention } : {})}
            />
            <BookmarkPanel {...bookmarks} />
          </>
        );
      case "replay":
        return <ReplayPanel {...replay} />;
      case "compare":
        return <ComparisonTable comparison={comparison} />;
      case "explain":
        return <CausalExplorer {...causal} />;
    }
  }, [
    actions,
    bookmarks,
    causal,
    comparison,
    composer,
    interventions,
    onNavigateIntervention,
    onSelectIntervention,
    replay,
    scenarioLabel,
    scenarioQuestion,
    section,
    startingFacts,
    developedSummary,
  ]);

  if (!open) return null;

  return (
    <aside
      ref={drawerRef}
      className="experiment-drawer"
      aria-labelledby="experiment-drawer-heading"
      tabIndex={-1}
    >
      <header className="experiment-drawer__header">
        <div>
          <span className="experiment-eyebrow">Experiment notebook</span>
          <h2 id="experiment-drawer-heading">{experimentName}</h2>
          <p>
            {scenarioLabel} / seed {seed} / {formatTick(currentTick)}
          </p>
        </div>
        <span className={`experiment-save-state ${dirty ? "is-dirty" : ""}`}>
          {dirty ? "Unsaved" : "Current"}
        </span>
        <button
          type="button"
          className="experiment-drawer__close"
          aria-label="Close experiment notebook"
          onClick={onClose}
        >
          <X aria-hidden="true" size={19} />
        </button>
      </header>

      <nav className="experiment-section-nav" aria-label="Experiment notebook sections">
        {sectionOptions.map((option) => {
          const Icon = option.icon;
          const active = section === option.id;
          return (
            <button
              type="button"
              key={option.id}
              aria-pressed={active}
              className={active ? "is-active" : ""}
              onClick={() => onSectionChange(option.id)}
            >
              <Icon aria-hidden="true" size={16} />
              {option.label}
            </button>
          );
        })}
      </nav>

      <div className="experiment-drawer__scroll" tabIndex={0}>
        {sectionContent}
      </div>
    </aside>
  );
}

export function ExperimentWorkspace({
  setup,
  newExperimentDialog,
  ...drawerProps
}: ExperimentWorkspaceProps) {
  return (
    <>
      {setup ? <ExperimentSetupDialog {...setup} /> : null}
      <ExperimentDrawer {...drawerProps} />
      {newExperimentDialog ? <NewExperimentDialog {...newExperimentDialog} /> : null}
    </>
  );
}
