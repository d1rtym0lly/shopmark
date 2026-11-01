import { test, expect } from "@playwright/test";
test("catalog pages and coaching respond to purchases and confirmed threats", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#catalog-count")).toContainText("18 сборок");
  const before = await page.locator(".build-card h3").allTextContents();
  await page.locator("#next-builds").click();
  expect(await page.locator(".build-card h3").allTextContents()).not.toEqual(
    before,
  );
  await page.locator("#build-source").selectOption("pro");
  await expect(page.locator("#catalog-count")).toContainText("12 сборок");
  await page.locator("#coach-adv").selectOption("behind");
  await page
    .getByRole("button", { name: "Враг много лечится", exact: true })
    .click();
  await expect(page.locator("#coach-next .coach-advice").first()).toContainText(
    "Healbane",
  );
  await page
    .locator("#coach-next .coach-advice")
    .first()
    .getByRole("button", { name: "Отметить купленным" })
    .click();
  await expect(page.locator('#coach-next [data-item-id="2603935618"]')).toHaveCount(0);
  await page.locator("#coach-enemy").selectOption("Abrams");
  await page.locator("#coach-add-enemy").click();
  await expect(page.locator("#coach-warnings")).toContainText("Abrams");
});
test("hero selection, build inspection and item patch filtering", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#hero-name")).toHaveText("Infernus");
  await expect(page.locator(".build-card")).toHaveCount(3);
  await page.locator("#rank-filter").selectOption("3");
  await page.locator("#hero-search").fill("Bebop");
  await page.getByRole("button", { name: "Bebop" }).click();
  await expect(page.locator("#hero-name")).toHaveText("Bebop");
  await expect(page.locator("#rank-filter")).toHaveValue("0");
  await page.locator("#hero-search").fill("Infernus");
  await page.getByRole("button", { name: "Infernus" }).click();
  await expect(page.locator("#rank-filter")).toHaveValue("3");
  await page.locator("#all-items").click();
  await page.locator("#status-filter").selectOption("nerf");
  await expect(page.locator(".item")).not.toHaveCount(0);
  expect(await page.locator(".item .mark:not(.nerf)").count()).toBe(0);
  await page.locator(".item").first().click();
  await expect(page.locator("#item-detail h3")).toBeVisible();
  await expect(page.locator("#item-detail .notes")).toBeVisible();
  await page.locator("#status-filter").selectOption("all");
  await page.locator("#item-search").fill("Toxic Bullets");
  await expect(page.locator(".item")).toHaveCount(1);
  await expect(page.locator(".item .mark")).toHaveText("↑");
  expect(errors).toEqual([]);
});
test("desktop preview and mobile layout stay within the viewport", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#hero-name")).toHaveText("Infernus");
  await page.locator("#all-items").click();
  await page.locator("#status-filter").selectOption("buff");
  await page.locator(".item").first().click();
  await page
    .locator(".item img")
    .evaluateAll((images) =>
      Promise.all(
        images.slice(0, 10).map((img) => img.decode().catch(() => {})),
      ),
    );
  await page.screenshot({ path: "dist/preview-desktop.png", fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "dist/preview-mobile.png", fullPage: false });
});
