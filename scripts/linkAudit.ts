import fs from "fs/promises"
import path from "path"

interface ContentIndexEntry {
  title: string
  tags?: string[]
  links?: string[]
}

interface PageInfo {
  slug: string
  title: string
  tags: string[]
  links: string[]
  linkTokens: Set<string>
  slugTokens: Set<string>
}

const repoRoot = path.resolve(process.cwd())
const indexPath = path.join(repoRoot, "public", "static", "contentIndex.json")

function normalizeTokens(value: string): string[] {
  const normalized = value
    .trim()
    .replace(/\\+/g, "/")
    .replace(/^\.\/?/, "")
    .replace(/index$/i, "")
    .replace(/\/+$/g, "")
  if (!normalized) {
    return []
  }

  const tokens = new Set<string>()
  const lower = normalized.toLowerCase()
  tokens.add(lower)
  const segments = lower.split("/").filter(Boolean)
  if (segments.length > 0) {
    tokens.add(segments[segments.length - 1])
  }

  return [...tokens]
}

function buildPageInfo(slug: string, entry: ContentIndexEntry): PageInfo | undefined {
  const trimmedSlug = slug.replace(/\\+/g, "/")
  if (trimmedSlug === "index" || trimmedSlug.endsWith("/index")) {
    return undefined
  }

  const tags = (entry.tags ?? []).map((tag) => tag.toLowerCase())
  const links = entry.links ?? []
  const linkTokens = new Set<string>()
  for (const link of links) {
    for (const token of normalizeTokens(link)) {
      linkTokens.add(token)
    }
  }

  const slugTokens = new Set<string>(normalizeTokens(trimmedSlug))

  return {
    slug: trimmedSlug,
    title: entry.title ?? trimmedSlug,
    tags,
    links,
    linkTokens,
    slugTokens,
  }
}

async function main() {
  const raw = await fs.readFile(indexPath, "utf8")
  const index = JSON.parse(raw) as Record<string, ContentIndexEntry>

  const pages = Object.entries(index)
    .map(([slug, entry]) => buildPageInfo(slug, entry))
    .filter((value): value is PageInfo => value !== undefined && value.tags.length > 0)

  const allSlugTokens = new Set<string>()
  for (const page of pages) {
    for (const token of page.slugTokens) {
      allSlugTokens.add(token)
    }
  }

  const unresolved = new Map<string, Set<string>>()
  for (const page of pages) {
    for (const link of page.links) {
      const tokens = normalizeTokens(link)
      if (tokens.length === 0) continue
      const matches = tokens.some((token) => allSlugTokens.has(token))
      if (!matches) {
        const key = tokens[0]
        if (!unresolved.has(key)) {
          unresolved.set(key, new Set())
        }
        unresolved.get(key)!.add(page.slug)
      }
    }
  }

  type Suggestion = {
    a: PageInfo
    b: PageInfo
    shared: string[]
  }

  const suggestions: Suggestion[] = []
  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      const a = pages[i]
      const b = pages[j]
      const shared = a.tags.filter((tag) => b.tags.includes(tag))
      if (shared.length < 2) {
        continue
      }

      const linked = hasLink(a, b) || hasLink(b, a)
      if (!linked) {
        suggestions.push({ a, b, shared: Array.from(new Set(shared)) })
      }
    }
  }

  suggestions.sort((s1, s2) => s2.shared.length - s1.shared.length || s1.a.slug.localeCompare(s2.a.slug))
  const topSuggestions = suggestions.slice(0, 15)
  const focusedSuggestions = suggestions
    .filter((s) => s.a.slug.startsWith("conservation/") || s.b.slug.startsWith("conservation/") || s.a.slug.startsWith("fieldnotes/") || s.b.slug.startsWith("fieldnotes/"))
    .slice(0, 15)

  const lines: string[] = []
  lines.push("# Internal link audit")
  lines.push("")
  lines.push("Generated automatically from public/static/contentIndex.json.")
  lines.push("")
  if (topSuggestions.length > 0) {
    lines.push("## High-overlap tag pairs without direct links")
    lines.push("")
    for (const suggestion of topSuggestions) {
      lines.push(
        `- **${suggestion.a.title}** (${suggestion.a.slug}) ↔ **${suggestion.b.title}** (${suggestion.b.slug}) — shared tags: ${suggestion.shared
          .map((tag) => `\`${tag}\``)
          .join(", ")}`,
      )
    }
    lines.push("")
  }

  if (focusedSuggestions.length > 0) {
    lines.push("## Opportunities touching new sections")
    lines.push("")
    for (const suggestion of focusedSuggestions) {
      lines.push(
        `- **${suggestion.a.title}** (${suggestion.a.slug}) ↔ **${suggestion.b.title}** (${suggestion.b.slug}) — shared tags: ${suggestion.shared
          .map((tag) => `\`${tag}\``)
          .join(", ")}`,
      )
    }
    lines.push("")
  }

  if (unresolved.size > 0) {
    lines.push("## Wikilinks without matching pages")
    lines.push("")
    for (const [token, sources] of unresolved) {
      lines.push(`- \`${token}\` referenced in: ${[...sources].join(", ")}`)
    }
    lines.push("")
  }

  const outputPath = path.join(repoRoot, "docs", "internal-link-audit.md")
  await fs.writeFile(outputPath, lines.join("\n"))
}

function hasLink(from: PageInfo, to: PageInfo): boolean {
  for (const token of to.slugTokens) {
    if (from.linkTokens.has(token)) {
      return true
    }
  }
  return false
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
