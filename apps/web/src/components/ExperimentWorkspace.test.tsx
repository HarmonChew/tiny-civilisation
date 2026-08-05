import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CausalExplorer,
  ComparisonTable,
  ExperimentDrawer,
  ExperimentSetupDialog,
  InterventionComposer,
  InterventionLedger,
  NewExperimentDialog,
  ReplayPanel,
} from "./ExperimentWorkspace";
import type {
  CausalEventDetail,
  ComparisonState,
  ExperimentDrawerProps,
  InterventionComposerProps,
  InterventionNavigationAction,
  ReplayState,
} from "./ExperimentWorkspace";

const composerProps = (): InterventionComposerProps => ({
  tools: [
    {
      id: "feed",
      label: "Add food",
      description: "Place a measured food condition near one creature.",
      targetKind: "creature",
      supportsQuantity: true,
    },
    {
      id: "mark-tile",
      label: "Mark tile",
      description: "Resolve a condition at one tile.",
      targetKind: "tile",
    },
  ],
  toolId: "feed",
  creatures: [
    { id: "1", label: "Iri", description: "Forager / Mossbank" },
    { id: "2", label: "Nalo", description: "Drifter / no group" },
  ],
  creatureId: "1",
  objects: [{ id: "40", label: "Mossbank store", description: "Storage at 2, 1" }],
  objectId: "",
  targetX: "2",
  targetY: "1",
  quantity: "3",
  onToolChange: vi.fn(),
  onCreatureChange: vi.fn(),
  onObjectChange: vi.fn(),
  onTargetXChange: vi.fn(),
  onTargetYChange: vi.fn(),
  onQuantityChange: vi.fn(),
  onSubmit: vi.fn(),
});

const readyComparison: ComparisonState = {
  status: "ready",
  baselineLabel: "Baseline",
  branchLabel: "Food branch",
  baselineTick: 420,
  branchTick: 420,
  metrics: [
    {
      id: "population",
      label: "Population",
      baseline: 12,
      branch: 13,
      delta: "1 creature",
      deltaDirection: "increase",
      note: "living creatures",
    },
    {
      id: "conflict",
      label: "Conflict events",
      baseline: 4,
      branch: 2,
      delta: "2 events",
      deltaDirection: "decrease",
    },
  ],
};

const causalDetail: CausalEventDetail = {
  id: "event-20",
  tick: 240,
  title: "Iri shared a portion",
  summary: "Iri gave Nalo one food after evaluating hunger and remembered help.",
  immediateCauses: [
    {
      id: "event-18",
      label: "Nalo became hungry",
      kind: "event",
      tick: 232,
      summary: "Hunger crossed the response threshold.",
    },
  ],
  decision: {
    actorLabel: "Iri",
    chosenAction: "Share food with Nalo",
    alternatives: [
      {
        id: "decision-share",
        label: "Share food",
        score: "0.76",
        chosen: true,
        factors: [
          {
            id: "recipient-hunger",
            label: "Recipient hunger",
            contribution: "+0.31",
            direction: "for",
            evidence: [{ id: "event-18", label: "Nalo became hungry", kind: "event" }],
          },
        ],
      },
      {
        id: "decision-keep",
        label: "Keep food",
        score: "0.51",
        factors: [],
      },
    ],
  },
  socialEvidence: [
    {
      id: "memory-9",
      label: "Help received from Nalo",
      kind: "memory",
      summary: "Retained at strength 80.",
    },
  ],
  consequences: [
    {
      id: "event-24",
      label: "Trust increased",
      kind: "relationship",
      tick: 241,
    },
  ],
};

