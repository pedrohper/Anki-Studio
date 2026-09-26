import { expect, type Page, test } from "@playwright/test";
import { mockBackend, mockReviewer, openTab } from "./mocks";

const hideToasts = (page: Page) => page.addStyleTag({ content: "[data-sonner-toaster]{display:none!important}" });

/**
 * Gera as imagens do README. Só roda com SCREENSHOTS=1:
 *   SCREENSHOTS=1 pnpm exec playwright test readme-screenshots
 */
test.skip(!process.env.SCREENSHOTS, "só para atualizar as imagens do README");

for (const theme of ["light", "dark"] as const) {
  test(`captura da revisão (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 1280, height: 1180 });
    await mockBackend(page);
    await page.goto("/");
    await openTab(page, "Estudo geral");
    await hideToasts(page);
    await page.getByLabel("Material de estudo").fill("Derivadas parciais: fx trata y como constante.");
    await page.getByTestId("generate").click();
    await expect(page.getByTestId("card-item")).toHaveCount(3);
    await page.getByTestId("card-item").nth(1).getByLabel("Mostrar respostas").click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `docs/screenshots/revisao-${theme}.png` });
  });
}

test("captura da criação de aba", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockBackend(page);
  await page.goto("/");
  await openTab(page, "Estudo geral");
  await page.getByRole("button", { name: "Nova aba" }).click();
  await page.getByLabel("Ícone").fill("⚖️");
  await page.getByLabel("Nome").fill("Direito Penal");
  await page
    .getByLabel("Objetivo")
    .fill("Diferenciar dolo eventual e culpa consciente e outros institutos que confundem na prova da OAB.");
  await page.getByLabel("Baralho padrão no Anki").fill("OAB::Penal");
  await page.waitForTimeout(300);
  await page.screenshot({ path: "docs/screenshots/nova-aba.png" });
});

test("captura mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1400 });
  await mockBackend(page);
  await page.goto("/");
  await openTab(page, "Estudo geral");
  await hideToasts(page);
  await page.getByLabel("Material de estudo").fill("Derivadas parciais: fx trata y como constante.");
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("card-item")).toHaveCount(3);
  await page.screenshot({ path: "docs/screenshots/mobile.png" });
});

test("captura do onboarding", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1250 });
  await mockBackend(page, { onboarding: true, serverKey: false });
  await page.goto("/");
  await hideToasts(page);
  await page.getByTestId("onboarding-next").click();
  await page.getByRole("radio", { name: /OpenRouter/ }).click();
  await page.getByLabel("Chave de OpenRouter").fill("sk-or-teste");
  await page.getByRole("button", { name: "Testar" }).click();
  await expect(page.getByText(/Saldo:/)).toBeVisible();
  await page.getByText("Revisar os cards com um segundo modelo").click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: "docs/screenshots/onboarding-chave.png" });
  await page.getByTestId("onboarding-next").click();
  await expect(page.getByTestId("onboarding-anki-status")).toContainText("Anki conectado");
  await page.waitForTimeout(700);
  await page.screenshot({ path: "docs/screenshots/onboarding-anki.png" });
});

test("captura do onboarding sem Anki", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await mockBackend(page, { onboarding: true, serverKey: true });
  await page.route("**/api/anki", (route) =>
    route.fulfill({ status: 503, json: { error: { message: "Anki fechado" } } }),
  );
  await page.goto("/");
  await page.getByTestId("onboarding-next").click();
  await page.getByTestId("onboarding-next").click();
  await expect(page.getByTestId("onboarding-anki-status")).toContainText("Procurando o Anki");
  await page.waitForTimeout(700);
  await page.screenshot({ path: "docs/screenshots/onboarding-anki-guia.png" });
});

test("captura da revisão com segundo modelo", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1300 });
  await mockBackend(page, {
    settings: { reviewer: { provider: "groq", model: "" }, rememberKey: true, providerKeys: { groq: "gsk-teste" } },
  });
  await mockReviewer(page);
  await page.goto("/");
  await openTab(page, "Estudo geral");
  await hideToasts(page);
  await page.getByLabel("Material de estudo").fill("Derivadas parciais: fx trata y como constante.");
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("reviewer-panel")).toContainText("Revisado por");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "docs/screenshots/revisor.png" });
});

test("captura do Início", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  await mockBackend(page, { settings: { userName: "Pedro" } });
  await page.goto("/");
  await hideToasts(page);
  await expect(page.getByRole("img", { name: "Revisões por dia" })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "docs/screenshots/inicio.png" });
});

test("captura dos pontos fracos", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await mockBackend(page);
  await page.goto("/");
  await hideToasts(page);
  await page.getByRole("button", { name: "Pontos fracos" }).first().click();
  await page.getByTestId("analyze-weak-spots").click();
  await expect(page.getByTestId("weak-theme")).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "docs/screenshots/pontos-fracos.png" });
});
