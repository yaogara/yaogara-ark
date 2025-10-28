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

const LICENSE_TEXT = "CC BY-SA 4.0 – Yaogará Research Archive";

const slugMap = new Map();
const nameLookup = new Map();
const markdownLinkRegex = /(!)?\[(.*?)\]\((.*?)\)/g;
const wikiLinkRegex = /(!)?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function toTitleCase(filename) {
  return filename
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function slugifyName(value) {
  if (!value) {
    return "";
  }
  return value
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/\s-]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-/g, "")
    .replace(/-$/g, "");
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

async function getGitCreationDate(filePath) {
  try {
    const { stdout } = await execFileAsync("git", [
      "log",
      "--diff-filter=A",
      "--follow",
      "--format=%aI",
      "-1",
      toPosix(path.relative(repoRoot, filePath)),
    ], { cwd: repoRoot });
    const line = stdout.trim().split(/\r?\n/).find(Boolean);
    if (line) {
      return normalizeDate(line.trim());
    }
  } catch (error) {
    console.warn(`Warning: unable to read git history for ${filePath}:`, error.message);
  }
  return normalizeDate(new Date());
}

function buildSlug(filePath) {
  const relative = toPosix(path.relative(contentDir, filePath));
  let slug = relative.replace(/\.md$/i, "");
  if (slug.endsWith("/index")) {
    slug = slug.slice(0, -6);
  } else if (slug === "index") {
    slug = "index";
  }
  const normalized = slug.toLowerCase();
  return normalized;
}

