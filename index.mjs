#!/usr/bin/env node

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve, relative, join, dirname } from 'node:path';
import fs from 'node:fs';
import { parse } from 'yaml';
import process from 'node:process';

import mapWorkspaces from '@npmcli/map-workspaces';
import rpj from 'read-package-json-fast';
import shebangRegex from 'shebang-regex';
import sade from 'sade';

const program = sade('wrkspc');

program.describe('Pack & restore yarn / npm workspaces').version('0.0.0');

program
    .command('pack', 'Create workspace lockfile', { default: true })
    .option('-d, --dir <path>', 'Path to the directory, containing npm/yarn workspace', process.cwd())
    .option('--no-binaries', 'Disable binary file packaging')
    .action(async (options) => {
        await pack(options.dir, !options['no-binaries']);
    });

program.command('unpack', 'Restore workspace from lockfile').option('--force', 'Overwrite existing binaries').action(async (options) => {
    await unpack(options.force);
});

const unpack = async (isForced) => {
    const workspaceLockSource = await readFile(resolve(process.cwd(), 'workspace-lock.json'));
    const workspaceLock = JSON.parse(workspaceLockSource.toString());

    await Promise.all(
        Object.values(workspaceLock.packages).map(async (value) => {
            const path = join(process.cwd(), value.path, 'package.json');

            console.log(`Unpacking ${value.package.name} into "${path}"`);
            const parentDir = dirname(path);

            try {
                await access(parentDir);
            } catch {
                await mkdir(parentDir, { recursive: true });
            }

            await writeFile(path, JSON.stringify(value.package, null, 4));
            console.log(`Unpacking ${value.package.name} completed`);
        }),
    );

    if (typeof workspaceLock.binaries === 'object') {
        console.log('Unpacking binaries');
        await Promise.all(
            Object.entries(workspaceLock.binaries).map(async ([path, shebang]) => {
                const fullPath = join(process.cwd(), path);
                
                if(!isForced){
                    try {
                        await access(fullPath);

                        console.log(`Unpacking ${fullPath} binary skipped, already exists. Run with --force flag to overwrite existing binaries.`);

                        return;
                    } catch {
                        // Do nothing - binary does not exist.
                    }
                }
                
                console.log(`Unpacking ${fullPath} binary, with shebang ${shebang}`);

                const parentDir = dirname(fullPath);
                try {
                    await access(parentDir);
                } catch {
                    await mkdir(parentDir, { recursive: true });
                }

                await writeFile(fullPath, shebang ?? '');
                console.log(`Unpacking of ${fullPath} completed`);
            }),
        );
    }
};

const normalizePath = (path) => path.replace(/\\/g, '/');

const getWorkspaces = async (workingDirectory, packageJson) => {
    let workspaces = packageJson.workspaces;

    if (!workspaces) {
        const pnpmWorkspacesPath = resolve(workingDirectory, 'pnpm-workspace.yaml');

        if (fs.existsSync(pnpmWorkspacesPath)) {
            const file = await fs.promises.readFile(pnpmWorkspacesPath);
            const pnpmWorkspacesConfig = parse(file.toString());

            workspaces = pnpmWorkspacesConfig.packages;
        }
    }

    if (!workspaces) {
        throw new Error("No workspaces config found.");
    }

    return workspaces;
}

const pack = async (workingDirectory, shouldParseBinaries) => {
    const packageJson = await rpj(resolve(workingDirectory, 'package.json'));

    const definedWorkspaces = await getWorkspaces(workingDirectory, packageJson);

    const workspaces = await mapWorkspaces({
        cwd: workingDirectory,
        pkg: {
            workspaces: definedWorkspaces,
        },
    });

    const workspaceQueue = [...workspaces.entries()];

    const lockedPackageEntries = await Promise.all(
        workspaceQueue.map(async ([key, value]) => [
            key,
            {
                path: normalizePath(relative(workingDirectory, value)),
                package: await rpj(resolve(value, 'package.json')),
            },
        ]),
    );

    lockedPackageEntries.unshift(['', { path: '.', package: packageJson }]);

    const lockedPackages = Object.fromEntries(lockedPackageEntries);

    const workspaceLock = { packages: lockedPackages };

    if (shouldParseBinaries) {
        const binaryPaths = lockedPackageEntries
            .map(([_, value]) => {
                const { bin } = value.package;

                if (typeof bin !== 'object' || bin === null) {
                    return undefined;
                }

                return Object.values(bin).map((binPath) => normalizePath(join(value.path, binPath)));
            })
            .filter((value) => value !== undefined)
            .flat();

        const shebangs = await Promise.all(
            binaryPaths.map(async (binaryPath) => {
                const binaryContent = await readFile(binaryPath);

                if (!shebangRegex.test(binaryContent)) {
                    return [binaryPath, null];
                }

                return [binaryPath, shebangRegex.exec(binaryContent)[0]];
            }),
        );

        workspaceLock.binaries = Object.fromEntries(shebangs);
    }

    await writeFile(join(workingDirectory, 'workspace-lock.json'), JSON.stringify(workspaceLock, null, 4));
};

program.parse(process.argv, {
    unknown: (arg) => `Unknown argument ${arg}`,
});
