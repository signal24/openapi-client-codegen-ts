#!/usr/bin/env node

import { existsSync } from 'fs';

import {
    createWatchfulOpenapiClientGenerator,
    createWatchfulOpenapiClientGenerators,
    generateConfiguredOpenapiClients,
    generateOpenapiClient
} from './generator.js';

async function run() {
    if (process.argv[2] === '--help') {
        throw new Error('Usage: generate-openapi-client [-w] [<openapi-yaml-path> [<openapi-output-path>]]');
    }

    if (process.argv[2] === '-w') {
        const [yamlPath, outPath] = process.argv.slice(3);

        if (yamlPath) {
            verifyFileExists(yamlPath);
            await createWatchfulOpenapiClientGenerator(yamlPath, outPath);
            process.exit(0);
        }

        createWatchfulOpenapiClientGenerators();
        return;
    }

    const [yamlPath, outPath] = process.argv.slice(2);

    if (yamlPath) {
        verifyFileExists(yamlPath);
        await generateOpenapiClient(yamlPath, outPath);
    } else {
        await generateConfiguredOpenapiClients();
    }

    process.exit(0);
}

function verifyFileExists(path: string) {
    if (!existsSync(path)) {
        throw new Error(`OpenAPI YAML file not found: ${path}`);
    }
}

run();
