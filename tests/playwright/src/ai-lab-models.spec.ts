/**********************************************************************
 * Copyright (C) 2024-2025 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 ***********************************************************************/

import type { Locator, Page } from '@playwright/test';
import type { NavigationBar, ExtensionsPage } from '@podman-desktop/tests-playwright';
import {
  expect as playExpect,
  test,
  RunnerOptions,
  isWindows,
  waitForPodmanMachineStartup,
  isLinux,
  podmanAILabExtension,
  isCI
} from '@podman-desktop/tests-playwright';
import { AILabPage } from './model/ai-lab-page';
import type { AILabRecipesCatalogPage } from './model/ai-lab-recipes-catalog-page';
import { AILabExtensionDetailsPage } from './model/podman-extension-ai-lab-details-page';
import type { AILabCatalogPage } from './model/ai-lab-catalog-page';
import { handleWebview } from './utils/webviewHandler';
import type { AILabServiceDetailsPage } from './model/ai-lab-service-details-page';
import type { AILabPlaygroundsPage } from './model/ai-lab-playgrounds-page';
import type { AILabPlaygroundDetailsPage } from './model/ai-lab-playground-details-page';

export type ModelTestStruct = {
    model: string;
    service: boolean;
    recipes: string[];
    timeout?: number;
}

const runnerOptions = {
    customFolder: 'ai-lab-tests-pd',
    aiLabModelUploadDisabled: isWindows ? true : false,
};

const AI_LAB_EXTENSION_OCI_IMAGE =
  process.env.EXTENSION_OCI_IMAGE ?? 'ghcr.io/containers/podman-desktop-extension-ai-lab:1.7.1';
const AI_LAB_EXTENSION_PREINSTALLED: boolean = process.env.EXTENSION_PREINSTALLED === 'true';
const AI_LAB_CATALOG_STATUS_ACTIVE: string = 'ACTIVE';

let extensionsPage: ExtensionsPage;
let isInstalled: boolean;
let webview: Page;
let aiLabPage: AILabPage;

test.use({
  runnerOptions: new RunnerOptions(runnerOptions),
});

const models = ['ggerganov/whisper.cpp', 'facebook/detr-resnet-101', 'ibm-granite/granite-3.3-8b-instruct-GGUF'];

const testMatrix: ModelTestStruct[] = [
    {
        model: 'ggerganov/whisper.cpp',
        service: true,
        recipes: ['Audio to Text'],
    },
    {
        model: 'facebook/detr-resnet-101',
        service: false,
        recipes: ['Object Detection'],
    },
    {
        model: 'ibm-granite/granite-3.3-8b-instruct-GGUF',
        service: true,
        recipes: [
            'ChatBot', 
            'Summarizer', 
            'Code Generation', 
            'RAG Chatbot', 
            'ReAct Agent Application', 
            'Node.js RAG Chatbot', 
            'Java-based ChatBot (Quarkus)', 
            'Node.js based ChatBot', 
            'Function calling', 
            'Node.js Function calling', 
            'Graph RAG Chat Application'],
        timeout: 600_000,
    },
    {
        model: 'MaziyarPanahi/Mistral-7B-Instruct-v0.3.Q4_K_M',
        service: true,
        recipes: ['Chatbot PydanticAI'],
        timeout: 600_000,
    },
];

test.beforeAll(async ({ runner, welcomePage, page, navigationBar }) => {
    test.setTimeout(120_000);
    const window = await runner.getElectronApp().firstWindow();
    // Increase Window Size to improve video recording and screenshots
    await window.setViewportSize({ width: 1050, height: 700 });
  
    runner.setVideoAndTraceName(`ai-lab-e2e`);
    await welcomePage.handleWelcomePage(true);
    // we need to wait for podman machine/podman to be started
    await waitForPodmanMachineStartup(page);
    // check extension or install it
    await installExtension(navigationBar);
});

test.afterAll(async ({ runner }) => {
    test.setTimeout(120_000);
    // await cleanupServiceModels();
    await runner.close();
});

