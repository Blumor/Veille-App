// Enrichissement déterministe des descriptions : certains flux ne fournissent
// qu'une phrase. On va chercher davantage de texte sur la page source de l'article
// (méta-description publiée + premiers paragraphes), de façon tolérante.
const UA = { "User-Agent": "VeilleApp/1.0" };
const MIN_DETAIL = 350; // en-deçà, on tente d'enrichir
const CONCURRENCY = 6;
const TIMEOUT = 9_000;

function decodeEntities(s = "") {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&hellip;/g, "…")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
const stripHTML = (h = "") =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Anti-SSRF : n'autorise que http(s) vers un hôte public (bloque localhost / IP internes).
function isPublicHttpUrl(u) {
  let url;
  try {
    url = new URL(u);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(url.protocol)) return false;
  const h = url.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h === "::1"
  )
    return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (/^(fe80:|fc|fd)/.test(h)) return false;
  return true;
}

function metaContent(html, key) {
  const re1 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`,
    "i",
  );
  return decodeEntities(
    (html.match(re1) || html.match(re2) || [])[1] || "",
  ).trim();
}

function truncateAtSentence(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const dot = cut.lastIndexOf(". ");
  return dot > max * 0.5 ? cut.slice(0, dot + 1) : cut.trim() + "…";
}

// Image d'illustration : og:image (ou twitter:image), résolue en URL absolue.
// HTTPS uniquement (le site est publié en https → évite le blocage « mixed content »),
// hors SVG (souvent des logos/pictogrammes, pas des visuels d'article).
function extractImage(html, pageUrl) {
  const raw =
    metaContent(html, "og:image") ||
    metaContent(html, "og:image:url") ||
    metaContent(html, "twitter:image") ||
    metaContent(html, "twitter:image:src");
  if (!raw) return null;
  let abs;
  try {
    abs = new URL(raw, pageUrl).href;
  } catch {
    return null;
  }
  if (!/^https:\/\//i.test(abs)) return null;
  if (/\.svg(\?|#|$)/i.test(abs)) return null;
  return abs;
}

// Texte enrichi : og:description + premiers paragraphes significatifs.
function extractText(html) {
  const desc =
    metaContent(html, "og:description") || metaContent(html, "description");

  const NOISE = /cookie|consent|s'abonner|newsletter|copyright|tous droits|©/i;
  const CODE =
    /[{}]|=>|\$\w|function\s*\(|addEventListener|this\.\w|window\.\w|document\.\w/;
  const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripHTML(decodeEntities(m[1])))
    .filter((p) => p.length > 60 && !NOISE.test(p) && !CODE.test(p))
    .slice(0, 6);

  let rich = desc;
  const bodyTxt = paras.join("\n\n");
  if (bodyTxt && (!rich || !bodyTxt.startsWith(rich.slice(0, 40)))) {
    rich = rich ? `${rich}\n\n${bodyTxt}` : bodyTxt;
  }
  rich = rich.trim();
  return rich.length > 80 ? rich : null;
}

// Récupère la page une seule fois et en extrait texte + image d'illustration.
async function fetchPage(url) {
  const res = await fetch(url, {
    headers: UA,
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) return null;
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("html")) return null;
  const html = await res.text();
  return { text: extractText(html), image: extractImage(html, res.url || url) };
}

// Petit pool de concurrence borné.
async function pool(items, size, worker) {
  let i = 0;
  const runners = Array.from(
    { length: Math.min(size, items.length) },
    async () => {
      while (i < items.length) {
        const idx = i++;
        await worker(items[idx]);
      }
    },
  );
  await Promise.all(runners);
}

/**
 * Enrichit en place les items affichés à partir de leur page source :
 *  - `image` : visuel d'illustration (og:image) pour toutes les cartes (rendu façon presse) ;
 *  - `body` (preview) + `detail` : complétés uniquement si la description est trop maigre.
 * Tolérant : en cas d'échec (blocage, page JS, timeout), l'item est laissé tel quel.
 * @param {object[]} items  items déjà rédigés (avec `lead`, `detail`, `sources`)
 */
export async function enrichDetails(items) {
  const targets = (items || []).filter(
    (it) =>
      it &&
      it.section !== "synthese" &&
      isPublicHttpUrl(it.sources?.[0]?.url || ""),
  );
  if (!targets.length) return items;

  await pool(targets, CONCURRENCY, async (it) => {
    try {
      const page = await fetchPage(it.sources[0].url);
      if (!page) return;

      // Image : récupérée pour toutes les cartes (le front gère l'absence).
      if (page.image && !it.image) it.image = page.image;

      // Texte : seulement si le detail existant est trop court.
      const rich = page.text;
      if (
        rich &&
        (it.detail || "").length < MIN_DETAIL &&
        rich.length > (it.detail || "").length
      ) {
        const lead = it.lead ? it.lead.trim() : "";
        it.detail = (lead ? `${lead}\n\n${rich}` : rich).slice(0, 1800);
        it.body = lead
          ? `${lead}\n\n${truncateAtSentence(rich, 460)}`
          : truncateAtSentence(rich, 460);
      }
    } catch {
      /* page inaccessible → on garde l'original */
    }
  });
  return items;
}
