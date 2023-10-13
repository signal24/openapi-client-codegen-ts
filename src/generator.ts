import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, watch } from 'node:fs';
import { rm } from 'node:fs/promises';

import * as OpenAPI from 'openapi-typescript-codegen';

const DEFAULT_OUT_PATH = './src/openapi-client-generated';

let generatedHash: string | null = null;
let generatorMap: Record<string, string> = {};
let overridesMap: Record<string, string> | null = null;
let overridesInverseMap: Record<string, string> | null = null;

/**
 * Watchful OpenAPI Client Generators
 */

export function createWatchfulOpenapiClientGenerators() {
    loadOpenapiConfig();
    return Object.entries(generatorMap).map(([openapiYamlPath, outPath]) => createWatchfulOpenapiClientGenerator(openapiYamlPath, outPath));
}

export function createWatchfulOpenapiClientGenerator(openapiYamlPath: string, outPath: string) {
    const resolvedPath = overridesMap?.[openapiYamlPath] ?? openapiYamlPath;

    if (!existsSync(resolvedPath)) {
        console.log(`OpenAPI YAML file not found: ${resolvedPath}`);
        return null;
    }

    const generate = () => generateOpenapiClient(resolvedPath, outPath);

    const watcher = watch(resolvedPath);
    watcher.on('change', () => {
        // give the writes a moment to settle
        setTimeout(generate, 100);
    });

    generate();

    return {
        generate,
        close: () => watcher.close()
    };
}

/**
 * Generations functions
 */

export async function generateConfiguredOpenapiClients() {
    loadOpenapiConfig();
    for (const [openapiYamlPath, outPath] of Object.entries(generatorMap)) {
        const resolvedPath = overridesMap?.[openapiYamlPath] ?? openapiYamlPath;
        await generateOpenapiClient(resolvedPath, outPath);
    }
}

export async function generateOpenapiClient(openapiYamlPath: string, outPath: string = DEFAULT_OUT_PATH) {
    const yaml = readFileSync(openapiYamlPath, 'utf8');
    const hash = createHash('sha256').update(yaml).digest('hex');

    if (hash === generatedHash) {
        return;
    }

    generatedHash = hash;

    try {
        try {
            await rm(outPath, { recursive: true });
        } catch (e) {
            // ignore
        }

        await OpenAPI.generate({
            input: openapiYamlPath,
            output: outPath,
            clientName: 'ApiClient',
            useOptions: true,
            useUnionTypes: true
        });

        if (overridesInverseMap?.[openapiYamlPath]) {
            copyFileSync(openapiYamlPath, overridesInverseMap[openapiYamlPath]);
        }

        console.log(`[${new Date().toISOString()}] Generated client from ${openapiYamlPath} to ${outPath}/`);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Error generating client from ${openapiYamlPath}:`, err);
    }
}

/**
 * Config Loaders
 */

function loadOpenapiConfig() {
    loadGeneratorMap();
    loadOverridesMap();
}

function loadGeneratorMap() {
    if (!existsSync('./openapi-specs.json')) {
        console.error('openapi-specs.json not found. Cannot generate OpenAPI client.');
        return;
    }

    try {
        const specsContent = readFileSync('./openapi-specs.json', 'utf8');
        generatorMap = JSON.parse(specsContent);
    } catch (e) {
        console.error('Failed to load openapi-specs.json:', e);
    }
}

function loadOverridesMap() {
    if (!existsSync('./openapi-specs.dev.json')) {
        return;
    }

    try {
        const overridesContent = readFileSync('./openapi-specs.dev.json', 'utf8');
        overridesMap = JSON.parse(overridesContent);
        overridesInverseMap = Object.fromEntries(Object.entries(overridesMap!).map(([k, v]) => [v, k]));
    } catch (e) {
        console.error('Failed to load openapi-specs.dev.json:', e);
    }
}
