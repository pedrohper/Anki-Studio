import { expect, test } from "@playwright/test";
import { mockBackend } from "./mocks";

test("Início cumprimenta pelo nome e mostra o que revisar hoje", async ({ page }) => {
  await mockBackend(page, { settings: { userName: "Pedro" } });
  await page.goto("/");
  await expect(page.getByTestId("greeting")).toContainText(", Pedro!");
  await expect(page.locator("p", { hasText: "flashcards para revisar hoje" })).toContainText("Você tem 18 flashcards");
  await expect(page.getByRole("img", { name: "Revisões por dia" })).toBeVisible();
  await expect(page.getByTestId("deck-due-list")).toContainText("Faculdade");
});

test("material solto no Início vai para a aba certa e já gera", async ({ page }) => {
  const { generateBodies } = await mockBackend(page);
  await page.goto("/");
  await page.getByLabel("O que você aprendeu").fill("throughput, deadlock, actually: palavras que vi no trabalho hoje");
  await page.getByTestId("quick-capture-send").click();
  await expect(page.getByRole("heading", { name: "Inglês i+1" })).toBeVisible();
  await expect(page.getByTestId("plan-review")).toBeVisible();
  // a IA recebeu os cards que já existem no baralho para não repetir
  expect(generateBodies[0]?.existingCards).toEqual(["Card que já existe", "Outro card"]);
});

test("baralhos do Anki viram abas", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Transformar em abas" }).click();
  const list = page.getByTestId("deck-import-list");
  await expect(list).toContainText("Faculdade");
  await expect(list).toContainText("Cálculo II");
  await page.getByRole("button", { name: /Criar 1 aba/ }).click();
  await expect(page.getByRole("heading", { name: "Faculdade" })).toBeVisible();
  await expect(page.getByText("📦 Faculdade + 1 sub-baralho")).toBeVisible();
});

test("pontos fracos: a IA agrupa os erros e gera reforço", async ({ page }) => {
  const { generateBodies } = await mockBackend(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Pontos fracos" }).first().click();
  await page.getByTestId("analyze-weak-spots").click();
  await expect(page.getByTestId("weak-summary")).toContainText("falsos cognatos");
  const theme = page.getByTestId("weak-theme");
  await expect(theme).toContainText("6 erros");
  await theme.getByRole("button", { name: /Gerar cards de reforço/ }).click();
  await expect(page.getByTestId("plan-review")).toBeVisible();
  expect(generateBodies[0]?.purpose).toBe("reinforcement");
  expect(String(generateBodies[0]?.material)).toContain("errou 6 vezes");
});

test("o que chega pelo Compartilhar do celular cai na captura rápida", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/?titulo=Aula&texto=Mitoc%C3%B4ndria%20produz%20ATP%20na%20respira%C3%A7%C3%A3o%20celular");
  await expect(page.getByLabel("O que você aprendeu")).toHaveValue(
    "Aula\n\nMitocôndria produz ATP na respiração celular",
  );
  // a URL fica limpa para não repetir se recarregar
  await expect(page).toHaveURL(/\/$/);
});

test("configurações mostram o endereço e o QR code para o celular", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Configurações" }).click();
  await expect(page.getByTestId("lan-url")).toHaveText("http://192.168.100.10:3000");
  await expect(page.getByRole("img", { name: /QR code para abrir/ })).toBeVisible();
});

test("gamificação: nível, semana e conquistas com comemoração", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/");
  const card = page.getByTestId("level-card");
  await expect(card).toContainText("Nível");
  await expect(page.getByTestId("streak")).toContainText("30 dias seguidos");
  // primeira visita: as conquistas que já tinha vêm num aviso só
  await expect(page.getByText(/conquistas desbloqueadas!/)).toBeVisible();

  await page.getByRole("button", { name: "Conquistas" }).first().click();
  await expect(page.getByRole("heading", { name: "Conquistas" })).toBeVisible();
  await expect(page.getByTestId("tier-prata").locator("[data-unlocked]", { hasText: "Semana inteira" })).toBeVisible();
  await expect(page.getByTestId("tier-lenda")).toContainText("Centenário");
});

test("configurações: criar PIN para o acesso fora de casa", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Configurações" }).click();
  await expect(page.getByTestId("create-pin")).toBeVisible();
});
