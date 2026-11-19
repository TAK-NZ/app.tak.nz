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
        header: extractBlock(html, /<div[^>]*\bclass=["']header["'][^>]*>/i, 'div', 'header'),
        footer: extractBlock(html, /<footer[^>]*>/i, 'footer', 'footer'),
    };

    for (const key of Object.keys(chrome)) chrome[key] = absolutize(chrome[key]);
    return chrome;
}

/**
 * The mobile app page is a download page, not a way around the website, so the
 * header keeps only the logo. The site menu, the Sign Up / Login buttons and the
 * hamburger that opens the mobile menu are removed.
 */
export function stripNavigation(header) {
    let out = header;
    const remove = [
        [/<div[^>]*\bid=["']main-menu["'][^>]*>/i, 'div', 'site menu'],
        [/<button[^>]*\bid=["']toggle-main-menu-mobile["'][^>]*>/i, 'button', 'menu button'],
    ];
    for (const [pattern, tag, name] of remove) {
        out = out.replace(extractBlock(out, pattern, tag, name), '');
    }
    return out;
}

const APP_STORE_ALT = 'Download on the App Store';
const GOOGLE_PLAY_ALT = 'Get it on Google Play';

/**
 * Store badges. A store that has no link yet shows its badge dimmed and unclickable,
 * so the page is honest about the app not being published rather than linking nowhere.
 */
export function storeBadges(links = {}) {
    const badge = (href, src, alt, name) => {
        const img = `<img class="store-badge" alt="${alt}" src="${src}">`;
        if (href) {
            if (!/^https:\/\//.test(href)) throw new Error(`The ${name} link must be an https URL`);
            return `<a class="store-badge-link" target="_blank" rel="noopener" href="${href.replace(/"/g, '&quot;')}">${img}</a>`;
        }
        return `<span class="store-badge-link store-badge-link--soon" role="img" aria-label="${alt} (coming soon)">${img}</span>`;
    };

    return [
        badge(links.appStore, 'images/badges/app-store.svg', APP_STORE_ALT, 'App Store'),
        badge(links.googlePlay, 'images/badges/google-play.png', GOOGLE_PLAY_ALT, 'Google Play'),
    ].join('\n        ');
}

export function screenshots(present) {
    if (!present) return '';
    return `<div class="download-images">
      <img class="download-phones" alt="The TAK.NZ app on two phone screens" src="images/app-screens.png">
    </div>`;
}

/** Fill the page template with the tak.nz header and footer, the store badges and the screenshots */
export function render(template, chrome, options = {}) {
    for (const marker of ['<!--HEADER-->', '<!--FOOTER-->', '<!--STORE_BADGES-->', '<!--SCREENSHOTS-->']) {
        if (!template.includes(marker)) throw new Error(`Template is missing ${marker}`);
    }

    const links = options.storeLinks || {};
    const published = Boolean(links.appStore || links.googlePlay);

    const page = template
        .replace('<!--HEADER-->', () => stripNavigation(chrome.header))
        .replace('<!--FOOTER-->', () => chrome.footer)
        .replace('<!--STORE_BADGES-->', () => storeBadges(links))
        .replace('<!--SCREENSHOTS-->', () => screenshots(options.hasScreenshots))
        .replace('<!--COMING_SOON-->', () => published ? '' : '<p class="download-note">The app is not in the app stores yet. Download links will appear here.</p>');

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
