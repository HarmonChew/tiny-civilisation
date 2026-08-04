import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const STORY_SEED = 4_182;

const STORY_SCENES = [
  {
    name: "tick-0",
    tick: 0,
    expectedHash: "bab1ef059a47a308",
    subject: "Iri",
    narrative: "The Petri world began with seed 4182.",
    subjectState: "Iri is deciding what matters next.",
  },
  {
    name: "settlement",
    tick: 101,
    expectedHash: "41545013c5f76779",
    subject: "Iri",
    narrative:
      "Iri, Nalo, Aro, Meka, Pela, Sori formed the Riverhollow group around repeated sharing and sustained proximity.",
    subjectState: "Iri wants to keep a private reserve.",
  },
  {
    name: "construction",
    tick: 198,
    expectedHash: "4fd35c929760a8c4",
    subject: "Iri",
    narrative: "The Riverhollow group began a shared store.",
    subjectState: "Iri is building the shared store.",
  },
  {
    name: "theft",
    tick: 392,
    expectedHash: "231059da8273431b",
    subject: "Taro",
    narrative: "Taro took food without permission.",
    subjectState: "Taro plans to take food under pressure.",
  },
  {
    name: "conflict",
    tick: 486,
    expectedHash: "bf399dda7ae30442",
    subject: "Iri",
    narrative: "Iri confronted Taro, but the blow missed.",
    subjectState: "Iri plans to confront a threat.",
  },
  {
    name: "aftermath",
    tick: 817,
    expectedHash: "bf75fda3458feddf",
    subject: "Taro",
    narrative: "Pela replaced Iri as leader of Riverhollow.",
    subjectState: "Taro plans to rest somewhere safe.",
  },
] as const;

const STORY_VIEWPORTS = [
  { name: "narrow", width: 390, height: 844 },
  { name: "medium", width: 1024, height: 768 },
  { name: "wide", width: 1440, height: 960 },
] as const;

type StoryScene = (typeof STORY_SCENES)[number];

const PHASE_3_SCENARIOS = [
  {
    id: "split-banks",
    name: "Split Banks",
    seed: 7_319,
    developedHash: "a47a3a64865a6901",
    developedSummary:
      "8 creatures are alive; 1 group and 1 completed store is visible; wild food totals 105 units at 2 sites.",
    question:
      "Will two clusters become separate communities, or will the passage draw them into one?",
    startingFacts: [
      "Two clusters of four begin on opposite banks of a narrow central passage.",
      "Each bank has moderate food with the same combined starting stock as the reference world.",
      "The only material patch sits inside the passage between the two clusters.",
    ],
  },
  {
    id: "scattered-plenty",
    name: "Scattered Plenty",
    seed: 1_203,
    developedHash: "f604fd0f89dbbecb",
    developedSummary:
      "8 creatures are alive; 0 groups and 0 completed stores are visible; wild food totals 320 units at 4 sites.",
    question:
      "If nobody needs anyone immediately, will familiarity and sharing become a community?",
    startingFacts: [
      "Four separated pairs begin around an open world rather than in one cluster.",
      "Abundant food is distributed near every pair.",
      "Building material is central, away from every starting pair.",
    ],
  },
  {
    id: "unequal-table",
    name: "Unequal Table",
    seed: 921,
    developedHash: "cf0b710424f9cf3d",
    developedSummary:
      "8 creatures are alive; 1 group and 1 completed store is visible; wild food totals 133 units at 2 sites.",
    question: "Will outsiders receive help before the common store becomes a target?",
    startingFacts: [
      "Five comparatively cooperative creatures begin west of the passage.",
      "Taro and two more aggressive creatures begin together on the eastern bank.",
      "Terrain and resources match the reference world, so social placement carries the contrast.",
    ],
  },
] as const;

type Phase3Scenario = (typeof PHASE_3_SCENARIOS)[number];

