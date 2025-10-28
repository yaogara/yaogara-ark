import { promises as fs } from "fs"
import path from "path"
import matter from "gray-matter"
import { exec as execCb } from "child_process"
import { promisify } from "util"

const exec = promisify(execCb)

const COLORS = {
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  reset: "\x1b[0m",
}

const contentDir = path.join(process.cwd(), "content")
const citationsPath = path.join(process.cwd(), "static", "citations.json")
const updateLogPath = path.join(process.cwd(), "static", "update-summary.log")
const LICENSE_TEXT = "CC BY-SA 4.0 – Yaogará Research Archive"

const FOOTER_TEMPLATE = `---
### References and Licensing

This article is part of the **[Yaogará Ark Research Archive](https://ark.yaogara.org)** —  
an open ethnobotanical repository documenting sacred plants and Indigenous ecological knowledge of the Amazon.

**Publisher:** [Yaogará Research Initiative](https://yaogara.com) — Fundación Camino al Sol  
**License:** [Creative Commons Attribution–ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/)  
**Citation:** Yaogará Research Initiative ({{YEAR}}). *{{TITLE}}*. Yaogará Ark Research Archive. https://ark.yaogara.org/{{PATH}}

#### Related Reading
{{RELATED_LINKS}}

---`

const currentYear = new Date().getFullYear().toString()

async function readJsonFile(filePath) {
  try {
    const data = await fs.readFile(filePath, "utf8")
    return JSON.parse(data)
  } catch (error) {
    console.error(
      `${COLORS.red}[addArkFooters] Unable to read ${filePath}: ${error.message}${COLORS.reset}`,
    )
    return {}
  }
}

async function ensureDirExists(filePath) {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
}

function formatDate(date) {
  return date.toISOString().split("T")[0]
}

function normalizeDateValue(value) {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return formatDate(value)
  }

  if (typeof value === "number") {
    return formatDate(new Date(value))
  }

  if (typeof value === "string") {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.valueOf())) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value
      }
      return formatDate(parsed)
    }
    return formatDate(new Date())
  }

  const parsed = new Date(value)
  if (!Number.isNaN(parsed.valueOf())) {
    return formatDate(parsed)
  }

  return formatDate(new Date())
}

async function getGitLastModified(relativePath) {
  try {
    const { stdout } = await exec(`git log -1 --format=%cs -- "${relativePath}"`)
    const value = stdout.trim()
    if (value) {
      return value
    }
  } catch (error) {
    // ignore and fall through to fallback date
  }
  return formatDate(new Date())
}

function titleFromSlug(slug) {
  return slug
    .split("/")
    .pop()
    .split(/[-_]/g)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")
}

async function collectMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const res = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        return collectMarkdownFiles(res)
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        return res
      }
      return []
    }),
  )
  return files.flat()
}

function buildRelatedLinks(slug, metadataMap, citations) {
  const dirName = path.posix.dirname(slug)
  const directory = dirName === "." ? "" : dirName
  const candidates = []

  for (const [otherSlug, meta] of metadataMap.entries()) {
    if (otherSlug === slug) continue
    const otherDir = path.posix.dirname(otherSlug)
    const otherDirectory = otherDir === "." ? "" : otherDir
    if (directory !== otherDirectory) continue
    const weight = Array.isArray(citations[otherSlug]) ? citations[otherSlug].length : 0
    candidates.push({ slug: otherSlug, title: meta.title, weight })
  }

  candidates.sort((a, b) => {
    if (b.weight === a.weight) {
      return a.slug.localeCompare(b.slug)
    }
    return b.weight - a.weight
  })

  const limited = candidates.slice(0, Math.min(5, Math.max(3, candidates.length)))
  if (limited.length === 0) {
    return "*No related articles available yet.*"
  }

  return limited
    .map((item) => `- [${item.title}](/${item.slug})`)
    .join("\n")
}

async function main() {
  try {
    const markdownFiles = await collectMarkdownFiles(contentDir)
    const citations = await readJsonFile(citationsPath)
    const metadataMap = new Map()

    for (const file of markdownFiles) {
      const relative = path.relative(contentDir, file).split(path.sep).join("/")
      const slug = relative.replace(/\.md$/i, "")
      const raw = await fs.readFile(file, "utf8")
      const parsed = matter(raw)
      const title = parsed.data?.title || titleFromSlug(slug)
      metadataMap.set(slug, { title, relativePath: relative })
    }

    const updates = []

    for (const file of markdownFiles) {
      const relative = path.relative(process.cwd(), file)
      const relativeContentPath = path.relative(contentDir, file).split(path.sep).join("/")
      const slug = relativeContentPath.replace(/\.md$/i, "")

      const raw = await fs.readFile(file, "utf8")
      const parsed = matter(raw)
      const data = parsed.data || {}
      const body = parsed.content || ""

      let modified = false

      const title = data.title || titleFromSlug(slug)
      if (!data.title) {
        data.title = title
        modified = true
      }

      if (!data.date) {
        data.date = formatDate(new Date())
        modified = true
      } else {
        const normalizedDate = normalizeDateValue(data.date)
        if (normalizedDate && normalizedDate !== data.date) {
          data.date = normalizedDate
          modified = true
        }
      }

      if (!Array.isArray(data.tags)) {
        if (typeof data.tags === "string" && data.tags.trim().length > 0) {
          data.tags = data.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        } else {
          data.tags = []
        }
        modified = true
      }

      if (data.license !== LICENSE_TEXT) {
        data.license = LICENSE_TEXT
        modified = true
      }

      const gitLastModified = await getGitLastModified(relative)
      const normalizedLastMod = normalizeDateValue(data.lastmod)
      if (normalizedLastMod && normalizedLastMod !== data.lastmod) {
        data.lastmod = normalizedLastMod
        modified = true
      }
      if (data.lastmod !== gitLastModified) {
        data.lastmod = gitLastModified
        modified = true
      }

      const footerExists = /References and Licensing|Related Reading/.test(body)
      let contentBody = body.trimEnd()

      if (!footerExists) {
        const relatedLinks = buildRelatedLinks(slug, metadataMap, citations)
        const slugPath = slug === "index" ? "" : slug
        const footer = FOOTER_TEMPLATE.replace("{{YEAR}}", currentYear)
          .replace("{{TITLE}}", title)
          .replace("{{PATH}}", slugPath)
          .replace("{{RELATED_LINKS}}", relatedLinks)
        contentBody = `${contentBody}\n\n${footer}\n`
        modified = true
      } else {
        contentBody = body
      }

      if (modified) {
        const newContent = matter.stringify(contentBody, data)
        await fs.writeFile(file, newContent, "utf8")
        updates.push(relativeContentPath)
        console.log(
          `${COLORS.green}[addArkFooters] Updated ${relativeContentPath}${COLORS.reset}`,
        )
      } else {
        console.log(
          `${COLORS.yellow}[addArkFooters] Skipped ${relativeContentPath} (up-to-date)${COLORS.reset}`,
        )
      }
    }

    if (updates.length > 0) {
      await ensureDirExists(updateLogPath)
      const timestamp = new Date().toISOString()
      const logEntries = updates.map((file) => `${timestamp} - Updated ${file}`)
      await fs.appendFile(updateLogPath, logEntries.join("\n") + "\n", "utf8")
    }

    console.log(
      `${COLORS.green}[addArkFooters] Completed processing ${markdownFiles.length} files${COLORS.reset}`,
    )
  } catch (error) {
    console.error(`${COLORS.red}[addArkFooters] ${error.message}${COLORS.reset}`)
    process.exitCode = 1
  }
}

main()
