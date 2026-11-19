import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractBlock, absolutize, extractChrome, render } from './site.mjs';

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

test('extracts the mobile menu, header and footer from the tak.nz markup', () => {
    const chrome = extractChrome(fixture);
    assert.match(chrome.mobileMenu, /id="main-menu-mobile"/);
    assert.match(chrome.header, /class='header'/);
    assert.match(chrome.header, /toggle-main-menu-mobile/);
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

test('render fills the real template and leaves nothing relative', () => {
    const template = fs.readFileSync(path.join(ROOT, 'site', 'index.template.html'), 'utf8');
    const page = render(template, extractChrome(fixture));
    assert.match(page, /id="main-menu-mobile"/);
    assert.match(page, /<footer/);
    assert.doesNotMatch(page, /<!--(MOBILE_MENU|HEADER|FOOTER)-->/);
    assert.match(page, /https:\/\/tak\.nz\/assets\/css\/style\.css/);
});

test('render refuses a template missing a marker, or with a relative link', () => {
    const chrome = extractChrome(fixture);
    assert.throws(() => render('<!--HEADER--><!--FOOTER-->', chrome), /MOBILE_MENU/);
    assert.throws(() => render('<!--MOBILE_MENU--><!--HEADER--><!--FOOTER--><a href="/x">x</a>', chrome), /not absolute/);
});
