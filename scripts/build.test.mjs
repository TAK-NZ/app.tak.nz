import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, generate, MAX_LOGO_BYTES } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('data')]);
const files = { 'logos/a.png': PNG, 'logos/big.png': Buffer.concat([PNG, Buffer.alloc(MAX_LOGO_BYTES)]), 'logos/not.png': Buffer.from('GIF89a') };
const read = (p) => {
    if (!(p in files)) throw new Error('missing');
    return files[p];
};
const ok = { name: 'A', url: 'map.example.nz', logo: 'logos/a.png' };

test('the real servers.json is valid', () => {
    const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'servers.json'), 'utf8'));
    assert.deepEqual(validate(source), []);
});

test('accepts a valid entry, with or without a logo', () => {
    assert.deepEqual(validate({ servers: [ok, { name: 'B', url: 'map.b.example.nz' }] }, read), []);
});

test('rejects an empty or missing list', () => {
    assert.equal(validate({}, read).length, 1);
    assert.equal(validate({ servers: [] }, read).length, 1);
});

test('requires a name and a url', () => {
    const errors = validate({ servers: [{}] }, read);
    assert.equal(errors.length, 2);
});

test('rejects a url with a scheme, a path, uppercase or no dot', () => {
    for (const url of ['https://map.example.nz', 'map.example.nz/api', 'Map.Example.nz', 'localhost', 'http://map.example.nz']) {
        assert.equal(validate({ servers: [{ ...ok, url }] }, read).length, 1, url);
    }
});

test('rejects duplicate names and urls', () => {
    assert.equal(validate({ servers: [ok, { ...ok, name: 'a' }] }, read).length, 2);
});

test('rejects missing, oversized, non-png and out-of-folder logos', () => {
    assert.equal(validate({ servers: [{ ...ok, logo: 'logos/missing.png' }] }, read).length, 1);
    assert.equal(validate({ servers: [{ ...ok, logo: 'logos/big.png' }] }, read).length, 1);
    assert.equal(validate({ servers: [{ ...ok, logo: 'logos/not.png' }] }, read).length, 1);
    assert.equal(validate({ servers: [{ ...ok, logo: '../secret.png' }] }, read).length, 1);
    assert.equal(validate({ servers: [{ ...ok, logo: 'logos/a.gif' }] }, read).length, 1);
});

test('generates the document the app reads', () => {
    const doc = generate({ servers: [ok, { name: 'B', url: 'map.b.example.nz' }] }, read, new Date('2026-01-01T00:00:00Z'));
    assert.equal(doc.version, 1);
    assert.equal(doc.generatedAt, '2026-01-01T00:00:00.000Z');
    assert.deepEqual(doc.servers[0], {
        name: 'A',
        url: 'map.example.nz',
        logo: { filename: 'a.png', mediaType: 'image/png', base64: PNG.toString('base64') },
    });
    assert.deepEqual(doc.servers[1], { name: 'B', url: 'map.b.example.nz' });
});