function storyExperimentBuffer(scene: StoryScene): Buffer {
  return Buffer.from(
    JSON.stringify({
      kind: "tiny-civilisation/experiment",
      schemaVersion: 3,
      behaviorVersion: 3,
      stateSchemaVersion: 3,
      scenario: {
        kind: "tiny-civilisation/scenario",
        schemaVersion: 2,
        behaviorVersion: 3,
        scenarioId: "petri-world",
        scenarioVersion: 1,
        mapGenerationVersion: 1,
        seed: STORY_SEED,
      },
      rootBranchId: "baseline",
      branches: [
        {
          id: "baseline",
          label: "Baseline",
          parentBranchId: null,
          forkTick: 0,
          targetTick: scene.tick,
          expectedHash: scene.expectedHash,
          commandLog: [],
        },
      ],
      bookmarks: [],
      checkpoints: [],
    }),
  );
}

function phase3ScenarioExperimentBuffer(scenario: Phase3Scenario, tick: number): Buffer {
  return Buffer.from(
    JSON.stringify({
      kind: "tiny-civilisation/experiment",
      schemaVersion: 3,
      behaviorVersion: 3,
      stateSchemaVersion: 3,
      scenario: {
        kind: "tiny-civilisation/scenario",
        schemaVersion: 2,
        behaviorVersion: 3,
        scenarioId: scenario.id,
        scenarioVersion: 1,
        mapGenerationVersion: 1,
        seed: scenario.seed,
      },
      rootBranchId: "baseline",
      branches: [
        {
          id: "baseline",
          label: "Baseline",
          parentBranchId: null,
          forkTick: 0,
          targetTick: tick,
          expectedHash: scenario.developedHash,
          commandLog: [],
        },
      ],
      bookmarks: [],
      checkpoints: [],
    }),
  );
}

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function openPausedWorkspace(page: Page, useTouch = false): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Living dish" })).toBeVisible();

  const setup = page.getByRole("dialog", { name: "Set up an experiment" });
  await expect(setup).toBeVisible();
  await expect(setup.getByText(/opens paused at tick 0/i)).toBeVisible();
  const openPaused = setup.getByRole("button", { name: "Open paused at tick 0" });
  await expect(openPaused).toBeEnabled();
  if (useTouch) await openPaused.tap();
  else await openPaused.click();
  await expect(setup).toBeHidden();

  await expect(page.getByRole("button", { name: /Play simulation/ })).toBeVisible();
  await expect(page.getByRole("application", { name: /Living dish map/ })).toBeVisible();
  await expect(page.getByLabel("Simulation status")).toContainText("Observation paused");
}

async function openPhase3ScenarioAtTickZero(
  page: Page,
  scenario: Phase3Scenario,
): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Living dish" })).toBeVisible();

  const setup = page.getByRole("dialog", { name: "Set up an experiment" });
  await expect(setup).toBeVisible();
  await setup.getByRole("combobox", { name: "Scenario" }).selectOption(scenario.id);
  await expect(setup.getByText(scenario.question, { exact: true })).toBeVisible();

  const startingConditions = setup.getByRole("region", {
    name: "What is true at tick 0",
  });
  await expect(startingConditions).toBeVisible();
  for (const fact of scenario.startingFacts) {
    await expect(startingConditions.getByText(fact, { exact: true })).toBeVisible();
  }

  const seed = setup.getByRole("spinbutton", { name: "Seed" });
  await seed.fill(scenario.seed.toString());
  await expect(seed).toHaveValue(scenario.seed.toString());
  await setup.getByRole("button", { name: "Open paused at tick 0" }).click();
  await expect(setup).toBeHidden();

  await expect(page.getByLabel("Simulation status")).toContainText("Observation paused");
  await expect(page.getByLabel("Simulation status").locator("strong")).toHaveText(
    "Day 1 · 00:00",
  );
  await expect(page.locator(".dish-heading .eyebrow")).toHaveText(
    `${scenario.name} · seed ${scenario.seed.toString()}`,
  );

  const dishSummary = page
    .getByRole("heading", { name: "Dish at a glance" })
    .locator("..")
    .locator("p");
  if (!(await dishSummary.isVisible())) await showRegion(page, "Chronicle");
  await expect(dishSummary).toBeVisible();
  await expect(dishSummary).toContainText(
    `${scenario.name}, seed ${scenario.seed.toString()}.`,
  );
  await expect(dishSummary).toContainText(scenario.question);
  for (const fact of scenario.startingFacts) {
    await expect(dishSummary).toContainText(fact);
  }

  await showRegion(page, "Dish");
  await expect(page.getByRole("application", { name: /Living dish map/ })).toBeVisible();
  await waitForRenderedDish(page);
}