function resolveLinkTarget(rawTarget, currentDir) {
  if (!rawTarget) {
    return { type: "external" };
  }
  const target = rawTarget.trim();
  if (!target) {
    return { type: "external" };
  }
  if (/^(?:[a-z]+:|#)/i.test(target)) {
    return { type: "external" };
  }
  let clean = target;
  const hashIndex = clean.indexOf("#");
  if (hashIndex !== -1) {
    clean = clean.slice(0, hashIndex);
  }
  const queryIndex = clean.indexOf("?");
  if (queryIndex !== -1) {
    clean = clean.slice(0, queryIndex);
  }
  if (!clean) {
    return { type: "external" };
  }
  const extension = path.posix.extname(clean);
  if (extension && extension.toLowerCase() !== ".md") {
    return { type: "external" };
  }
  let joined;
  if (clean.startsWith("/")) {
    joined = clean.slice(1);
  } else if (clean.startsWith("./") || clean.startsWith("../")) {
    const base = currentDir ? currentDir : "";
    joined = path.posix.join(base, clean);
  } else {
    joined = clean;
  }
  joined = path.posix.normalize(joined);
  if (joined.startsWith("../")) {
    joined = joined.replace(/^\.\.\/+/, "");
  }
  if (joined.endsWith(".md")) {
    joined = joined.slice(0, -3);
  }
  if (joined.endsWith("/index")) {
    joined = joined.slice(0, -6);
  }
  if (joined === "index.md") {
    joined = "index";
  }
  joined = joined.replace(/\/index$/i, "");
  joined = joined.replace(/\/$/, "");
  if (joined === "" || joined === ".") {
    joined = "index";
  }
  const lower = joined.toLowerCase();
  if (slugMap.has(lower)) {
    return { type: "valid", slug: slugMap.get(lower).slug, target: lower };
  }
  const nameKey = slugifyName(joined);
  if (nameLookup.has(nameKey)) {
    return { type: "valid", slug: nameLookup.get(nameKey), target: nameKey };
  }
  return { type: "missing", slug: nameKey || lower, original: rawTarget };
}

async function ensureDirectories() {
  await fs.mkdir(staticDir, { recursive: true });
}

async function loadFiles() {
  const files = await globby("**/*.md", { cwd: contentDir, absolute: true });
  files.sort();
  for (const file of files) {
    const canonicalSlug = toPosix(path.relative(contentDir, file)).replace(/\.md$/i, "");
    const normalizedSlug = buildSlug(file);
    slugMap.set(normalizedSlug, {
      slug: canonicalSlug.toLowerCase(),
      path: file,
    });
    addName(canonicalSlug, canonicalSlug.toLowerCase());
    const lastSegment = canonicalSlug.split("/").pop();
    if (lastSegment) {
      addName(lastSegment, canonicalSlug.toLowerCase());
    }
  }
  return files;
}

function addName(name, slug) {
  const key = slugifyName(name);
  if (key && !nameLookup.has(key)) {
    nameLookup.set(key, slug);
  }
}

function formatMissingLog(slug, raw) {
  const timestamp = new Date()
    .toISOString()
    .replace("T", " ")
    .slice(0, 16);
  return `[${timestamp}] Broken link: [[${raw}]] → Not found (expected slug: ${slug})`;
}

function toDisplaySlug(slug) {
  return slug;
}

function replaceLinks(text, currentDir, counters, missingSet, missingLinks) {
  let updated = text;
  updated = updated.replace(markdownLinkRegex, (match, bang, label, target) => {
    if (bang) {
      return match;
    }
    const result = resolveLinkTarget(target, currentDir);
    if (result.type === "valid") {
      const alias = label.trim();
      const targetSlug = toDisplaySlug(result.slug);
      const replacement = alias && alias !== targetSlug
        ? `[[${targetSlug}|${alias}]]`
        : `[[${targetSlug}]]`;
      if (replacement !== match) {
        counters.fixed += 1;
        return replacement;
      }
    } else if (result.type === "missing") {
      const key = `${result.slug}::${target}`;
      if (!missingSet.has(key)) {
        missingSet.add(key);
        missingLinks.push(formatMissingLog(result.slug, target));
      }
    }
    return match;
  });

  updated = updated.replace(wikiLinkRegex, (match, bang, target, alias) => {
    if (bang) {
      return match;
    }
    const result = resolveLinkTarget(target, currentDir);
    if (result.type === "valid") {
      const displayAlias = alias ? alias.trim() : null;
      const targetSlug = toDisplaySlug(result.slug);
      const replacement = displayAlias
        ? `[[${targetSlug}|${displayAlias}]]`
        : `[[${targetSlug}]]`;
      if (replacement !== match) {
        counters.fixed += 1;
        return replacement;
      }
    } else if (result.type === "missing") {
      const key = `${result.slug}::${target}`;
      if (!missingSet.has(key)) {
        missingSet.add(key);
        missingLinks.push(formatMissingLog(result.slug, target));
      }
    }
    return match;
  });

  return updated;
}

function ensureArrayTags(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function uniqueTitle(baseTitle, filePath, usedTitles) {
  let title = baseTitle;
  const dirName = path.basename(path.dirname(filePath));
  const fallback = toTitleCase(dirName);
  if (!usedTitles.has(title)) {
    usedTitles.add(title);
    return title;
  }
  let candidate = title;
  if (fallback && fallback.toLowerCase() !== title.toLowerCase()) {
    candidate = `${title} (${fallback})`;
  }
  let counter = 2;
  while (usedTitles.has(candidate)) {
    candidate = `${title} (${counter})`;
    counter += 1;
  }
  usedTitles.add(candidate);
  return candidate;
}

async function processFiles(files) {
  const fileInfos = [];
  const usedTitles = new Set();
  const missingLinks = [];
  const missingSet = new Set();
  let fixedLinks = 0;
  let newTitles = 0;

  for (const file of files) {
    const rawContent = await fs.readFile(file, "utf8");
    const parsed = matter(rawContent);
    const data = parsed.data ?? {};
    const body = parsed.content;
    const relativePath = toPosix(path.relative(contentDir, file));
    const currentDir = path.posix.dirname(relativePath);
    const baseName = path.basename(file, path.extname(file));
    const hasTitle = Boolean(data.title && String(data.title).trim());
    const initialTitle = hasTitle ? String(data.title).trim() : toTitleCase(baseName);

    fileInfos.push({
      file,
      rawContent,
      parsed,
      data,
      body,
      relativePath,
      currentDir,
      baseName,
      hasTitle,
      initialTitle,
    });
  }

  for (const info of fileInfos) {
    const slugEntry = slugMap.get(buildSlug(info.file));
    let finalTitle = uniqueTitle(info.initialTitle, info.file, usedTitles);
    if (!info.hasTitle) {
      newTitles += 1;
    }
    info.finalTitle = finalTitle;
    if (slugEntry) {
      addName(finalTitle, slugEntry.slug);
      const aliases = Array.isArray(info.data.aliases)
        ? info.data.aliases
        : info.data.alias
        ? [info.data.alias]
        : [];
      for (const alias of aliases) {
        addName(alias, slugEntry.slug);
      }
    }
  }

  for (const info of fileInfos) {
    let body = info.body;
    const currentDir = info.currentDir === "." ? "" : info.currentDir;
    const counters = { fixed: 0 };
    body = replaceLinks(body, currentDir, counters, missingSet, missingLinks);

    let dateValue = normalizeDate(info.data.date);
    if (!dateValue) {
      dateValue = await getGitCreationDate(info.file);
    }

    const tags = ensureArrayTags(info.data.tags);
    const license = LICENSE_TEXT;

    const newData = { ...info.parsed.data };
    newData.title = info.finalTitle;
    newData.date = dateValue;
    newData.tags = tags;
    newData.license = license;

    for (const [key, value] of Object.entries(newData)) {
      if (typeof value === "string") {
        const normalized = replaceLinks(value, currentDir, counters, missingSet, missingLinks);
        if (normalized !== value) {
          newData[key] = normalized;
        }
      } else if (Array.isArray(value)) {
        const updatedArray = value.map((item) => {
          if (typeof item === "string") {
            return replaceLinks(item, currentDir, counters, missingSet, missingLinks);
          }
          return item;
        });
        newData[key] = updatedArray;
      }
    }

    const finalBody = body.endsWith("\n") ? body : `${body}\n`;
    const newFileContents = matter.stringify(finalBody, newData, {
      lineWidth: 1000,
    });

    if (newFileContents !== info.rawContent) {
      await fs.writeFile(info.file, newFileContents, "utf8");
    }

    fixedLinks += counters.fixed;
  }

  if (missingLinks.length > 0) {
    const logData = `${missingLinks.join("\n")}\n`;
    await fs.writeFile(path.join(staticDir, "missing-links.log"), logData, "utf8");
  }

  console.log("\x1b[32m✓ Fixed links:\x1b[0m", fixedLinks);
  console.log("\x1b[34m✓ New titles added:\x1b[0m", newTitles);
  console.log("\x1b[36mWorkflow file:\x1b[0m .github/workflows/build-and-deploy.yml");
}

async function main() {
  await ensureDirectories();
  slugMap.clear();
  nameLookup.clear();
  const files = await loadFiles();
  await processFiles(files);
}

main().catch((error) => {
  console.error("Error during maintenance run:", error);
  process.exitCode = 1;
});
