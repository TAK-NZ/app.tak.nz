/**
 * The human-facing page must look like part of https://tak.nz, so its header,
 * mobile menu and footer are not written here. They are taken from the live
 * tak.nz home page at build time, and the stylesheet, scripts, logos and icons
 * are loaded from tak.nz itself. When the website changes its navigation or
 * design, the next build of this site picks that up.
 *
 * If tak.nz changes shape so a block can no longer be found, the build fails and
 * the previously deployed page stays online. It never publishes a broken page.
 */

export const SITE_ORIGIN = 'https://tak.nz';

/**
 * Return the element that starts at the first match of `startPattern`, through
 * its matching close tag. Nested elements of the same tag are counted, so a
 * `<div>` full of `<div>`s is returned whole.
 */
export function extractBlock(html, startPattern, tag, name) {
    const start = startPattern.exec(html);
    if (!start) throw new Error(`Could not find the ${name} in the tak.nz page`);

    const open = new RegExp(`<${tag}[\\s>]`, 'gi');
    const close = new RegExp(`</${tag}\\s*>`, 'gi');
    let depth = 0;
    let pos = start.index;

    while (pos < html.length) {
        open.lastIndex = pos;
        close.lastIndex = pos;
        const nextOpen = open.exec(html);
        const nextClose = close.exec(html);
        if (!nextClose) break;

        if (nextOpen && nextOpen.index < nextClose.index) {
            depth++;
            pos = nextOpen.index + 1;
        } else {
            depth--;
            pos = nextClose.index + nextClose[0].length;
            if (depth === 0) return html.slice(start.index, pos);
        }
    }

    throw new Error(`The ${name} in the tak.nz page is not closed`);
}

/** Make root-relative links and images point at tak.nz, as this page is on another host */
export function absolutize(html, origin = SITE_ORIGIN) {
    return html
        .replace(/\b(href|src|poster)=(["'])\/(?!\/)/g, `$1=$2${origin}/`)
        .replace(/url\((["']?)\/(?!\/)/g, `url($1${origin}/`);
}

/** Pull the shared page furniture out of the tak.nz home page */
export function extractChrome(html) {
    const chrome = {
        mobileMenu: extractBlock(html, /<div[^>]*\bid=["']main-menu-mobile["'][^>]*>/i, 'div', 'mobile menu'),
        header: extractBlock(html, /<div[^>]*\bclass=["']header["'][^>]*>/i, 'div', 'header'),
        footer: extractBlock(html, /<footer[^>]*>/i, 'footer', 'footer'),
    };

    for (const key of Object.keys(chrome)) chrome[key] = absolutize(chrome[key]);
    return chrome;
}

/** Fill the page template with the tak.nz header, mobile menu and footer */
export function render(template, chrome) {
    for (const marker of ['<!--MOBILE_MENU-->', '<!--HEADER-->', '<!--FOOTER-->']) {
        if (!template.includes(marker)) throw new Error(`Template is missing ${marker}`);
    }

    const page = template
        .replace('<!--MOBILE_MENU-->', () => chrome.mobileMenu)
        .replace('<!--HEADER-->', () => chrome.header)
        .replace('<!--FOOTER-->', () => chrome.footer);

    // Anything still pointing at "/" would resolve on this host and 404
    const stray = page.match(/\b(?:href|src)=["']\/(?!\/)[^"']*/g);
    if (stray) throw new Error(`The page still has links that are not absolute: ${stray.slice(0, 3).join(', ')}`);

    return page;
}

export async function fetchSitePage(url = `${SITE_ORIGIN}/`) {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Fetching ${url} failed with status ${response.status}`);
    return await response.text();
}
