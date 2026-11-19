#!/usr/bin/env node
/**
 * Build the site into dist/:
 *
 *   dist/v1/servers.json   the server list the TAK.NZ mobile app reads
 *   dist/index.html        the landing page, with the tak.nz header and footer
 *   dist/...               everything else under site/ (favicon)
 *
 * servers.json in the repo root is the file people edit. It references each logo
 * by path; this script validates the entries and inlines the logos as base64,
 * which is the format the app expects.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractChrome, fetchSitePage, render } from './site.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Largest logo we will inline. The app downloads this file on first run, over mobile data */
export const MAX_LOGO_BYTES = 64 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Check the editable server list and return every problem found
 * (an empty array means it is valid)
 */
export function validate(source, readFile = (p) => fs.readFileSync(path.join(ROOT, p))) {
    const errors = [];

    if (!source || !Array.isArray(source.servers) || source.servers.length === 0) {
        return ['"servers" must be a non-empty array'];
    }

    const seenNames = new Set();
    const seenHosts = new Set();

    source.servers.forEach((server, i) => {
        const where = `servers[${i}]${server && server.name ? ` (${server.name})` : ''}`;

        if (!server || typeof server !== 'object') {
            errors.push(`${where}: must be an object`);
            return;
        }

        if (typeof server.name !== 'string' || !server.name.trim()) {
            errors.push(`${where}: "name" is required`);
        } else if (seenNames.has(server.name.toLowerCase())) {
            errors.push(`${where}: duplicate name`);
        } else {
            seenNames.add(server.name.toLowerCase());
        }

        if (typeof server.url !== 'string' || !server.url.trim()) {
            errors.push(`${where}: "url" is required`);
        } else {
            // A host name only, with no scheme or path. The app adds https://
            // itself, and a server must never be reachable over plain http
            if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?$/.test(server.url)) {
                errors.push(`${where}: "url" must be a lowercase host name such as map.example.nz, with no scheme or path`);
            } else if (seenHosts.has(server.url)) {
                errors.push(`${where}: duplicate url`);
            } else {
                seenHosts.add(server.url);
            }
        }

        if (server.logo !== undefined) {
            if (typeof server.logo !== 'string' || !/^logos\/[A-Za-z0-9._-]+\.png$/.test(server.logo)) {
                errors.push(`${where}: "logo" must be a PNG under logos/, for example logos/taknz.png`);
            } else {
                let data;
                try {
                    data = readFile(server.logo);
                } catch {
                    errors.push(`${where}: logo file ${server.logo} does not exist`);
                }
                if (data) {
                    if (data.length > MAX_LOGO_BYTES) {
                        errors.push(`${where}: logo ${server.logo} is ${data.length} bytes, the limit is ${MAX_LOGO_BYTES}`);
                    }
                    if (!data.subarray(0, 8).equals(PNG_SIGNATURE)) {
                        errors.push(`${where}: logo ${server.logo} is not a PNG file`);
                    }
                }
            }
        }
    });

    return errors;
}

/** Turn the editable list into the document the app downloads */
export function generate(source, readFile = (p) => fs.readFileSync(path.join(ROOT, p)), now = new Date()) {
    return {
        version: 1,
        generatedAt: now.toISOString(),
        servers: source.servers.map((server) => ({
            name: server.name,
            url: server.url,
            ...(server.logo ? {
                logo: {
                    filename: path.basename(server.logo),
                    mediaType: 'image/png',
                    base64: readFile(server.logo).toString('base64'),
                },
            } : {}),
        })),
    };
}

async function main() {
    const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'servers.json'), 'utf8'));
    const errors = validate(source);
    if (errors.length) {
        console.error('servers.json is not valid:');
        for (const error of errors) console.error(`  - ${error}`);
        process.exit(1);
    }

    // The landing page borrows tak.nz's header, menu and footer. TAKNZ_PAGE
    // points at a saved copy of the tak.nz home page, for building offline
    const taknz = process.env.TAKNZ_PAGE
        ? fs.readFileSync(path.resolve(process.env.TAKNZ_PAGE), 'utf8')
        : await fetchSitePage();
    const storeLinks = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.json'), 'utf8'));
    const page = render(
        fs.readFileSync(path.join(ROOT, 'site', 'index.template.html'), 'utf8'),
        extractChrome(taknz),
        { storeLinks, hasScreenshots: fs.existsSync(path.join(ROOT, 'site', 'images', 'app-screens.webp')) },
    );

    const dist = path.join(ROOT, 'dist');
    fs.rmSync(dist, { recursive: true, force: true });
    fs.cpSync(path.join(ROOT, 'site'), dist, {
        recursive: true,
        filter: (src) => !src.endsWith('index.template.html'),
    });
    fs.writeFileSync(path.join(dist, 'index.html'), page);
    fs.mkdirSync(path.join(dist, 'v1'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'v1', 'servers.json'), `${JSON.stringify(generate(source), null, 2)}\n`);
    // Pages ignores this when deploying from a workflow, but it documents the host
    fs.copyFileSync(path.join(ROOT, 'CNAME'), path.join(dist, 'CNAME'));

    console.log(`Built ${source.servers.length} server(s) and the landing page into dist/`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((err) => {
        console.error(`Build failed: ${err.message}`);
        process.exit(1);
    });
}
