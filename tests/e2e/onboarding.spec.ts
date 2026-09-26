import { expect, test } from "@playwright/test";
import { mockBackend } from "./mocks";

test("configuração inicial do começo ao fim", async ({ page }) => {
  await mockBackend(page, { onboarding: true, serverKey: false });
  await page.goto("/");

  const onboarding = page.getByTestId("onboarding");
  await expect(onboarding).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seu estúdio de flashcards com IA" })).toBeVisible();
  await page.getByLabel("Como você quer ser chamado?").fill("Pedro");
  await page.getByTestId("onboarding-next").click();

  // Etapa da IA: escolhe o provedor, testa a chave (que é salva) e liga um revisor
  await expect(page.getByRole("heading", { name: "Escolha a sua IA" })).toBeFocused();
  // Informações de uso e custo de cada IA
  await expect(page.getByRole("radio", { name: /Groq/ })).toContainText("US$ 0,25 / 100 materiais");
  await expect(page.getByTestId("provider-facts").first()).toContainText("Ver preços oficiais");
  // A combinação recomendada liga o revisor (Groq)
  await page.getByRole("button", { name: "Usar essa combinação" }).click();
  await expect(page.getByLabel("Revisa com")).toHaveValue("groq");
  await page.getByRole("radio", { name: /OpenRouter/ }).click();
  await page.getByLabel("Chave de OpenRouter").fill("sk-or-teste");
  await page.getByRole("button", { name: "Testar" }).first().click();
  await expect(page.getByText(/Saldo: US\$\s4,20/)).toBeVisible();
  await expect(page.getByLabel("Revisa com")).toHaveValue("groq");
  await page.getByTestId("onboarding-next").click();

  // Etapa do Anki: o mock responde, então aparece conectado
  await expect(page.getByTestId("onboarding-anki-status")).toContainText("Anki conectado · 2 baralhos");
  await page.getByTestId("onboarding-next").click();

  // Etapa de dados: opcional
  await expect(page.getByRole("heading", { name: "Traga o que você já tem" })).toBeVisible();
  await page.getByTestId("onboarding-next").click();

  // Primeira aba
  await page.getByRole("radio", { name: /Inglês i\+1/ }).click();
  await page.getByRole("button", { name: "Ir para o estúdio" }).click();

  await expect(onboarding).toBeHidden();
  await expect(page.getByRole("heading", { name: "Inglês i+1" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Inglês i+1" })).toBeVisible();
  await expect(onboarding).toBeHidden();
  await page.getByRole("button", { name: "Início" }).click();
  await expect(page.getByTestId("greeting")).toContainText("Pedro");
});

test("pular a configuração não mostra de novo, e dá para reabrir nas Configurações", async ({ page }) => {
  await mockBackend(page, { onboarding: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Pular configuração" }).click();
  await expect(page.getByTestId("onboarding")).toBeHidden();

  await page.reload();
  await expect(page.getByTestId("greeting")).toBeVisible();
  await expect(page.getByTestId("onboarding")).toBeHidden();

  await page.getByRole("button", { name: "Configurações" }).click();
  await page.getByRole("button", { name: "Abrir o guia de configuração" }).click();
  await expect(page.getByTestId("onboarding")).toBeVisible();
});

test("rodando local, chave e Anki já aparecem prontos", async ({ page }) => {
  await mockBackend(page, { onboarding: true, serverKey: true });
  await page.goto("/");
  await page.getByTestId("onboarding-next").click();
  await expect(page.getByText(/Este servidor já tem uma chave configurada/)).toBeVisible();
  await expect(page.getByTestId("onboarding-next")).toHaveText(/Continuar/);
});