describe("experiment workspace components", () => {
  it("orients the first run, focuses setup, and starts only with a valid scenario and seed", () => {
    const onScenarioChange = vi.fn();
    const onSeedChange = vi.fn();
    const onStart = vi.fn();
    const onDismiss = vi.fn();

    render(
      <ExperimentSetupDialog
        open
        scenarios={[
          {
            id: "meadow",
            label: "Meadow commons",
            description: "A balanced clearing with two loose clusters.",
          },
          {
            id: "scarcity",
            label: "Lean season",
            description: "Sparse food and a long walk to materials.",
          },
        ]}
        scenarioId="meadow"
        seed="4182"
        seedPresets={[
          { seed: 4182, label: "Mossbank", description: "Early sharing behavior" },
          { seed: 7319, label: "Long walk" },
        ]}
        onScenarioChange={onScenarioChange}
        onSeedChange={onSeedChange}
        onStart={onStart}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Set up an experiment" })).toBeTruthy();
    expect(screen.getByText(/opens paused at tick 0/i)).toBeTruthy();
    const scenario = screen.getByRole("combobox", { name: "Scenario" });
    expect(document.activeElement).toBe(scenario);

    fireEvent.change(scenario, { target: { value: "scarcity" } });
    expect(onScenarioChange).toHaveBeenCalledWith("scarcity");
    fireEvent.click(screen.getByRole("button", { name: /Long walk/ }));
    expect(onSeedChange).toHaveBeenCalledWith("7319");
    fireEvent.click(screen.getByRole("button", { name: "Open paused at tick 0" }));
    expect(onStart).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("protects a dirty study with an explicit new-experiment confirmation", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <NewExperimentDialog
        open
        hasUnsavedChanges
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText(/changes that are not saved/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep current study" }));
    fireEvent.click(screen.getByRole("button", { name: "Start new experiment" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("provides a controlled record drawer with file actions, ledger, bookmarks, and native pickers", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const onLoad = vi.fn();
    const onImport = vi.fn();
    const onExport = vi.fn();
    const onRequestNew = vi.fn();
    const onAdd = vi.fn();
    const onVisit = vi.fn();
    const onRemove = vi.fn();
    const onSelectIntervention = vi.fn();
    const onNavigateIntervention = vi.fn();
    const composer = composerProps();

    const props: ExperimentDrawerProps = {
      open: true,
      section: "record",
      experimentName: "Mossbank food study",
      scenarioLabel: "Meadow commons",
      seed: 4182,
      currentTick: 240,
      dirty: true,
      actions: {
        canLoad: true,
        status: { phase: "success", message: "Saved locally at tick 240." },
        onSave,
        onLoad,
        onImport,
        onExport,
        onRequestNew,
      },
      interventions: [
        {
          id: "condition-1",
          tick: 180,
          label: "Add food",
          target: "tile 2, 1",
          quantity: 3,
          status: "applied",
          detail: "Resolved as food patch #72.",
          navigationActions: [
            {
              id: "condition-1-evidence",
              label: "Command outcome event",
              target: { kind: "raw-evidence", ref: { kind: "event", id: 72 } },
            },
          ],
        },
        {
          id: "condition-2",
          tick: 220,
          label: "Add material",
          target: "tile 0, 0",
          status: "rejected",
          reason: "Target tile was blocked at the apply tick.",
        },
      ],
      bookmarks: {
        bookmarks: [{ id: "baseline", tick: 160, label: "Before food" }],
        draftLabel: "After sharing",
        currentTick: 240,
        onDraftLabelChange: vi.fn(),
        onAdd,
        onVisit,
        onRemove,
      },
      composer,
      replay: {
        replay: {
          phase: "idle",
          currentTick: 0,
          targetTick: 240,
          progressPercent: 0,
          hash: { status: "unverified" },
        },
        onReplay: vi.fn(),
        onCancel: vi.fn(),
      },
      comparison: readyComparison,
      causal: {
        status: "ready",
        breadcrumbs: [],
        detail: causalDetail,
        onNavigate: vi.fn(),
      },
      onSectionChange: vi.fn(),
      onClose,
      onSelectIntervention,
      onNavigateIntervention,
    };

    const { rerender } = render(<ExperimentDrawer {...props} />);

    expect(screen.getByRole("complementary", { name: "Mossbank food study" })).toBeTruthy();
    expect(screen.getByText("Unsaved")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Load saved" }));
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledTimes(1);

    const file = new File(["{}"], "study.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Import experiment file"), {
      target: { files: [file] },
    });
    expect(onImport).toHaveBeenCalledWith(file);

    fireEvent.click(screen.getByRole("button", { name: "New experiment" }));
    expect(onRequestNew).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/blocked at the apply tick/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Add material/i }));
    expect(onSelectIntervention).toHaveBeenCalledWith("condition-2");
    fireEvent.click(
      screen.getByRole("button", {
        name: /Command outcome event \(raw evidence\) for Add food at tick 180/,
      }),
    );
    expect(onNavigateIntervention).toHaveBeenCalledWith(
      "condition-1",
      props.interventions[0]?.navigationActions?.[0],
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: "Visit bookmark Before food" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove bookmark Before food" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onVisit).toHaveBeenCalledWith("baseline");
    expect(onRemove).toHaveBeenCalledWith("baseline");

    const creaturePicker = screen.getByRole("combobox", { name: "Creature" });
    expect(creaturePicker.tagName).toBe("SELECT");
    fireEvent.change(creaturePicker, { target: { value: "2" } });
    expect(composer.onCreatureChange).toHaveBeenCalledWith("2");
    fireEvent.click(screen.getByRole("button", { name: "Apply Add food" }));
    expect(composer.onSubmit).toHaveBeenCalledTimes(1);

    rerender(
      <ExperimentDrawer
        {...props}
        actions={{ ...props.actions, disabled: true }}
        bookmarks={{ ...props.bookmarks, disabled: true }}
        composer={{ ...props.composer, disabled: true }}
      />,
    );
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Visit bookmark Before food",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Apply Add food" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Close experiment notebook" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("exposes tile target inputs and disables invalid intervention submission", () => {
    const props = composerProps();
    render(
      <InterventionComposer
        {...props}
        toolId="mark-tile"
        targetX=""
        targetY="1"
        validationMessage="Choose an X coordinate inside the dish."
      />,
    );

    expect(screen.getByRole("group", { name: "Target tile" })).toBeTruthy();
    const xInput = screen.getByRole("spinbutton", { name: "X coordinate" });
    fireEvent.change(xInput, { target: { value: "3" } });
    expect(props.onTargetXChange).toHaveBeenCalledWith("3");
    const submit = screen.getByRole("button", { name: "Apply Mark tile" });
    expect(submit.getAttribute("disabled")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("inside the dish");
  });

  it("previews the exact intervention mechanics without forecasting behavior", () => {
    render(
      <InterventionComposer
        {...composerProps()}
        toolId="mark-tile"
        preview={{
          target: "tile 2, 1",
          applyTick: 84,
          category: "Navigation",
          mechanicalChange: "Close the target passage if the occupancy check permits it.",
        }}
      />,
    );

    const preview = screen.getByRole("complementary", {
      name: "Intervention preview",
    });
    expect(preview.textContent).toContain("tile 2, 1");
    expect(preview.textContent).toContain("84");
    expect(preview.textContent).toContain("Navigation");
    expect(preview.textContent).toContain("does not forecast an outcome");
  });

  it("shows bounded, factual participant response evidence in the ledger", () => {
    render(
      <InterventionLedger
        interventions={[
          {
            id: "branch-command-1",
            tick: 10,
            label: "Food added",
            target: "tile 2, 1",
            status: "applied",
            response: {
              phase: "closed",
              window: "Ticks 10–130; observed through 130.",
              summary:
                "1 participant has recorded response evidence; 1 has no recorded response in this window.",
              participantLines: [
                "Iri: noticed, acted — A completed event was linked to the command event.",
              ],
            },
          },
        ]}
      />,
    );

    expect(screen.getByText(/Response window/).textContent).toContain("closed");
    expect(screen.getByText(/Ticks 10/).textContent).toContain("130");
    expect(screen.getByText(/Iri: noticed, acted/)).toBeTruthy();
  });

  it("offers typed linked views without nesting actions or changing record selection", () => {
    const navigationActions: readonly InterventionNavigationAction[] = [
      {
        id: "raw-command-event",
        label: "Command outcome event",
        target: { kind: "raw-evidence", ref: { kind: "event", id: 91 } },
      },
      {
        id: "affected-tile",
        label: "Tile 2, 1",
        target: { kind: "location", tileIndex: 50 },
      },
      {
        id: "responder-iri",
        label: "Iri",
        target: { kind: "responding-creature", creatureId: 1 },
      },
      {
        id: "later-decision",
        label: "Iri reconsidered sharing",
        target: { kind: "linked-evidence", ref: { kind: "decision", id: 120 } },
      },
      {
        id: "later-moment",
        label: "Food was shared",
        target: { kind: "linked-moment", eventId: 124 },
      },
      {
        id: "comparison",
        label: "Compare outcomes",
        target: { kind: "comparison", branchId: "food-branch" },
      },
      {
        id: "branch-replay",
        label: "Replay food branch",
        target: { kind: "branch-replay", branchId: "food-branch" },
      },
    ];
    const onSelect = vi.fn();
    const onNavigate = vi.fn();
    const { container } = render(
      <InterventionLedger
        interventions={[
          {
            id: "branch-command-1",
            tick: 10,
            label: "Food added",
            target: "tile 2, 1",
            status: "applied",
            navigationActions,
          },
        ]}
        onSelect={onSelect}
        onNavigate={onNavigate}
      />,
    );

    const linkedViews = screen.getByRole("group", {
      name: "Linked views for Food added at tick 10",
    });
    expect(within(linkedViews).getAllByRole("button")).toHaveLength(7);
    expect(container.querySelector("button button")).toBeNull();

    for (const action of navigationActions) {
      const button = within(linkedViews).getByText(action.label).closest("button");
      if (!button) throw new Error(`Navigation action ${action.id} is not a button.`);
      fireEvent.click(button);
    }
    expect(onNavigate.mock.calls).toEqual(
      navigationActions.map((action) => ["branch-command-1", action]),
    );
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", {
        name: /Open intervention record 1.*applied.*Food added.*tile 2, 1.*tick 10/i,
      }),
    );
    expect(onSelect).toHaveBeenCalledWith("branch-command-1");
    expect(within(linkedViews).getByText("Affected location")).toBeTruthy();
    expect(within(linkedViews).getByText("Responding creature")).toBeTruthy();
    expect(within(linkedViews).getByText("Later evidence")).toBeTruthy();
    expect(within(linkedViews).getByText("Later moment")).toBeTruthy();
    expect(within(linkedViews).getByText("Comparison")).toBeTruthy();
    expect(within(linkedViews).getByText("Branch replay")).toBeTruthy();
  });

  it("keeps pending and evidence-free records factual but non-interactive", () => {
    const onSelect = vi.fn();
    render(
      <InterventionLedger
        interventions={[
          {
            id: "branch-command-1",
            tick: 10,
            label: "Food added",
            target: "tile 2, 1",
            status: "pending",
          },
          {
            id: "branch-command-2",
            tick: 11,
            label: "Passage opened",
            target: "tile 4, 3",
            status: "applied",
            selectable: false,
            detail: "Applied without retained command evidence.",
          },
        ]}
        onSelect={onSelect}
      />,
    );

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("pending")).toBeTruthy();
    expect(screen.getByText("Applied without retained command evidence.")).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("announces replay progress and a hash mismatch with a safe cancel path", () => {
    const onCancel = vi.fn();
    const replay: ReplayState = {
      phase: "running",
      currentTick: 210,
      targetTick: 420,
      progressPercent: 50,
      message: "Replaying baseline commands.",
      hash: {
        status: "mismatch",
        expected: "aaaabbbb",
        actual: "ccccdddd",
        message: "The final state differs from the recorded run.",
      },
    };
    render(<ReplayPanel disabled replay={replay} onReplay={vi.fn()} onCancel={onCancel} />);

    const progress = screen.getByRole("progressbar", { name: "Replay progress" });
    expect(progress.getAttribute("value")).toBe("50");
    expect(screen.getByRole("alert").textContent).toContain("Hash mismatch");
    const cancel = screen.getByRole("button", { name: "Cancel replay" });
    expect((cancel as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders exact equal-horizon comparison values and useful incompatible state", () => {
    const { rerender } = render(<ComparisonTable comparison={readyComparison} />);

    const table = screen.getByRole("table", {
      name: "Outcome metrics for Baseline and Food branch",
    });
    expect(within(table).getByRole("rowheader", { name: /Population/ })).toBeTruthy();
    expect(within(table).getByText("1 creature")).toBeTruthy();
    expect(screen.getByText("Equal horizon: tick 420")).toBeTruthy();
    expect(screen.getByText(/observed differences/i).textContent).toContain(
      "not scores, winners, or scripted endings",
    );
    const populationDelta = within(table).getByText("1 creature").closest("td");
    const conflictDelta = within(table).getByText("2 events").closest("td");
    expect(populationDelta?.className).toContain("comparison-delta--increase");
    expect(populationDelta?.textContent).toContain("Increase: +1 creature");
    expect(conflictDelta?.className).toContain("comparison-delta--decrease");
    expect(conflictDelta?.textContent).toContain("Decrease: âˆ’2 events");
    expect(table.querySelector('[class*="positive"], [class*="negative"]')).toBeNull();

    rerender(
      <ComparisonTable
        comparison={{
          ...readyComparison,
          status: "incompatible",
          baselineTick: 400,
          branchTick: 420,
          message: "Runs use different behavior versions.",
        }}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("different behavior versions");
  });

  it("traces event causes, decision factors, social evidence, and consequences", () => {
    const onNavigate = vi.fn();
    const onRetry = vi.fn();
    const { rerender } = render(
      <CausalExplorer
        status="ready"
        breadcrumbs={[
          { id: "metric-trust", label: "Trust delta", kind: "factor" },
          { id: "event-20", label: "Food shared", kind: "event" },
        ]}
        detail={causalDetail}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByRole("navigation", { name: "Causal evidence path" })).toBeTruthy();
    expect(screen.getByText("Retained decision and alternatives")).toBeTruthy();
    expect(screen.getByText("Memories and relationships")).toBeTruthy();
    expect(screen.getByText("Later consequences")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /Nalo became hungry/ })[0]!);
    expect(onNavigate).toHaveBeenCalledWith("event-18");
    fireEvent.click(screen.getByRole("button", { name: "Trust delta" }));
    expect(onNavigate).toHaveBeenCalledWith("metric-trust");

    rerender(
      <CausalExplorer
        status="error"
        breadcrumbs={[]}
        message="Evidence query was interrupted."
        onNavigate={onNavigate}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText("Evidence query was interrupted.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry evidence" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