async function loadDevelopedPhase3Scenario(
  page: Page,
  scenario: Phase3Scenario,
): Promise<void> {
  await openPhase3ScenarioAtTickZero(page, scenario);
  await openNotebook(page);
  await page.getByLabel("Import experiment file").setInputFiles({
    name: `${scenario.id}-developed.tinyciv.json`,
    mimeType: "application/json",
    buffer: phase3ScenarioExperimentBuffer(scenario, 2_000),
  });
  await expect(
    page.getByText(
      `Imported ${scenario.name} / seed ${scenario.seed.toString()} at tick 2000.`,
    ),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("region", { name: scenario.question })).toContainText(
    scenario.developedSummary,
  );
  await closeNotebook(page);
  await dismissRetainedMoments(page);
  await expect(page.getByLabel("Simulation status").locator("strong")).toHaveText(
    "Day 1 · 03:20",
  );
  await expect(page.locator(".status-rail__hash")).toContainText(
    scenario.developedHash.slice(0, 12),
  );
  await waitForRenderedDish(page);
}

async function openNotebook(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open experiment notebook" }).click();
  await expect(page.locator("aside.experiment-drawer")).toBeVisible();
}

async function closeNotebook(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Close experiment notebook" }).click();
  await expect(page.locator("aside.experiment-drawer")).toBeHidden();
}

async function expectNoPageOverflow(page: Page): Promise<void> {
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
}

async function waitForRenderedDish(page: Page): Promise<void> {
  const canvas = page.locator("canvas.world-canvas");
  await expect(canvas).toBeVisible();
  await expect
    .poll(async () =>
      canvas.evaluate((element) => {
        const rendered = element as HTMLCanvasElement;
        return rendered.width > 0 && rendered.height > 0;
      }),
    )
    .toBe(true);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

async function dismissRetainedMoments(page: Page): Promise<void> {
  const momentQueue = page.getByRole("heading", { name: "Moment queue" });
  for (let index = 0; index < 16 && (await momentQueue.isVisible()); index++) {
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  }
  await expect(momentQueue).toBeHidden();
}

async function showRegion(page: Page, name: "Chronicle" | "Dish" | "Subject") {
  const tab = page.getByRole("button", { name, exact: true });
  if (await tab.isVisible()) await tab.click();
}

async function selectStorySubject(
  page: Page,
  subject: StoryScene["subject"],
): Promise<void> {
  const navigator = page.getByRole("list", { name: "All in spatial order" });
  if (!(await navigator.isVisible())) await showRegion(page, "Chronicle");
  await expect(navigator).toBeVisible();
  const subjectButton = navigator.getByRole("button", {
    name: new RegExp(`^${subject},`),
  });
  await expect(subjectButton).toBeVisible();
  await subjectButton.click();
  await showRegion(page, "Dish");
  await expect(page.getByRole("application", { name: /Living dish map/ })).toBeVisible();
  await expect(page.locator(".dish-subject-label strong")).toHaveText(subject);
}

async function loadStoryScene(page: Page, scene: StoryScene): Promise<void> {
  await openPausedWorkspace(page);
  if (scene.tick > 0) {
    await openNotebook(page);
    await page.getByLabel("Import experiment file").setInputFiles({
      name: `phase-3-${scene.name}.tinyciv.json`,
      mimeType: "application/json",
      buffer: storyExperimentBuffer(scene),
    });
    await expect(
      page.getByText(`Imported Common Store / seed ${STORY_SEED} at tick ${scene.tick}.`),
    ).toBeVisible({ timeout: 15_000 });
    await closeNotebook(page);
  }

  await expect(page.getByLabel("Simulation status")).toContainText("Observation paused");
  await expect(page.getByText(scene.narrative, { exact: true }).first()).toBeAttached();
  await selectStorySubject(page, scene.subject);
  await expect(page.getByText(scene.subjectState, { exact: false }).first()).toBeAttached();
  await waitForRenderedDish(page);
}

async function applyTextResize(page: Page, scale: number): Promise<void> {
  await page.evaluate((requestedScale) => {
    const candidates = [...document.body.querySelectorAll("*")].reverse();
    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement)) continue;
      const hasDirectText = [...candidate.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
      );
      const isTextControl = candidate.matches("input, select, textarea");
      if (!hasDirectText && !isTextControl) continue;
      const size = Number.parseFloat(getComputedStyle(candidate).fontSize);
      if (!Number.isFinite(size) || size <= 0) continue;
      candidate.style.setProperty("font-size", `${size * requestedScale}px`, "important");
    }
  }, scale);
}

