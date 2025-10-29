import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { globby } from "globby";
import matter from "gray-matter";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const contentDir = path.join(repoRoot, "content");
const staticDir = path.join(repoRoot, "static");
const citationsPath = path.join(staticDir, "citations.json");
const updateLogPath = path.join(staticDir, "update-summary.log");

const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
};

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function normalizeSlug(relativePath) {
  const withoutExt = relativePath.replace(/\.md$/i, "");
  if (withoutExt.endsWith("/index")) {
    return withoutExt.slice(0, -6).toLowerCase();
  }
  return withoutExt.toLowerCase();
}

async function ensureStaticDir() {
  await fs.mkdir(staticDir, { recursive: true });
}

async function readCitations() {
  try {
    const raw = await fs.readFile(citationsPath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.log(colors.yellow(`⚠️ Unable to read citations.json: ${error.message}. Using empty map.`));
    return {};
  }
}

async function getMarkdownFiles() {
  return globby("**/*.md", { cwd: contentDir, absolute: true });
}

function extractTitle(data, filePath) {
  if (data.title && String(data.title).trim()) {
    return String(data.title).trim();
  }
  const base = path.basename(filePath, path.extname(filePath));
  return base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

async function getGitLastModified(filePath) {
  try {
    const { stdout } = await execFileAsync("git", [
      "log",
      "-1",
      "--format=%cs",
      toPosix(path.relative(repoRoot, filePath)),
    ], { cwd: repoRoot });
    const line = stdout.trim().split(/\r?\n/).find(Boolean);
    if (line) {
      return line.trim();
    }
  } catch (error) {
    console.log(colors.yellow(`⚠️ Git history unavailable for ${filePath}: ${error.message}`));
  }
  return new Date().toISOString().slice(0, 10);
}

function buildFooter({ title, year, slug, relatedLinks }) {
  const relatedContent = relatedLinks.length
    ? relatedLinks.map((item) => `- [${item.title}](${item.url})`).join("\n")
    : "- Explore more research soon.";

  return [
    "---",
    "### References and Licensing",
    "",
    "This article is part of the **[Yaogará Ark Research Archive](https://ark.yaogara.org)** —",
    "an open ethnobotanical repository documenting sacred plants and Indigenous ecological knowledge of the Amazon.",
    "",
    "**Publisher:** [Yaogará Research Initiative](https://yaogara.com) — Fundación Camino al Sol",
    "**License:** [Creative Commons Attribution–ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/)",
    `**Citation:** Yaogará Research Initiative (${year}). *${title}*. Yaogará Ark Research Archive. https://ark.yaogara.org/${slug}`,
    "",
    "#### Related Reading",
    relatedContent,
    "",
    "---",
  ].join("\n");
}

function hasExistingFooter(content) {
  return /References and Licensing|Related Reading/i.test(content);
}

function shouldSkipFooter(slug, relative) {
  // Skip homepage, about page, and other non-article pages
  const skipPatterns = [
    'index',           // Homepage
    'about',           // About page
    'policy/',         // Policy pages
    'summaries/',      // Summary pages
    'traditions/',     // Tradition pages
  ];
  
  return skipPatterns.some(pattern => 
    slug === pattern || 
    slug.startsWith(pattern) || 
    relative.includes(pattern)
  );
}

function isInternalUrl(url) {
  if (!url) return false;
  try {
    if (url.startsWith("/")) {
      return true;
    }
    const parsed = new URL(url);
    return parsed.hostname.endsWith("ark.yaogara.org");
  } catch (error) {
    return false;
  }
}

function normalizePathFromUrl(url) {
  if (!url) return null;
  if (url.startsWith("/")) {
    return url.replace(/^\/+/, "").replace(/\/$/, "");
  }
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname || "";
    return pathname.replace(/^\/+/, "").replace(/\/$/, "");
  } catch (error) {
    return null;
  }
}

function buildFileIndex(filesMeta) {
  const index = new Map();
  for (const meta of filesMeta) {
    index.set(meta.slug, meta);
  }
  return index;
}

function selectRelatedLinks(meta, citations, fileIndex) {
  const related = [];
  const seen = new Set();
  const entries = citations.get(meta.slugBaseLower) || [];

  for (const entry of entries) {
    if (!isInternalUrl(entry.url)) continue;
    const normalized = normalizePathFromUrl(entry.url);
    if (!normalized) continue;
    const slug = normalized.toLowerCase();
    if (slug === meta.slug || seen.has(slug)) continue;
    const target = fileIndex.get(slug);
    if (!target || target.category !== meta.category) continue;
    related.push({
      title: target.title,
      url: `/${target.slug}`,
    });
    seen.add(slug);
    if (related.length >= 5) {
      break;
    }
  }

  if (related.length >= 3) {
    return related.slice(0, 5);
  }

  for (const candidate of fileIndex.values()) {
    if (candidate.slug === meta.slug) continue;
    if (candidate.category !== meta.category) continue;
    if (seen.has(candidate.slug)) continue;
    related.push({
      title: candidate.title,
      url: `/${candidate.slug}`,
    });
    seen.add(candidate.slug);
    if (related.length >= 5) {
      break;
    }
  }

  return related.slice(0, 5);
}

async function appendUpdateLog(entries) {
  if (entries.length === 0) return;
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const lines = entries.map((entry) => `[${timestamp}] ${entry}`).join("\n");
  await fs.appendFile(updateLogPath, `${lines}\n`, "utf8");
}

async function main() {
  await ensureStaticDir();
  const citations = await readCitations();
  const citationMap = new Map(
    Object.entries(citations).map(([key, value]) => [key.toLowerCase(), value])
  );
  await fs.appendFile(updateLogPath, "", "utf8");
  const files = await getMarkdownFiles();
  files.sort();

  const filesMeta = [];

  for (const absolute of files) {
    const relative = toPosix(path.relative(contentDir, absolute));
    const slug = normalizeSlug(relative);
    const category = slug.includes("/") ? slug.split("/")[0] : slug;
    const raw = await fs.readFile(absolute, "utf8");
    const parsed = matter(raw);
    const title = extractTitle(parsed.data, absolute);
    filesMeta.push({
      file: absolute,
      relative,
      slug,
      category,
      title,
      parsed,
      raw,
      slugBaseLower: path.basename(relative, path.extname(relative)).toLowerCase(),
    });
  }

  const fileIndex = buildFileIndex(filesMeta);
  const updateLogEntries = [];
  let updatedCount = 0;
  let skippedFooters = 0;
  const year = new Date().getFullYear();

  for (const meta of filesMeta) {
    const { file, parsed, slug, relative } = meta;
    let content = parsed.content;
    let footerAdded = false;

    // Skip adding footers to certain pages
    if (shouldSkipFooter(slug, relative)) {
      console.log(colors.yellow(`⚠️ Skipping footer for ${relative} (non-article page)`));
      skippedFooters += 1;
    } else if (!hasExistingFooter(content)) {
      const relatedLinks = selectRelatedLinks(meta, citationMap, fileIndex);
      const footer = buildFooter({
        title: meta.title,
        year,
        slug: meta.slug,
        relatedLinks,
      });
      content = content.replace(/\s*$/, "");
      content = content ? `${content}\n\n${footer}\n` : `\n${footer}\n`;
      footerAdded = true;
    } else {
      skippedFooters += 1;
    }

    const lastmod = await getGitLastModified(file);
    const newData = { ...parsed.data, lastmod };

    const newFile = matter.stringify(content.endsWith("\n") ? content : `${content}\n`, newData, {
      lineWidth: 1000,
    });

    if (newFile !== meta.raw) {
      await fs.writeFile(file, newFile, "utf8");
      updatedCount += 1;
      const relativePath = toPosix(path.relative(repoRoot, file));
      const action = footerAdded ? "Footer/metadata updated" : "Metadata updated";
      updateLogEntries.push(`${action}: ${relativePath} (lastmod: ${lastmod})`);
      console.log(colors.green(`✓ Updated ${relativePath}`));
    } else if (footerAdded) {
      console.log(colors.yellow(`⚠️ Footer unchanged for ${file}`));
    }
  }

  await appendUpdateLog(updateLogEntries);

  console.log(colors.cyan(`Processed ${filesMeta.length} markdown files.`));
  console.log(colors.green(`Footers or metadata updated: ${updatedCount}`));
  console.log(colors.yellow(`Skipped (footer present): ${skippedFooters}`));
}

main().catch((error) => {
  console.error(colors.red(`Error adding Ark footers: ${error.stack || error.message}`));
  process.exitCode = 1;
});