testMatrix.forEach(testItem => {
let timeout = 300_000;
test.describe(`Verify Model ${testItem.model} and its functionality`, () => {
    let catalogPage: AILabCatalogPage;
    let modelServiceDetailsPage: AILabServiceDetailsPage;
    let recipesCatalogPage: AILabRecipesCatalogPage;
    timeout = testItem.timeout ?? timeout;

    test.beforeEach(`Open AI Lab Catalog`, async ({ runner, page, navigationBar }) => {
    [page, webview] = await handleWebview(runner, page, navigationBar);
    aiLabPage = new AILabPage(page, webview);
    await aiLabPage.navigationBar.waitForLoad();
    });

    test(`Can download model ${testItem.model}`, async () => {
    test.setTimeout(timeout + 20_000);
    catalogPage = await aiLabPage.navigationBar.openCatalog();
    await catalogPage.waitForLoad();
    if (!(await catalogPage.isModelDownloaded(testItem.model))) {
        await catalogPage.downloadModel(testItem.model);
    }
    await playExpect
        // eslint-disable-next-line sonarjs/no-nested-functions
        .poll(async () => await waitForCatalogModel(testItem.model), { timeout: timeout, intervals: [5_000] })
        .toBeTruthy();
    });

    test(`Create model service for ${testItem.model} model`, async () => {
    // detr-resnet has no defined backend
    test.skip(!testItem.service, `Skipping model service creation for ${testItem.model}`);
    test.setTimeout(310_000);
    catalogPage = await aiLabPage.navigationBar.openCatalog();
    await catalogPage.waitForLoad();
    const modelServiceCreationPage = await catalogPage.createModelService(testItem.model);
    await modelServiceCreationPage.waitForLoad();

    modelServiceDetailsPage = await modelServiceCreationPage.createService();
    await modelServiceDetailsPage.waitForLoad();

    await playExpect(modelServiceDetailsPage.modelName).toContainText(testItem.model);
    await playExpect(modelServiceDetailsPage.inferenceServerType).toContainText('Inference');
    });

    test(`Make GET request to the model service for ${testItem.model}`, async ({ request }) => {
    // test.skip(modelName === 'instructlab/granite-7b-lab-GGUF', `Skipping GET request for ${modelName}`);
    test.skip(!testItem.service, `Skipping model service get request for ${testItem.model}`);
    const port = await modelServiceDetailsPage.getInferenceServerPort();
    const url = `http://localhost:${port}`;

    // eslint-disable-next-line sonarjs/no-nested-functions
    await playExpect(async () => {
        const response = await request.get(url);
        playExpect(response.ok()).toBeTruthy();
    }).toPass({ timeout: 30_000 });
    });

    test(`Delete model service for ${testItem.model}`, async () => {
    test.setTimeout(150_000);
    const modelServicePage = await modelServiceDetailsPage.deleteService();
    await playExpect(modelServicePage.heading).toBeVisible({ timeout: 120_000 });
    });

    testItem.recipes.forEach(recipe => {
    test(`Can create and deploy ${recipe} recipe for ${testItem.model}`, async () => {
        test.setTimeout(1_500_000);
        await aiLabPage.navigationBar.waitForLoad();
        recipesCatalogPage = await aiLabPage.navigationBar.openRecipesCatalog();
        await recipesCatalogPage.waitForLoad();
        const demoApp = await recipesCatalogPage.openRecipesCatalogApp(recipe);
        await demoApp.waitForLoad();
        await demoApp.startNewDeployment();
    });

    test(`Can delete ${recipe} recipe`, async () => {
        test.setTimeout(150_000);
        await stopAndDeleteApp(aiLabPage, recipe);
        // await cleanupServiceModels();
        // await deleteUnusedImages(navigationBar);
    });
    });

    test(`Can delete model`, async () => {
    test.skip(isWindows, 'Model deletion is currently very buggy in azure cicd');
    test.skip(!isCI, 'Skipping locally');
    test.setTimeout(180_000);
    catalogPage = await aiLabPage.navigationBar.openCatalog();
    await catalogPage.waitForLoad();
    playExpect(await catalogPage.isModelDownloaded(testItem.model)).toBeTruthy();
    // await catalogPage.deleteModel(testItem.model);
    // await playExpect
    //   // eslint-disable-next-line sonarjs/no-nested-functions
    //   .poll(async () => await waitForCatalogModel(testItem.model), { timeout: 160_000, intervals: [2_500] })
    //   .toBeFalsy();
    });
});
});

async function cleanupServiceModels(): Promise<void> {
  try {
    const modelServicePage = await aiLabPage.navigationBar.openServices();
    await modelServicePage.waitForLoad();
    await modelServicePage.deleteAllCurrentModels();
    await playExpect.poll(async () => await modelServicePage.getCurrentModelCount(), { timeout: 60_000 }).toBe(0);
  } catch (error) {
    console.log(`Error while cleaning up service models: ${error}`);
  }
}

async function waitForCatalogModel(modelName: string): Promise<boolean> {
  const recipeCatalogOage = await aiLabPage.navigationBar.openRecipesCatalog();
  await recipeCatalogOage.waitForLoad();

  const catalogPage = await aiLabPage.navigationBar.openCatalog();
  await catalogPage.waitForLoad();

  return await catalogPage.isModelDownloaded(modelName);
}

async function stopAndDeleteApp(aiLabPage: AILabPage, appName: string): Promise<void> {
  const aiRunningAppsPage = await aiLabPage.navigationBar.openRunningApps();
  await aiRunningAppsPage.waitForLoad();
  await playExpect.poll(async () => await aiRunningAppsPage.appExists(appName), { timeout: 10_000 }).toBeTruthy();
  await playExpect
    .poll(async () => await aiRunningAppsPage.getCurrentStatusForApp(appName), { timeout: 60_000 })
    .toBe('RUNNING');
  await aiRunningAppsPage.stopApp(appName);
  await playExpect
    .poll(async () => await aiRunningAppsPage.getCurrentStatusForApp(appName), { timeout: 60_000 })
    .toBe('UNKNOWN');
  await aiRunningAppsPage.deleteAIApp(appName);
  await playExpect.poll(async () => await aiRunningAppsPage.appExists(appName), { timeout: 60_000 }).toBeFalsy();
}

export async function installExtension(navigationBar: NavigationBar): Promise<void> {
    await navigationBar.openDashboard();
    extensionsPage = await navigationBar.openExtensions();
    isInstalled = await extensionsPage.extensionIsInstalled(podmanAILabExtension.extensionFullLabel);
    if (!isInstalled) {
      await extensionsPage.installExtensionFromOCIImage(AI_LAB_EXTENSION_OCI_IMAGE);
    }
    await playExpect
    .poll(async () => await extensionsPage.extensionIsInstalled(podmanAILabExtension.extensionFullLabel), { timeout: 30000 })
    .toBeTruthy();
    const extensionCard = await extensionsPage.getInstalledExtension(
        podmanAILabExtension.extensionFullName,
        podmanAILabExtension.extensionFullLabel,
    );
    await playExpect(extensionCard.status).toHaveText(AI_LAB_CATALOG_STATUS_ACTIVE);
}
