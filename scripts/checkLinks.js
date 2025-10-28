import { promises as fs } from "fs"
import path from "path"
import matter from "gray-matter"

const COLORS = {
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  reset: "\x1b[0m",
}

const contentDir = path.join(process.cwd(), "content")
const missingLogPath = path.join(process.cwd(), "static", "missing-links.log")

function normalizeKey(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s/]+/g, "")
    .replace(/\s+/g, "-")
}

async function collectMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const resolved = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        return collectMarkdownFiles(resolved)
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        return resolved
      }
      return []
    }),
  )
  return files.flat()
}

function resolveRelativeLink(sourceRelativePath, targetPath) {
  const sourceDir = path.posix.dirname(sourceRelativePath)
  const trimmed = targetPath.replace(/^\s+|\s+$/g, "")

  let pathPart = trimmed
  let anchor = ""
  let query = ""

  const hashIndex = pathPart.indexOf("#")
  if (hashIndex !== -1) {
    anchor = pathPart.slice(hashIndex)
    pathPart = pathPart.slice(0, hashIndex)
  }

  const queryIndex = pathPart.indexOf("?")
  if (queryIndex !== -1) {
    query = pathPart.slice(queryIndex)
    pathPart = pathPart.slice(0, queryIndex)
  }

  if (!pathPart || pathPart.startsWith("#") || /^[a-z]+:/i.test(pathPart)) {
    return { original: trimmed, normalized: trimmed, slug: null }
  }

  let cleaned = pathPart
  if (cleaned.startsWith("/")) {
    cleaned = cleaned.replace(/^\/+/, "")
  }

  if (cleaned.startsWith("content/")) {
    cleaned = cleaned.slice("content/".length)
  }

  if (cleaned.startsWith("./") || cleaned.startsWith("../")) {
    cleaned = path.posix.normalize(path.posix.join(sourceDir, cleaned))
  }

  if (cleaned.startsWith("../")) {
    return { original: trimmed, normalized: trimmed, slug: null }
  }

  cleaned = cleaned.replace(/\\/g, "/")

  if (cleaned.endsWith(".md")) {
    cleaned = cleaned.slice(0, -3)
  }

  cleaned = cleaned.replace(/\/+$/g, "")

  let slug = cleaned
  let normalized
  if (!slug) {
    slug = "index"
    normalized = query || anchor ? `/${query}${anchor}` : "/"
  } else {
    normalized = `/${slug}${query}${anchor}`
  }

  return { original: trimmed, normalized, slug }
}

async function main() {
  try {
    const markdownFiles = await collectMarkdownFiles(contentDir)
    const slugLookup = new Map()
    const aliasLookup = new Map()

    for (const file of markdownFiles) {
      const raw = await fs.readFile(file, "utf8")
      const parsed = matter(raw)
      const relative = path.relative(contentDir, file).split(path.sep).join("/")
      const slug = relative.replace(/\.md$/i, "")
      const baseSlug = path.posix.basename(slug)
      const title = parsed.data?.title
      const aliases = Array.isArray(parsed.data?.aliases) ? parsed.data.aliases : []

      slugLookup.set(slug, slug)
      slugLookup.set(slug.toLowerCase(), slug)
      slugLookup.set(normalizeKey(slug), slug)
      slugLookup.set(baseSlug.toLowerCase(), slug)

      if (title) {
        aliasLookup.set(normalizeKey(title), slug)
      }

      for (const alias of aliases) {
        if (typeof alias === "string" && alias.trim()) {
          aliasLookup.set(normalizeKey(alias), slug)
        }
      }
    }

    const missing = []
    let totalLinks = 0
    let normalizedLinks = 0

    for (const file of markdownFiles) {
      const relative = path.relative(contentDir, file).split(path.sep).join("/")
      let content = await fs.readFile(file, "utf8")
      const parsed = matter(content)
      let body = parsed.content
      let bodyChanged = false

      const markdownLinkRegex = /(!)?\[(.*?)\]\((.*?)\)/g
      body = body.replace(markdownLinkRegex, (match, isImage, text, target) => {
        if (isImage) {
          return match
        }

        totalLinks += 1
        const { normalized, slug, original } = resolveRelativeLink(relative, target)

        if (slug) {
          const normalizedCandidate = normalizeKey(slug)
          const resolvedSlug =
            slugLookup.get(slug) ||
            slugLookup.get(slug.toLowerCase()) ||
            slugLookup.get(normalizedCandidate) ||
            aliasLookup.get(normalizedCandidate)

          if (!resolvedSlug) {
            missing.push(`${relative}: ${target}`)
            return match
          }

          const finalTarget = resolvedSlug === "index" ? "/" : `/${resolvedSlug}`
          const anchorIndex = normalized.indexOf("#")
          const queryIndex = normalized.indexOf("?")
          let suffix = ""
          if (queryIndex !== -1 || anchorIndex !== -1) {
            const start = queryIndex !== -1 ? queryIndex : anchorIndex
            suffix = normalized.slice(start)
          }

          const normalizedLink = `${finalTarget}${suffix}`
          if (normalizedLink !== target.trim()) {
            bodyChanged = true
            normalizedLinks += 1
            return `[${text}](${normalizedLink})`
          }
          return match
        }

        if (!original || original.startsWith("#") || /^[a-z]+:/i.test(original)) {
          return match
        }

        missing.push(`${relative}: ${target}`)
        return match
      })

      const wikiLinkRegex = /\[\[(.+?)(\|.+?)?\]\]/g
      body.replace(wikiLinkRegex, (match, target) => {
        totalLinks += 1
        const cleanTarget = target.split("|")[0]
        const normalizedKey = normalizeKey(cleanTarget)
        if (
          slugLookup.has(cleanTarget) ||
          slugLookup.has(cleanTarget.toLowerCase()) ||
          slugLookup.has(normalizedKey) ||
          aliasLookup.has(normalizedKey)
        ) {
          return match
        }
        missing.push(`${relative}: ${match}`)
        return match
      })

      if (bodyChanged) {
        const newContent = matter.stringify(body, parsed.data)
        await fs.writeFile(file, newContent, "utf8")
        console.log(`${COLORS.green}[checkLinks] Normalized links in ${relative}${COLORS.reset}`)
      } else {
        console.log(`${COLORS.yellow}[checkLinks] No link updates needed in ${relative}${COLORS.reset}`)
      }
    }

    await fs.writeFile(missingLogPath, missing.join("\n") + (missing.length ? "\n" : ""), "utf8")

    if (missing.length > 0) {
      console.warn(
        `${COLORS.yellow}[checkLinks] Logged ${missing.length} missing references to ${path.relative(process.cwd(), missingLogPath)}${COLORS.reset}`,
      )
    } else {
      console.log(
        `${COLORS.green}[checkLinks] All internal references resolved successfully${COLORS.reset}`,
      )
    }

    console.log(
      `${COLORS.green}[checkLinks] Processed ${markdownFiles.length} files, ${totalLinks} links, normalized ${normalizedLinks}${COLORS.reset}`,
    )
  } catch (error) {
    console.error(`${COLORS.red}[checkLinks] ${error.message}${COLORS.reset}`)
    process.exitCode = 1
  }
}

main()
