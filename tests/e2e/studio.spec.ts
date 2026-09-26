import { expect, test } from "@playwright/test";
import { mockBackend, mockReviewer, openTab } from "./mocks";

test("gera, revisa e envia cards ao Anki", async ({ page }) => {
  const { added } = await mockBackend(page);
  await page.goto("/");
  await openTab(page, "Estudo geral");

  await expect(page.getByRole("heading", { name: "Estudo geral" })).toBeVisible();
  await expect(page.getByTestId("anki-status")).toContainText("Anki conectado");

  await page
    .getByLabel("Material de estudo")
    .fill("Derivadas parciais: fx trata y como constante. Clairaut: fxy = fyx.");
  await page.getByTestId("generate").click();

  const review = page.getByTestId("plan-review");
  await expect(review).toContainText("Cálculo II · derivadas parciais");
  await expect(page.getByTestId("card-item")).toHaveCount(3);
  await expect(page.getByLabel("Baralho de destino")).toHaveValue("Faculdade::Cálculo II");

  // descarta o 3º card e edita o 1º
  await page.getByLabel("Incluir card 3").click();
  await page.getByTestId("card-item").first().getByLabel("Editar card").click();
  await page.getByLabel("Verso do card").fill("y fica <b>fixo</b>.");
  await page.getByLabel("Concluir edição").click();
  await expect(page.getByTestId("card-item").first()).toContainText("Editado");

  await page.getByTestId("send-to-anki").click();
  await expect(page.getByText("2 enviados para Faculdade::Cálculo II")).toBeVisible();
  expect(added).toHaveLength(2);
  expect(JSON.stringify(added[0])).toContain("y fica <b>fixo</b>.");
  expect(JSON.stringify(added[1])).toContain("Omissão de Palavras");
});

test("cria uma aba nova com prompt escrito pela IA", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/");
  await openTab(page, "Estudo geral");

  await page.getByRole("button", { name: "Nova aba" }).click();
  await page.getByLabel("Nome").fill("Direito Penal");
  await page
    .getByLabel("Objetivo")
    .fill("Diferenciar dolo eventual e culpa consciente e outros institutos que confundem na prova da OAB.");
  await page.getByLabel("Baralho padrão no Anki").fill("OAB::Penal");
  await page.getByRole("button", { name: "Criar prompt com IA" }).click();

  await expect(page.getByRole("textbox", { name: "Texto do prompt" })).toHaveValue(/Direito Penal/);
  await page.getByRole("button", { name: "Salvar aba" }).click();

  await expect(page.getByRole("heading", { name: "Direito Penal" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Abas de estudo" })).toContainText("Direito Penal");
});

test("não tem rolagem horizontal no celular", async ({ page }) => {
  await mockBackend(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await openTab(page, "Estudo geral");
  await page.getByLabel("Material de estudo").fill("Derivadas parciais: fx trata y como constante.");
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("card-item")).toHaveCount(3);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("um segundo modelo revisa e a pessoa aplica a correção", async ({ page }) => {
  const { added } = await mockBackend(page, {
    settings: { reviewer: { provider: "groq", model: "" }, rememberKey: true, providerKeys: { groq: "gsk-teste" } },
  });
  await mockReviewer(page);
  await page.goto("/");
  await openTab(page, "Estudo geral");

  await page
    .getByLabel("Material de estudo")
    .fill("Derivadas parciais: fx trata y como constante. Clairaut: fxy = fyx.");
  await page.getByTestId("generate").click();

  const panel = page.getByTestId("reviewer-panel");
  await expect(panel).toContainText("Revisado por Groq · openai/gpt-oss-120b");
  await expect(panel).toContainText("1 card aprovado · 1 com sugestão de ajuste · 1 para descartar");

  const suggestions = page.getByTestId("review-suggestion");
  await expect(suggestions).toHaveCount(2);
  await suggestions.first().getByRole("button", { name: "Aplicar correção" }).click();
  await expect(page.getByTestId("card-item").nth(1)).toContainText("Corrigido pelo revisor");
  await page.getByTestId("review-suggestion").getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByTestId("review-suggestion")).toHaveCount(0);

  await page.getByTestId("send-to-anki").click();
  await expect(page.getByText("2 enviados para Faculdade::Cálculo II")).toBeVisible();
  expect(JSON.stringify(added[1])).toContain("maior crescimento");
});
