import { expect, test, type Page } from "@playwright/test";

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function openPausedWorkspace(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Living dish" })).toBeVisible();

  const setup = page.getByRole("dialog", { name: "Set up an experiment" });
  if (await setup.isVisible()) {
    await expect(setup.getByText(/opens paused at tick 0/i)).toBeVisible();
    const openPaused = setup.getByRole("button", { name: "Open paused at tick 0" });
    await expect(openPaused).toBeEnabled();
    await openPaused.click();
    await expect(setup).toBeHidden();
  }

  await expect(page.getByRole("button", { name: /Play simulation/ })).toBeVisible();
  await expect(page.getByRole("application", { name: /Living dish map/ })).toBeVisible();
  await expect(page.locator(".status-rail__hash")).not.toContainText("pending");
}

async function openNotebook(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open experiment notebook" }).click();
  await expect(page.locator("aside.experiment-drawer")).toBeVisible();
}

async function closeNotebook(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Close experiment notebook" }).click();
  await expect(page.locator("aside.experiment-drawer")).toBeHidden();
}

async function replayCurrentBranch(
  page: Page,
  expectedStatusHash: string,
): Promise<string> {
  await page.getByRole("button", { name: "Replay", exact: true }).click();
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

  const hash = page.locator(".status-rail__hash");
  const openingHash = await hash.innerText();
  await page.getByRole("button", { name: /Advance one tick/ }).click();
  await expect.poll(() => hash.innerText()).not.toBe(openingHash);

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
  await expect(page.getByText("Food appeared", { exact: true })).toBeVisible();

  await dish.focus();
  await dish.press("ArrowRight");
  await dish.press("+");
  await dish.press("Home");
  await page.getByText("Food appeared", { exact: true }).click();
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
  const openingHash = await page.locator(".status-rail__hash").innerText();
  await openNotebook(page);

  await page.getByPlaceholder("Before food condition").fill("Opening baseline");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Opening baseline", { exact: true })).toBeVisible();
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
  await expect
    .poll(() => page.locator(".status-rail__hash").innerText())
    .not.toBe(savedHash);
  await openNotebook(page);
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
  await expect(page.getByText(/Imported seed 4182 at tick 2/)).toBeVisible();

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

for (const viewport of [
  { name: "narrow", width: 390, height: 844 },
  { name: "medium", width: 1024, height: 768 },
  { name: "wide", width: 1440, height: 960 },
] as const) {
  test(`${viewport.name} workspace visual`, async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openPausedWorkspace(page);
    if (viewport.name === "narrow") {
      await page.getByRole("button", { name: "Dish", exact: true }).click();
    }
    await expect(page).toHaveScreenshot(`${viewport.name}-workspace.png`, {
      fullPage: true,
    });
    expect(browserErrors).toEqual([]);
  });
}