async function replayCurrentBranch(
  page: Page,
  expectedStatusHash: string,
): Promise<string> {
  const experimentDrawer = page.locator("aside.experiment-drawer");
  await experimentDrawer.getByRole("button", { name: "Replay", exact: true }).click();
  const replayPanel = page.locator("section.replay-sheet");
  await replayPanel.getByRole("button", { name: "Replay to target" }).click();
  await expect(replayPanel.getByText("Hash matches expected replay")).toBeVisible();
  await expect(page.locator(".status-rail__hash")).toHaveText(expectedStatusHash);

  const replayHashes = replayPanel.locator(".hash-status code");
  await expect(replayHashes).toHaveCount(2);
  const [expectedHash, actualHash] = await replayHashes.allTextContents();
  expect(actualHash).toBe(expectedHash);
  return actualHash ?? "";
}

test("runs the real Worker, renderer, observation controls, and causal trail", async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  await openPausedWorkspace(page);

  await page.getByRole("button", { name: /Advance one tick/ }).click();
  await openNotebook(page);
  await expect(page.locator(".experiment-drawer__header p")).toContainText("tick 1");
  await closeNotebook(page);

  await page.getByRole("button", { name: "Add food" }).click();
  const dish = page.getByRole("application", { name: /Living dish map/ });
  const bounds = await dish.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds) {
    await page.mouse.click(bounds.x + bounds.width * 0.35, bounds.y + bounds.height * 0.4);
  }

  await expect(page.getByText(/Food addition of 12 units scheduled at/)).toBeVisible();
  await page.getByRole("button", { name: /Advance one tick/ }).click();
  await page.getByRole("button", { name: "You", exact: true }).click();
  const foodEvent = page.getByRole("button", {
    name: /Food appeared\. Inspect causal evidence\./,
  });
  await expect(foodEvent).toBeVisible();

  await dish.focus();
  await dish.press("ArrowRight");
  await dish.press("+");
  await dish.press("Home");
  await foodEvent.click();
  await expect(page.getByRole("heading", { name: "Causal explorer" })).toBeVisible();
  await expect(page.getByText(/Food appeared/).first()).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test("creates, preserves, replays, compares, exports, imports, and explains an experiment", async ({
  page,
}) => {
  test.setTimeout(45_000);
  const browserErrors = collectBrowserErrors(page);
  await openPausedWorkspace(page);
  await expect(page.getByLabel("Simulation status")).toContainText("Observation paused");
  await openNotebook(page);

  await page.getByPlaceholder("Before food condition").fill("Opening baseline");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Opening baseline", { exact: true })).toBeVisible();
  const openingHash = await page.locator(".status-rail__hash").innerText();
  expect(openingHash).not.toContain("pending");
  await expect(
    page.getByText("Baseline bookmarked and an intervention branch opened."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Apply Add food" }).click();
  await expect(page.getByText(/entered the experiment log/)).toBeVisible();
  await expect(page.locator(".experiment-drawer__header p")).toContainText("tick 1");
  await closeNotebook(page);

  await page.getByRole("button", { name: /Advance one tick/ }).click();
  await openNotebook(page);
  await expect(page.locator(".experiment-drawer__header p")).toContainText("tick 2");
  await expect(
    page.locator(".intervention-ledger").getByText("applied", { exact: true }),
  ).toBeVisible();

  await page.getByPlaceholder("Before food condition").fill("Intervention outcome");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Intervention outcome", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Saved locally in this browser/)).toBeVisible();
  const savedHash = await page.locator(".status-rail__hash").innerText();

  await closeNotebook(page);
  await page.getByRole("button", { name: /Advance one tick/ }).click();
  await openNotebook(page);
  await expect(page.locator(".experiment-drawer__header p")).toContainText("tick 3");
  await expect(page.locator(".experiment-save-state")).toHaveText("Unsaved");
  await page.getByRole("button", { name: "Load saved" }).click();
  const loadConfirmation = page.getByRole("dialog", {
    name: "Load the saved experiment?",
  });
  await expect(loadConfirmation).toBeVisible();
  await loadConfirmation.getByRole("button", { name: "Load saved experiment" }).click();
  await expect(page.getByText(/Restored tick 2 without changing its hash/)).toBeVisible();
  await expect(page.locator(".status-rail__hash")).toHaveText(savedHash);

  const interventionReplayHash = await replayCurrentBranch(page, savedHash);

  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.getByRole("button", { name: "Visit bookmark Opening baseline" }).click();
  await expect(page.locator(".experiment-drawer__header p")).toContainText("tick 0");
  await expect(page.locator(".status-rail__hash")).toHaveText(openingHash);
  const baselineReplayHash = await replayCurrentBranch(page, openingHash);
  expect(baselineReplayHash).not.toBe(interventionReplayHash);

  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.getByRole("button", { name: "Visit bookmark Intervention outcome" }).click();
  await expect(page.locator(".experiment-drawer__header p")).toContainText("tick 2");
  await expect(page.locator(".status-rail__hash")).toHaveText(savedHash);

  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Outcome comparison" })).toBeVisible();
  await expect(page.getByText("Equal horizon: tick 2")).toBeVisible();
  await expect(page.getByRole("row", { name: /Thefts/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Confrontations/ })).toBeVisible();

  await page.getByRole("button", { name: "Record", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.tinyciv\.json$/);
  const downloadPath = await download.path();
  if (!downloadPath)
    throw new Error("The exported experiment was not available to import.");
  await page.getByLabel("Import experiment file").setInputFiles(downloadPath);
  await expect(
    page.getByText(/Imported Common Store \/ seed 4182 at tick 2/),
  ).toBeVisible();

  await closeNotebook(page);
  await page.getByLabel("Simulation speed").getByRole("button", { name: /^4/ }).click();
  await page.getByRole("button", { name: /Play simulation/ }).click();
  const explainedOutcome = page
    .locator(".timeline-entry:not(.timeline-entry--player)")
    .getByRole("button", { name: /Food shared\. Inspect causal evidence\./ })
    .first();
  await expect(explainedOutcome).toBeVisible({ timeout: 8_000 });
  await page.getByRole("button", { name: /Pause simulation/ }).click();
  await explainedOutcome.click();
  await expect(page.getByRole("heading", { name: "Causal explorer" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Retained decision and alternatives" }),
  ).toBeVisible();
  await expect(page.getByText("Chosen action", { exact: true })).toBeVisible();
  await expect(page.locator(".factor-evidence-list li").first()).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test("rejects a malformed experiment without changing the active run", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await openPausedWorkspace(page);
  const openingHash = await page.locator(".status-rail__hash").innerText();
  await openNotebook(page);

  await page.getByLabel("Import experiment file").setInputFiles({
    name: "broken.tinyciv.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"kind":"tiny-civilisation/experiment","schemaVersion":'),
  });

  await expect(page.getByRole("alert")).toContainText(/active run was preserved/i);
  await expect(page.locator(".status-rail__hash")).toHaveText(openingHash);
  expect(browserErrors).toEqual([]);
});

test("has no automatically detectable accessibility violations in the primary flow", async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  await openPausedWorkspace(page);

  const navigator = page.getByRole("list", { name: "All in spatial order" });
  const firstSubject = navigator.getByRole("button").first();
  await firstSubject.focus();
  await firstSubject.press("ArrowDown");
  await page.locator(".world-navigator__item:focus").press("Enter");
  await expect(page.getByRole("heading", { name: /.+/ }).last()).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.flatMap((node) => node.target),
    })),
  ).toEqual([]);
  expect(browserErrors).toEqual([]);
});

test("keeps controls and textual state available with reduced motion and forced colors", async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.setViewportSize({ width: 512, height: 768 });
  await openPausedWorkspace(page);

  await expect(page.getByRole("button", { name: "Dish", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Chronicle", exact: true }).click();
  await expect(page.getByRole("list", { name: "All in spatial order" })).toBeVisible();
  await page.getByRole("button", { name: "Dish", exact: true }).click();
  await expect(page.getByRole("application", { name: /Living dish map/ })).toBeVisible();
  await expect(page.locator(".world-attention-announcer")).toHaveCount(1);
  expect(browserErrors).toEqual([]);
});

test("supports the primary flow with true touch input", async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const browserErrors = collectBrowserErrors(page);

  try {
    await openPausedWorkspace(page, true);
    expect(await page.evaluate(() => globalThis.navigator.maxTouchPoints)).toBeGreaterThan(
      0,
    );
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

    await page.getByRole("button", { name: "Chronicle", exact: true }).tap();
    const navigator = page.getByRole("list", { name: "All in spatial order" });
    await expect(navigator).toBeVisible();
    await navigator.getByRole("button", { name: /^Iri,/ }).tap();
    await page.getByRole("button", { name: "Subject", exact: true }).tap();
    await expect(
      page.locator(".workspace-panel--inspector.is-mobile-active"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Dish", exact: true }).tap();
    await page.getByRole("button", { name: "Add food" }).tap();
    const dish = page.getByRole("application", { name: /Living dish map/ });
    const bounds = await dish.boundingBox();
    expect(bounds).not.toBeNull();
    if (!bounds) throw new Error("The touch dish had no rendered bounds.");
    const target = {
      x: bounds.x + bounds.width * 0.35,
      y: bounds.y + bounds.height * 0.4,
    };
    const feedback = page.locator(".feedback-line");
    const feedbackBeforeCancel = await feedback.innerText();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...target, id: 1, radiusX: 5, radiusY: 5, force: 1 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: target.x + 24, y: target.y + 12, id: 1, radiusX: 5, radiusY: 5, force: 1 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await cdp.detach();
    await expect(feedback).toHaveText(feedbackBeforeCancel);
    await expect(page.getByText(/Food addition of 12 units scheduled at/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add food" })).toBeEnabled();

    await page.touchscreen.tap(target.x, target.y);
    await expect(page.getByText(/Food addition of 12 units scheduled at/)).toBeVisible();
    await page.getByRole("button", { name: /Advance one tick/ }).tap();

    await page.getByRole("button", { name: "Chronicle", exact: true }).tap();
    await page.getByRole("button", { name: "You", exact: true }).tap();
    await page
      .getByRole("button", { name: /Food appeared\. Inspect causal evidence\./ })
      .tap();
    await expect(page.getByRole("heading", { name: "Causal explorer" })).toBeVisible();
    await expectNoPageOverflow(page);
    expect(browserErrors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("keeps the region workflow usable with text resized to 200%", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await openPausedWorkspace(page);
  await applyTextResize(page, 2);

  const regionTab = page.getByRole("button", { name: "Chronicle", exact: true });
  await expect(regionTab).toBeVisible();
  expect(
    await regionTab.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    ),
  ).toBeGreaterThanOrEqual(20);
  await expectNoPageOverflow(page);

  const navigator = page.getByRole("list", { name: "All in spatial order" });
  await navigator.getByRole("button", { name: /^Iri,/ }).click();
  await showRegion(page, "Subject");
  await expect(page.locator(".workspace-panel--inspector.is-mobile-active")).toBeVisible();
  await showRegion(page, "Dish");
  await waitForRenderedDish(page);
  await page.getByRole("button", { name: "Open experiment notebook" }).click();
  await expect(page.locator("aside.experiment-drawer")).toBeVisible();
  await closeNotebook(page);
  await expectNoPageOverflow(page);
  expect(browserErrors).toEqual([]);
});

test("keeps the primary regions usable at 400% effective zoom", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  // A 360 CSS-pixel viewport is the reflow width of a 1440-pixel viewport at 400%.
  await page.setViewportSize({ width: 360, height: 640 });
  await openPausedWorkspace(page);
  expect(await page.evaluate(() => matchMedia("(max-width: 900px)").matches)).toBe(true);
  await expectNoPageOverflow(page);

  await showRegion(page, "Chronicle");
  const navigator = page.getByRole("list", { name: "All in spatial order" });
  await expect(navigator).toBeVisible();
  await navigator.getByRole("button", { name: /^Iri,/ }).click();
  await showRegion(page, "Subject");
  await expect(page.locator(".workspace-panel--inspector.is-mobile-active")).toBeVisible();
  await showRegion(page, "Dish");
  await waitForRenderedDish(page);
  await page.getByRole("button", { name: "Open experiment notebook" }).click();
  await expect(page.locator("aside.experiment-drawer")).toBeVisible();
  await closeNotebook(page);
  await expectNoPageOverflow(page);
  expect(browserErrors).toEqual([]);
});

for (const scene of STORY_SCENES) {
  for (const viewport of STORY_VIEWPORTS) {
    test(`${scene.name} story at ${viewport.name} viewport`, async ({ page }) => {
      const browserErrors = collectBrowserErrors(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loadStoryScene(page, scene);
      await expectNoPageOverflow(page);

      const dishBounds = await page
        .getByRole("application", { name: /Living dish map/ })
        .boundingBox();
      expect(dishBounds?.width).toBeGreaterThan(240);
      await expect(page).toHaveScreenshot(`${scene.name}-${viewport.name}.png`, {
        fullPage: true,
      });
      expect(browserErrors).toEqual([]);
    });
  }
}

for (const scenario of PHASE_3_SCENARIOS) {
  for (const viewport of STORY_VIEWPORTS) {
    test(`${scenario.id} tick-0 at ${viewport.name} viewport`, async ({ page }) => {
      const browserErrors = collectBrowserErrors(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openPhase3ScenarioAtTickZero(page, scenario);
      await expectNoPageOverflow(page);

      const dishBounds = await page
        .getByRole("application", { name: /Living dish map/ })
        .boundingBox();
      expect(dishBounds?.width).toBeGreaterThan(240);
      await expect(page).toHaveScreenshot(`${scenario.id}-tick-0-${viewport.name}.png`, {
        fullPage: true,
      });
      expect(browserErrors).toEqual([]);
    });
  }

  test(`${scenario.id} developed state at medium viewport`, async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);
    const medium = STORY_VIEWPORTS.find((viewport) => viewport.name === "medium")!;
    await page.setViewportSize({ width: medium.width, height: medium.height });
    await loadDevelopedPhase3Scenario(page, scenario);
    await expectNoPageOverflow(page);

    await expect(page).toHaveScreenshot(`${scenario.id}-developed-medium.png`, {
      fullPage: true,
    });
    expect(browserErrors).toEqual([]);
  });
}
