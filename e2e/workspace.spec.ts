import { expect, test, type Page } from "@playwright/test";

async function openPausedWorkspace(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Living dish" })).toBeVisible();
  const pause = page.getByRole("button", { name: /Pause simulation/ });
  if (await pause.isVisible()) await pause.click();
  await expect(page.getByRole("button", { name: /Play simulation/ })).toBeVisible();
  await expect(page.getByRole("application", { name: /Living dish map/ })).toBeVisible();
}

test("runs the real renderer and core observation controls", async ({ page }) => {
  await openPausedWorkspace(page);
  await page.getByRole("button", { name: /Advance one tick/ }).click();
  await page.getByRole("button", { name: "Add food" }).click();

  const dish = page.getByRole("application", { name: /Living dish map/ });
  const bounds = await dish.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds) {
    await page.mouse.click(bounds.x + bounds.width * 0.35, bounds.y + bounds.height * 0.4);
  }

  await expect(page.getByText(/Food added at/)).toBeVisible();
  await page.getByRole("button", { name: "You" }).click();
  await expect(page.getByText("Food appeared")).toBeVisible();

  await dish.focus();
  await dish.press("ArrowRight");
  await dish.press("+");
  await dish.press("Home");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

for (const viewport of [
  { name: "narrow", width: 390, height: 844 },
  { name: "medium", width: 1024, height: 768 },
  { name: "wide", width: 1440, height: 960 },
] as const) {
  test(`${viewport.name} workspace visual`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openPausedWorkspace(page);
    if (viewport.name === "narrow") {
      await page.getByRole("button", { name: "Dish", exact: true }).click();
    }
    await expect(page).toHaveScreenshot(`${viewport.name}-workspace.png`, {
      fullPage: true,
    });
  });
}
