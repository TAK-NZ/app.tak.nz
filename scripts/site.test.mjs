import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractBlock, absolutize, extractChrome, render, stripNavigation, storeBadges } from './site.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', 'taknz-home.html'), 'utf8');

test('extractBlock returns a nested element whole', () => {
    const html = '<p>x</p><div class="a"><div>one</div><div><div>two</div></div></div><div>after</div>';
    assert.equal(extractBlock(html, /<div class="a">/, 'div', 'a'), '<div class="a"><div>one</div><div><div>two</div></div></div>');
});

test('extractBlock fails when the block is missing or unclosed', () => {
    assert.throws(() => extractBlock('<p></p>', /<div id="x">/, 'div', 'menu'), /Could not find the menu/);
    assert.throws(() => extractBlock('<div id="x"><div></div>', /<div id="x">/, 'div', 'menu'), /not closed/);
});

test('absolutize points root-relative links, images and css urls at tak.nz', () => {
    const out = absolutize(`<a href="/about/">A</a><img src="/images/x.svg"><i style="--icon: url('/images/i.svg');"></i><a href="https://other.example/">B</a><a href="//cdn.example/x">C</a>`);
    assert.match(out, /href="https:\/\/tak\.nz\/about\/"/);
    assert.match(out, /src="https:\/\/tak\.nz\/images\/x\.svg"/);
    assert.match(out, /url\('https:\/\/tak\.nz\/images\/i\.svg'\)/);
    assert.match(out, /href="https:\/\/other\.example\/"/);
    assert.match(out, /href="\/\/cdn\.example\/x"/);
});

test('extracts the header and footer from the tak.nz markup', () => {
    const chrome = extractChrome(fixture);
    assert.match(chrome.header, /class='header'/);
    assert.match(chrome.footer, /^<footer/);
    assert.match(chrome.footer, /<\/footer>$/);
    for (const part of Object.values(chrome)) {
        assert.doesNotMatch(part, /\b(?:href|src)=["']\/(?!\/)/, 'no root-relative links left');
    }
});

test('the header links back to tak.nz', () => {
    const { header } = extractChrome(fixture);
    assert.match(header, /href="https:\/\/tak\.nz\/"/);
});

test('stripNavigation keeps the logo and removes the menu, buttons and hamburger', () => {
    const { header } = extractChrome(fixture);
    assert.match(header, /main-menu/);
    assert.match(header, /Login/);
    const stripped = stripNavigation(header);
    assert.match(stripped, /class="logo"/);
    assert.match(stripped, /logo\.svg/);
    assert.doesNotMatch(stripped, /main-menu/);
    assert.doesNotMatch(stripped, /toggle-main-menu-mobile|hamburger/);
    assert.doesNotMatch(stripped, /Sign Up|Login|About|Technology/);
    // Still well formed: the header's own wrapper closes
    assert.equal((stripped.match(/<div/g) || []).length, (stripped.match(/<\/div>/g) || []).length);
});

test('a store without a link is shown dimmed and not clickable', () => {
    const html = storeBadges({});
    assert.doesNotMatch(html, /<a /);
    assert.match(html, /store-badge-link--soon/);
    assert.match(html, /App Store \(coming soon\)/);
    assert.match(html, /Google Play \(coming soon\)/);
});

test('a store with a link becomes a link, and only https is accepted', () => {
    const html = storeBadges({ appStore: 'https://apps.apple.com/app/id1', googlePlay: null });
    assert.match(html, /<a class="store-badge-link"[^>]*href="https:\/\/apps\.apple\.com\/app\/id1"/);
    assert.match(html, /rel="noopener"/);
    assert.match(html, /Google Play \(coming soon\)/);
    assert.throws(() => storeBadges({ googlePlay: 'http://play.google.com/x' }), /https/);
    assert.throws(() => storeBadges({ appStore: 'javascript:alert(1)' }), /https/);
});

test('render builds the real template without navigation, and leaves nothing relative', () => {
    const template = fs.readFileSync(path.join(ROOT, 'site', 'index.template.html'), 'utf8');
    const page = render(template, extractChrome(fixture), { storeLinks: {}, hasScreenshots: false });
    assert.match(page, /<footer/);
    assert.doesNotMatch(page, /<!--[A-Z_]+-->/);
    assert.doesNotMatch(page, /main-menu|Sign Up|Login/);
    assert.match(page, /https:\/\/tak\.nz\/assets\/css\/style\.css/);
    assert.match(page, /Download the/);
    assert.match(page, /not in the app stores yet/);
    assert.doesNotMatch(page, /<div class="download-images">/);
});

test('render shows the screenshots when there are some, and drops the note once published', () => {
    const template = fs.readFileSync(path.join(ROOT, 'site', 'index.template.html'), 'utf8');
    const page = render(template, extractChrome(fixture), { storeLinks: { appStore: 'https://apps.apple.com/app/id1' }, hasScreenshots: true });
    assert.match(page, /<div class="download-images">/);
    assert.match(page, /images\/app-screens\.webp/);
    assert.doesNotMatch(page, /not in the app stores yet/);
});

test('render refuses a template missing a marker, or with a relative link', () => {
    const chrome = extractChrome(fixture);
    assert.throws(() => render('<!--HEADER--><!--FOOTER--><!--STORE_BADGES-->', chrome), /SCREENSHOTS/);
    assert.throws(() => render('<!--HEADER--><!--FOOTER--><!--STORE_BADGES--><!--SCREENSHOTS--><a href="/x">x</a>', chrome), /not absolute/);
});
