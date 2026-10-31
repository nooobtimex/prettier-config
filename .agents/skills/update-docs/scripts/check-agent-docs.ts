/**
 * check-agent-docs — the repo-kit gate for agent instructions (`bun run check:agents`).
 *
 * Holds AGENTS.md, the CLAUDE.md shims, `.agents/skills` and `.claude/{skills,agents}` to the standard in
 * `../SKILL.md`: AGENTS.md carries the five headings within its line and byte budgets, every CLAUDE.md is a
 * shim that imports the AGENTS.md beside it, skills live in `.agents/skills` with a symlink in
 * `.claude/skills`, frontmatter parses with a real YAML parser and uses known keys, `name` matches its
 * folder, every description carries a "Use when" trigger, links and `@imports` resolve, bundled files are
 * reachable from their skill, retired per-tool files are gone, no symlink is broken, the repo-kit core
 * (the delivery block in AGENTS.md and the update-docs skill) is unedited, and package.json wires the gate.
 *
 *   bun .agents/skills/update-docs/scripts/check-agent-docs.ts          check the repo in the cwd
 *   bun <kit>/payload/agents/skills/update-docs/scripts/check-agent-docs.ts --root <repo>
 *                                                                      the same, plus "outdated" vs the kit
 *   bun <kit>/payload/agents/skills/update-docs/scripts/check-agent-docs.ts --install <repo>
 *                                                                      install the core into <repo>
 *
 * Errors exit 1 and print as `file:line message`. Notes (a SKILL.md over the 150-line target) never fail.
 */
import { Glob } from 'bun'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// ---------------------------------------------------------------------------------------------------
// The core: items copied verbatim into every repo, each identified by a hash in its stamp line
// ---------------------------------------------------------------------------------------------------

/**
 * A dir item is copied into `<repo>/.agents/<path>`. A block item is inserted into `<repo>/<block>` after
 * the BLOCK_START marker line and runs to its stamp line, so every tool reads it without an import.
 */
type CoreItem = { path: string; stamp: string; local?: string; block?: string }

export const CORE: CoreItem[] = [
	{ path: 'delivery.md', stamp: 'delivery.md', block: 'AGENTS.md' },
	{ path: 'skills/update-docs', stamp: 'skills/update-docs/SKILL.md', local: 'skills/update-docs/local.md' },
]

const STAMP_RX = /^<!-- repo-kit: version=(\S+) hash=([0-9a-f]{12}) -->$/m
const STAMP_BLANK = '<!-- repo-kit -->'
const BLOCK_START = '<!-- repo-kit:delivery -->'
// The uploaded bundle renames nested SKILL.md files so claude.ai does not register them as skills.
const TEMPLATE_NAME = 'SKILL.template.md'

/** Where core items are read from: the kit's payload dir, or a repo (dir items in `.agents`, blocks in a file). */
export type Src = { agentsDir: string; repo?: string }
export const kitSrc = (agentsDir: string): Src => ({ agentsDir })
export const repoSrc = (repo: string): Src => ({ agentsDir: path.join(repo, '.agents'), repo })
const toSrc = (s: string | Src): Src => (typeof s === 'string' ? kitSrc(s) : s)

const normalizeRel = (rel: string) => rel.split(path.sep).join('/').replace(/SKILL\.template\.md$/, 'SKILL.md')

const resolveCoreFile = (agentsDir: string, rel: string) => {
	const direct = path.join(agentsDir, rel)
	if (fs.existsSync(direct) || !rel.endsWith('SKILL.md')) return direct
	return path.join(agentsDir, rel.replace(/SKILL\.md$/, TEMPLATE_NAME))
}

const walkFiles = (dir: string, base = dir, seen = new Set<string>()): string[] => {
	const real = fs.realpathSync(dir)
	if (seen.has(real)) return []
	seen.add(real)
	const out: string[] = []
	for (const entry of fs.readdirSync(dir)) {
		if (entry.startsWith('.')) continue
		const full = path.join(dir, entry)
		if (!fs.existsSync(full)) continue
		if (fs.statSync(full).isDirectory()) out.push(...walkFiles(full, base, seen))
		else out.push(path.relative(base, full))
	}
	return out
}

/**
 * The block text in a file: from the first non-blank line after BLOCK_START through its stamp line, newline
 * included. Blank lines after the marker are skipped — Prettier puts one between an HTML comment and a paragraph.
 */
export const extractBlock = (text: string): string | null => {
	const at = blockRange(text)
	return at ? text.slice(at.body, at.end) : null
}

/** Offsets of the block in a file: `start` at BLOCK_START, `body` at its first line, `end` after the stamp line. */
const blockRange = (text: string): { start: number; body: number; end: number } | null => {
	const start = text.indexOf(`${BLOCK_START}\n`)
	if (start < 0) return null
	let body = start + BLOCK_START.length + 1
	while (text[body] === '\n') body++
	const m = text.slice(body).match(STAMP_RX)
	if (!m || m.index === undefined) return null
	return { start, body, end: body + m.index + m[0].length + 1 }
}

const readCoreText = (src: Src, item: CoreItem, rel: string): string | null => {
	if (item.block && src.repo) {
		const file = path.join(src.repo, item.block)
		return fs.existsSync(file) ? extractBlock(fs.readFileSync(file, 'utf8')) : null
	}
	const file = resolveCoreFile(src.agentsDir, rel)
	return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
}

/** Files of a core item relative to the agents dir, normalised, sorted, `local` excluded. */
const coreFiles = (src: Src, item: CoreItem): string[] => {
	if (item.block) return readCoreText(src, item, item.path) === null ? [] : [item.path]
	const root = path.join(src.agentsDir, item.path)
	if (!fs.existsSync(root)) return []
	return walkFiles(root)
		.map(rel => normalizeRel(path.join(item.path, rel)))
		.filter(rel => rel !== item.local)
		.sort()
}

export const hashCore = (base: string | Src, item: CoreItem): string => {
	const src = toSrc(base)
	const h = createHash('sha256')
	for (const rel of coreFiles(src, item)) {
		const text = (readCoreText(src, item, rel) ?? '').replace(/\r\n/g, '\n').replace(STAMP_RX, STAMP_BLANK)
		h.update(`${rel}\0${text}\0`)
	}
	return h.digest('hex').slice(0, 12)
}

export const readStamp = (base: string | Src, item: CoreItem): { version: string; hash: string } | null => {
	const m = readCoreText(toSrc(base), item, item.stamp)?.match(STAMP_RX)
	return m ? { version: m[1]!, hash: m[2]! } : null
}

/** Rewrites the stamp line in the kit when the content hash changed. Returns true when it wrote. */
export const writeStamp = (agentsDir: string, item: CoreItem, version: string): boolean => {
	const hash = hashCore(agentsDir, item)
	if (readStamp(agentsDir, item)?.hash === hash) return false
	const file = resolveCoreFile(agentsDir, item.stamp)
	const text = fs.readFileSync(file, 'utf8')
	const line = `<!-- repo-kit: version=${version} hash=${hash} -->`
	fs.writeFileSync(file, STAMP_RX.test(text) ? text.replace(STAMP_RX, line) : `${text.replace(/\n*$/, '\n')}\n${line}\n`)
	return true
}

/** Puts the block into a file's text: replaces an existing block, else appends it to `## Delivery contract`. */
export const upsertBlock = (text: string, block: string): string => {
	const marked = `${BLOCK_START}\n\n${block}`
	const at = blockRange(text)
	if (at) return text.slice(0, at.start) + marked + text.slice(at.end)
	const lines = text.split('\n')
	const heading = lines.findIndex(l => /^## .*delivery contract\s*$/i.test(l))
	if (heading < 0) return `${text.replace(/\n*$/, '\n')}\n## Delivery contract\n\n${marked}`
	let end = lines.findIndex((l, i) => i > heading && /^## /.test(l))
	if (end < 0) end = lines.length
	while (end > heading + 1 && lines[end - 1]!.trim() === '') end--
	return [...lines.slice(0, end), '', ...marked.replace(/\n$/, '').split('\n'), '', ...lines.slice(end)].join('\n').replace(/\n*$/, '\n')
}

/**
 * Installs the core from the kit's agents dir into `<repo>`: moves real skill folders out of `.claude/skills`
 * into `.agents/skills`, copies the dir items (keeping `local` files), writes the delivery block into
 * AGENTS.md, links every `.agents/skills/<name>` back into `.claude/skills`, removes the
 * retired delivery rule (the old rules folder's delivery file), and writes a CLAUDE.md shim when there is none.
 */
export const install = (repo: string, fromAgentsDir = bundleAgentsDir()): string[] => {
	const done: string[] = []
	const agentsSkills = path.join(repo, '.agents', 'skills')
	const claudeSkills = path.join(repo, '.claude', 'skills')
	fs.mkdirSync(agentsSkills, { recursive: true })
	if (fs.existsSync(claudeSkills) && !fs.lstatSync(claudeSkills).isSymbolicLink())
		for (const name of fs.readdirSync(claudeSkills)) {
			const from = path.join(claudeSkills, name)
			if (fs.lstatSync(from).isSymbolicLink() || !fs.statSync(from).isDirectory()) continue
			const to = path.join(agentsSkills, name)
			if (fs.existsSync(to)) continue
			fs.renameSync(from, to)
			done.push(`.claude/skills/${name} → .agents/skills/${name}`)
		}
	for (const item of CORE) {
		if (item.block) {
			const target = path.join(repo, item.block)
			const block = fs.readFileSync(path.join(fromAgentsDir, item.path), 'utf8')
			const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : `# ${path.basename(path.resolve(repo))}\n`
			fs.writeFileSync(target, upsertBlock(before, block))
			done.push(`${item.block} (delivery block)`)
			continue
		}
		const dest = path.join(repo, '.agents', item.path)
		const keep = item.local && fs.existsSync(path.join(repo, '.agents', item.local)) ? fs.readFileSync(path.join(repo, '.agents', item.local)) : null
		fs.rmSync(dest, { recursive: true, force: true })
		for (const rel of coreFiles(kitSrc(fromAgentsDir), item)) {
			const target = path.join(repo, '.agents', rel)
			fs.mkdirSync(path.dirname(target), { recursive: true })
			fs.copyFileSync(resolveCoreFile(fromAgentsDir, rel), target)
			done.push(`.agents/${rel}`)
		}
		if (item.local) {
			const target = path.join(repo, '.agents', item.local)
			if (keep) fs.writeFileSync(target, keep)
			else {
				fs.copyFileSync(path.join(fromAgentsDir, item.local), target)
				done.push(`.agents/${item.local} (new — fill in this repo's sync map)`)
			}
		}
	}
	fs.mkdirSync(claudeSkills, { recursive: true })
	for (const name of fs.readdirSync(agentsSkills)) {
		const link = path.join(claudeSkills, name)
		let present = false
		try {
			fs.lstatSync(link)
			present = true
		} catch {}
		if (present) {
			if (!fs.lstatSync(link).isSymbolicLink()) continue
			fs.unlinkSync(link)
		}
		fs.symlinkSync(path.join('..', '..', '.agents', 'skills', name), link)
	}
	done.push('.claude/skills/* → ../../.agents/skills/* (symlinks)')
	const oldRule = path.join(repo, '.claude', 'rules', 'delivery.md')
	if (fs.existsSync(oldRule) || isLink(oldRule)) {
		fs.rmSync(oldRule, { force: true })
		done.push('old delivery rule removed (now the AGENTS.md block)')
		const rules = path.join(repo, '.claude', 'rules')
		if (fs.existsSync(rules) && !fs.readdirSync(rules).length) fs.rmdirSync(rules)
	}
	const claudeMd = path.join(repo, 'CLAUDE.md')
	if (!fs.existsSync(claudeMd)) {
		fs.writeFileSync(claudeMd, '@AGENTS.md\n')
		done.push('CLAUDE.md (shim)')
	}
	return done
}

const isLink = (p: string) => {
	try {
		return fs.lstatSync(p).isSymbolicLink()
	} catch {
		return false
	}
}

const bundleAgentsDir = () => path.resolve(import.meta.dir, '../../..')

// ---------------------------------------------------------------------------------------------------
// The standard
// ---------------------------------------------------------------------------------------------------

const SKILL_KEYS = new Set([
	'name', 'description', 'when_to_use', 'argument-hint', 'arguments', 'disable-model-invocation',
	'user-invocable', 'allowed-tools', 'disallowed-tools', 'model', 'effort', 'context', 'agent',
	'background', 'hooks', 'paths', 'shell', 'license', 'compatibility', 'metadata',
])
const SKELETON = ['Safety', 'Delivery contract', 'Read before you edit', 'Repository map', 'Further reading']
const RETIRED = [
	'CODEX.md', 'GEMINI.md', '.cursorrules', '.cursor', '.windsurfrules', '.clinerules', '.claude/commands',
	'.github/copilot-instructions.md', '.github/instructions', '.agents/AGENTS.md', '.agents/rules',
]
const BUNDLED_DIRS = ['references', 'scripts', 'assets', 'templates']
const SKIP_UNDER = ['/templates/', '/payload/']
const NEXT_BLOCK = /<!-- BEGIN:nextjs-agent-rules -->[\s\S]*?<!-- END:nextjs-agent-rules -->\n?/g
const BUDGET = {
	agentsMd: 200, projectAgentsMdTarget: 80, agentsMdBytes: 24_000, chainBytes: 32_768, shim: 40,
	skillTarget: 150, skillMax: 500, desc: 1024, listing: 1536,
}

type Result = { errors: string[]; notes: string[] }

const listRepoFiles = (root: string, extra: string[] = []): string[] => {
	const git = Bun.spawnSync(['git', 'ls-files', ...extra], { cwd: root, stdout: 'pipe', stderr: 'ignore' })
	if (git.exitCode === 0) return git.stdout.toString().split('\n').filter(Boolean)
	return walkFiles(root).filter(f => !f.includes('node_modules'))
}

const frontmatter = (text: string): { data: Record<string, unknown> | null; raw: string; error?: string } => {
	if (!text.startsWith('---\n')) return { data: null, raw: '' }
	const end = text.indexOf('\n---', 4)
	if (end < 0) return { data: null, raw: '', error: 'frontmatter has no closing ---' }
	const raw = text.slice(4, end)
	try {
		const data = Bun.YAML.parse(raw)
		return { data: data && typeof data === 'object' ? (data as Record<string, unknown>) : {}, raw }
	} catch (e) {
		return { data: null, raw, error: `frontmatter does not parse: ${(e as Error).message}` }
	}
}

/** An unquoted scalar containing " #" is silently cut there — YAML reads the rest as a comment. */
const plainScalarComments = (raw: string): number[] =>
	raw.split('\n').flatMap((line, i) => {
		const m = line.match(/^[A-Za-z_][\w-]*:\s+(.+)$/)
		return m && !/^['"|>[{]/.test(m[1]!) && / #/.test(m[1]!) ? [i + 2] : []
	})

/**
 * GitHub's heading → anchor slug (ported from rs-trophy.com scripts/check-docs.ts). `\p{M}` keeps combining
 * marks — Thai vowel and tone marks, and the emoji variation selector U+FE0F — and inline markup (backticks,
 * `*`, `_`, `~`) is dropped, so `eservice_category` anchors as `eservicecategory`.
 */
const slug = (heading: string) =>
	heading
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[`*_~]/g, '')
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\p{M}\s-]/gu, '')
		.replace(/\s/g, '-')

const headings = (text: string) => {
	const out = new Set<string>()
	const counts = new Map<string, number>()
	for (const line of stripFences(text).split('\n')) {
		const m = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/)
		if (!m) continue
		const s = slug(m[1]!)
		const n = counts.get(s) ?? 0
		out.add(n ? `${s}-${n}` : s)
		counts.set(s, n + 1)
	}
	return out
}

/** Blanks fenced code blocks but keeps line numbers. */
const stripFences = (text: string) => {
	let inFence = false
	return text
		.split('\n')
		.map(line => {
			if (/^\s*(```|~~~)/.test(line)) {
				inFence = !inFence
				return ''
			}
			return inFence ? '' : line
		})
		.join('\n')
}

const LINK_RX = /\[[^\]]*\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/g // one level of parens: app/(group)/x.tsx

const linksOf = (text: string) =>
	stripFences(text)
		.split('\n')
		.flatMap((line, i) =>
			[...line.replace(/`[^`]*`/g, '').matchAll(LINK_RX)].map(m => ({ target: m[1]!, line: i + 1 })),
		)

const isExternal = (t: string) => /^(https?:|mailto:|file:|<)/.test(t) || /^(…|\.\.\.)$/.test(t) // … = an example link

const resolveLink = (root: string, fromFile: string, target: string) => {
	const [p = '', anchor] = target.split('#')
	const decoded = decodeURIComponent(p)
	const file = !decoded ? fromFile : decoded.startsWith('/') ? path.join(root, decoded) : path.resolve(path.dirname(fromFile), decoded)
	return { file, anchor }
}

const skipped = (rel: string) => SKIP_UNDER.some(s => `/${rel}`.includes(s))

/**
 * `<dir>/.claude` or `<dir>/.agents` folders below the root. git lists them when the repo is one (ignored
 * files never count); otherwise the tree is walked, skipping `.git`, `node_modules` and the root folder.
 */
const nestedDirs = (root: string, files: string[], name: '.claude' | '.agents'): string[] => {
	const found = new Set<string>()
	for (const f of files) {
		const i = f.indexOf(`/${name}/`)
		if (i > 0) found.add(f.slice(0, i + name.length + 1))
	}
	const inGit = Bun.spawnSync(['git', 'rev-parse', '--is-inside-work-tree'], { cwd: root, stdout: 'ignore', stderr: 'ignore' }).exitCode === 0
	if (inGit) return [...found]
	const walk = (dir: string) => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			if (!e.isDirectory() || e.name === '.git' || e.name === 'node_modules') continue
			const p = path.join(dir, e.name)
			if (e.name === name) {
				if (dir !== root) found.add(path.relative(root, p).split(path.sep).join('/'))
				continue
			}
			walk(p)
		}
	}
	walk(root)
	return [...found]
}

/** Every agent-facing markdown file, each once (`.claude/skills/*` are links into `.agents/skills`). */
const agentMarkdown = (root: string, files: string[]): string[] => {
	const nested = files.filter(f => ['AGENTS.md', 'CLAUDE.md'].includes(path.basename(f)) && !skipped(f))
	const out = [...new Set(['AGENTS.md', 'CLAUDE.md', ...nested])].map(f => path.join(root, f)).filter(f => fs.existsSync(f))
	for (const dir of ['.agents', '.claude']) {
		const base = path.join(root, dir)
		if (fs.existsSync(base))
			out.push(...walkFiles(base).filter(f => f.endsWith('.md') && !f.startsWith('worktrees')).map(f => path.join(base, f)))
	}
	const seen = new Set<string>()
	return out.filter(f => {
		const real = fs.realpathSync(f)
		if (seen.has(real)) return false
		seen.add(real)
		return true
	})
}

const firstLine = (text: string) => text.split('\n').find(l => l.trim()) ?? ''
const withoutNext = (text: string) => text.replace(NEXT_BLOCK, '')

export const check = (root: string, bundle = bundleAgentsDir()): Result => {
	const errors: string[] = []
	const notes: string[] = []
	const rel = (f: string) => path.relative(root, f) || f
	const err = (f: string, line: number, msg: string) => errors.push(`${rel(f)}:${line} ${msg}`)
	const files = listRepoFiles(root, ['-co', '--exclude-standard']).filter(f => !f.startsWith('.claude/worktrees/'))
	const matches = (patterns: string[]) => patterns.some(p => files.some(f => new Glob(p).match(f)))
	const agentsMdPath = path.join(root, 'AGENTS.md')
	const agentsMd = fs.existsSync(agentsMdPath) ? fs.readFileSync(agentsMdPath, 'utf8') : ''

	// Skills: sources in .agents/skills, one symlink each in .claude/skills
	const skillsDir = path.join(root, '.agents', 'skills')
	const claudeSkills = path.join(root, '.claude', 'skills')
	for (const d of [skillsDir, claudeSkills])
		if (isLink(d)) err(d, 1, `${rel(d)} must be a real directory (symlink only individual skill folders)`)
	const skills = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir).filter(d => !d.startsWith('.')) : []
	for (const name of skills) {
		const dir = path.join(skillsDir, name)
		if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue
		const file = path.join(dir, 'SKILL.md')
		if (!fs.existsSync(file)) {
			err(dir, 1, 'no SKILL.md — an empty husk (a tool import leaves these); delete it')
			continue
		}
		const link = path.join(claudeSkills, name)
		if (!isLink(link)) err(link, 1, `missing symlink — Claude Code reads only .claude/skills; link it to ../../.agents/skills/${name}`)
		else if (!fs.existsSync(link) || fs.realpathSync(link) !== fs.realpathSync(dir)) err(link, 1, `must resolve to .agents/skills/${name}`)
		const text = fs.readFileSync(file, 'utf8')
		const fm = frontmatter(text)
		if (fm.error) err(file, 1, fm.error)
		if (!fm.data) {
			if (!fm.error) err(file, 1, 'no frontmatter — needs at least name and description')
			continue
		}
		for (const line of plainScalarComments(fm.raw)) err(file, line, 'unquoted value contains " #" — YAML drops the rest as a comment; quote it or use >-')
		for (const key of Object.keys(fm.data)) if (!SKILL_KEYS.has(key)) err(file, 1, `unknown frontmatter key "${key}"`)
		if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) err(file, 1, `folder "${name}" must be kebab-case, ≤ 64 chars`)
		if (fm.data.name !== name) err(file, 2, `name "${String(fm.data.name)}" must equal the folder name "${name}"`)
		const desc = typeof fm.data.description === 'string' ? fm.data.description : ''
		if (!desc) err(file, 3, 'description is missing')
		if (desc.length > BUDGET.desc) err(file, 3, `description is ${desc.length} chars (max ${BUDGET.desc})`)
		if (desc && !/use when/i.test(desc)) err(file, 3, 'description has no "Use when <triggers>" clause')
		const listing = desc.length + (typeof fm.data.when_to_use === 'string' ? fm.data.when_to_use.length : 0)
		if (listing > BUDGET.listing) err(file, 3, `description + when_to_use is ${listing} chars (listing cuts at ${BUDGET.listing})`)
		const paths = typeof fm.data.paths === 'string' ? [fm.data.paths] : Array.isArray(fm.data.paths) ? fm.data.paths.map(String) : []
		if (name.endsWith('-conventions') && !paths.length) err(file, 1, '*-conventions skills need paths: so they surface only on matching files')
		if (paths.length && !matches(paths)) err(file, 1, `paths: ${paths.join(', ')} match no file in the repo`)
		const tools = fm.data['allowed-tools']
		if (typeof tools === 'string' && tools.split(/,\s*/).some(t => /\)\s+\S/.test(t)))
			err(file, 1, 'allowed-tools must be comma-separated — a space-separated list grants nothing')
		const lines = text.split('\n').length
		if (lines > BUDGET.skillMax) err(file, lines, `SKILL.md is ${lines} lines (ceiling ${BUDGET.skillMax}) — move detail to references/`)
		else if (lines > BUDGET.skillTarget) notes.push(`${rel(file)}: ${lines} lines (target ≤ ${BUDGET.skillTarget}) — consider references/`)
		if (agentsMd && !agentsMd.includes(`.agents/skills/${name}/SKILL.md`)) err(agentsMdPath, 1, `does not link the skill .agents/skills/${name}/SKILL.md`)

		// Bundled files must be reachable from SKILL.md through links or path mentions
		const bundled = BUNDLED_DIRS.flatMap(d =>
			fs.existsSync(path.join(dir, d)) ? walkFiles(path.join(dir, d)).map(f => path.join(d, f)) : [],
		).filter(f => !/(^|\/)(LICENSE|NOTICE)[^/]*$/.test(f))
		const reached = new Set<string>(['SKILL.md'])
		const queue = ['SKILL.md']
		while (queue.length) {
			const current = queue.shift()!
			const body = fs.readFileSync(path.join(dir, current), 'utf8')
			for (const f of bundled) {
				if (reached.has(f)) continue
				const viaLink = linksOf(body).some(l => !isExternal(l.target) && resolveLink(root, path.join(dir, current), l.target).file === path.join(dir, f))
				if (viaLink || body.includes(f)) {
					reached.add(f)
					queue.push(f)
				}
			}
		}
		for (const f of bundled) if (!reached.has(f)) err(path.join(dir, f), 1, `not linked from ${name}/SKILL.md — link it or delete it`)
	}
	if (fs.existsSync(claudeSkills) && !isLink(claudeSkills))
		for (const name of fs.readdirSync(claudeSkills)) {
			const p = path.join(claudeSkills, name)
			if (name.startsWith('.')) continue
			if (!isLink(p)) err(p, 1, `a real folder in .claude/skills — move it to .agents/skills/${name} and symlink it back`)
			else if (!skills.includes(name)) err(p, 1, `links to no .agents/skills/${name} — every skill's source is .agents/skills`)
		}

	// Rules are retired; subagents stay Claude-only and name their model and effort
	const rulesDir = path.join(root, '.claude', 'rules')
	if (fs.existsSync(rulesDir))
		for (const r of walkFiles(rulesDir).filter(f => f.endsWith('.md')))
			err(path.join(rulesDir, r), 1, 'retired: .claude/rules is Claude-only — always-on text goes into AGENTS.md, a path-scoped rule becomes a skill with paths:')
	const agentsDir = path.join(root, '.claude', 'agents')
	for (const a of fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir).filter(f => f.endsWith('.md')) : []) {
		const file = path.join(agentsDir, a)
		const fm = frontmatter(fs.readFileSync(file, 'utf8'))
		if (fm.error) err(file, 1, fm.error)
		else if (!fm.data?.name || !fm.data?.description) err(file, 1, 'subagent needs name and description')
		else {
			if (!fm.data.model) err(file, 1, 'subagent needs model: (haiku, sonnet, opus, inherit or a model id) — pick it per task, update-docs §6')
			if (!fm.data.effort) err(file, 1, 'subagent needs effort: (low, medium, high, xhigh or max) — pick it per task, update-docs §6')
		}
	}

	// AGENTS.md: the source every tool reads
	if (!agentsMd) err(agentsMdPath, 1, 'missing — start from the repo-kit AGENTS.md template')
	else {
		const body = withoutNext(agentsMd)
		const lines = body.split('\n').length
		if (lines > BUDGET.agentsMd) err(agentsMdPath, lines, `AGENTS.md is ${lines} lines (max ${BUDGET.agentsMd}, the Next.js block not counted)`)
		const bytes = Buffer.byteLength(agentsMd)
		if (bytes > BUDGET.agentsMdBytes) err(agentsMdPath, 1, `AGENTS.md is ${bytes} bytes (max ${BUDGET.agentsMdBytes} — Antigravity's per-file limit)`)
		const h2 = [...body.matchAll(/^## (.+)$/gm)].map(m => m[1]!.trim().toLowerCase())
		for (const s of SKELETON) if (!h2.some(h => h.endsWith(s.toLowerCase()))) err(agentsMdPath, 1, `missing the skeleton heading "## ${s}"`)
		for (const { target, line } of linksOf(agentsMd))
			if (/(^|\/)\.claude\/(skills|rules)\//.test(target))
				err(agentsMdPath, line, `links ${target} — link a skill at its source in .agents/skills; .claude/rules is retired`)
	}

	// CLAUDE.md files are shims; nested AGENTS.md files have one beside them
	const shimCheck = (file: string) => {
		const text = fs.readFileSync(file, 'utf8')
		if (firstLine(text).trim() !== '@AGENTS.md') {
			err(file, 1, 'must start with "@AGENTS.md" — CLAUDE.md is a shim; move its content into the AGENTS.md beside it')
			return
		}
		const lines = text.split('\n').length
		if (lines > BUDGET.shim) err(file, lines, `${rel(file)} is ${lines} lines (max ${BUDGET.shim}) — only Claude-only notes belong here`)
		const h2 = [...text.matchAll(/^## (.+)$/gm)].map(m => m[1]!.trim().toLowerCase())
		for (const s of SKELETON) if (h2.some(h => h.endsWith(s.toLowerCase()))) err(file, 1, `"## ${s}" belongs in AGENTS.md, not the CLAUDE.md shim`)
	}
	const claudeMdPath = path.join(root, 'CLAUDE.md')
	if (!fs.existsSync(claudeMdPath)) err(claudeMdPath, 1, 'missing — a one-line "@AGENTS.md" shim, so Claude Code loads AGENTS.md on every surface')
	else shimCheck(claudeMdPath)
	const nestedClaude = files.filter(f => path.basename(f) === 'CLAUDE.md' && f !== 'CLAUDE.md' && !skipped(f))
	for (const f of nestedClaude) {
		const file = path.join(root, f)
		if (!fs.existsSync(file)) continue
		if (f === '.claude/CLAUDE.md') {
			err(file, 1, 'retired: the root CLAUDE.md is the one shim')
			continue
		}
		if (!fs.existsSync(path.join(path.dirname(file), 'AGENTS.md'))) err(file, 1, `no AGENTS.md beside it — move its content into ${path.dirname(f)}/AGENTS.md and keep this file as the shim`)
		shimCheck(file)
	}
	const rootBytes = Buffer.byteLength(agentsMd)
	for (const f of files.filter(f => path.basename(f) === 'AGENTS.md' && f !== 'AGENTS.md' && !skipped(f))) {
		const file = path.join(root, f)
		if (!fs.existsSync(file)) continue
		const text = fs.readFileSync(file, 'utf8')
		const body = withoutNext(text)
		if (!body.trim()) {
			err(file, 1, `holds only the Next.js block — gitignore ${f}; next dev writes it for itself`)
			continue
		}
		if (!fs.existsSync(path.join(path.dirname(file), 'CLAUDE.md'))) err(file, 1, `no CLAUDE.md shim beside it — Claude Code loads ${f} through ${path.dirname(f)}/CLAUDE.md ("@AGENTS.md")`)
		const lines = body.split('\n').length
		if (lines > BUDGET.agentsMd) err(file, lines, `${f} is ${lines} lines (max ${BUDGET.agentsMd}) — move detail to a skill with paths:`)
		else if (lines > BUDGET.projectAgentsMdTarget) notes.push(`${f}: ${lines} lines (target ≤ ${BUDGET.projectAgentsMdTarget})`)
		const parts = f.split('/').slice(0, -1)
		let chain = rootBytes
		for (let i = 1; i <= parts.length; i++) {
			const p = path.join(root, ...parts.slice(0, i), 'AGENTS.md')
			if (fs.existsSync(p)) chain += fs.statSync(p).size
		}
		if (chain > BUDGET.chainBytes) err(file, 1, `AGENTS.md chain to ${f} is ${chain} bytes (Codex reads at most ${BUDGET.chainBytes})`)
	}
	for (const name of ['.claude', '.agents'] as const)
		for (const dir of nestedDirs(root, files, name))
			if (!skipped(dir)) err(path.join(root, dir), 1, `nested ${name}/ — a root session never loads it and nothing checks it; move its contents to the root ${name}/`)

	// Links and @imports
	for (const file of agentMarkdown(root, files)) {
		if (SKIP_UNDER.some(s => fs.realpathSync(file).includes(s))) continue
		const text = fs.readFileSync(file, 'utf8')
		for (const { target, line } of linksOf(text)) {
			if (isExternal(target)) continue
			const { file: to, anchor } = resolveLink(root, file, target)
			if (!fs.existsSync(to)) {
				err(file, line, `broken link ${target}`)
				continue
			}
			if (!anchor || fs.statSync(to).isDirectory()) continue
			const body = fs.readFileSync(to, 'utf8')
			const lineAnchor = anchor.match(/^L(\d+)/)
			if (lineAnchor ? Number(lineAnchor[1]) > body.split('\n').length : to.endsWith('.md') && !headings(body).has(anchor))
				err(file, line, `link ${target} points at a missing anchor`)
		}
		if (path.basename(file) === 'CLAUDE.md')
			text.split('\n').forEach((l, i) => {
				const m = l.match(/^@(\S+)\s*$/)
				if (!m) return
				const target = m[1]!.startsWith('~/') ? path.join(os.homedir(), m[1]!.slice(2)) : path.resolve(path.dirname(file), m[1]!)
				if (!fs.existsSync(target)) err(file, i + 1, `@import ${m[1]} does not resolve`)
			})
	}

	// Retired per-tool files, empty husks, broken symlinks
	for (const r of RETIRED) {
		const p = path.join(root, r)
		let exists = false
		try {
			fs.lstatSync(p)
			exists = true
		} catch {}
		if (exists) err(p, 1, 'retired: every tool reads AGENTS.md and .agents/skills — fold anything unique in, then delete')
	}
	for (const d of ['.agents', '.codex']) {
		const p = path.join(root, d)
		if (fs.existsSync(p) && fs.statSync(p).isDirectory() && !walkFiles(p).length) err(p, 1, `empty ${d}/ — a husk a tool import left; delete it`)
	}
	for (const base of [root, path.join(root, '.claude'), path.join(root, '.agents')]) {
		if (!fs.existsSync(base)) continue
		const entries = base === root ? fs.readdirSync(root).map(e => path.join(root, e)) : walkLinks(base)
		for (const p of entries) if (isLink(p) && !fs.existsSync(p)) err(p, 1, `broken symlink → ${fs.readlinkSync(p)}`)
	}

	// The repo-kit core
	const src = repoSrc(root)
	const inBundle = fs.existsSync(src.agentsDir) && fs.realpathSync(src.agentsDir) === fs.realpathSync(bundle)
	for (const item of CORE) {
		const at = item.block ? path.join(root, item.block) : path.join(src.agentsDir, item.stamp)
		if (!coreFiles(src, item).length) {
			err(at, 1, item.block ? `no repo-kit delivery block (${BLOCK_START}) — run /repo-kit align` : 'repo-kit core missing — run /repo-kit align')
			continue
		}
		const stamp = readStamp(src, item)
		if (!stamp) {
			err(at, 1, 'repo-kit core has no stamp line — reinstall it with /repo-kit align')
			continue
		}
		if (hashCore(src, item) !== stamp.hash)
			err(at, 1, `edited locally (kit ${stamp.version}) — change it in the repo-kit repo, or move repo-specific text to ${item.local ? `.agents/${item.local}` : 'the rest of AGENTS.md'}`)
		if (!inBundle) {
			const kit = readStamp(kitSrc(bundle), item)
			if (kit && kit.hash !== stamp.hash) err(at, 1, `outdated: repo ${stamp.version} vs kit ${kit.version} — run /repo-kit align`)
		}
	}

	// package.json wiring
	const pkgPath = path.join(root, 'package.json')
	if (fs.existsSync(pkgPath)) {
		const scripts = (JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts ?? {}) as Record<string, string>
		if (!scripts['check:agents']?.includes('.agents/skills/update-docs/scripts/check-agent-docs.ts'))
			err(pkgPath, 1, 'set "check:agents": "bun .agents/skills/update-docs/scripts/check-agent-docs.ts"')
		if (!scripts.gate?.includes('check:agents')) err(pkgPath, 1, 'add a "gate" script that ends with "bun run check:agents"')
	}

	return { errors, notes }
}

/** Every entry under a folder (worktrees skipped), symlinks reported rather than followed. */
const walkLinks = (dir: string): string[] =>
	fs.readdirSync(dir).flatMap(e => {
		const p = path.join(dir, e)
		if (e === 'worktrees') return []
		const st = fs.lstatSync(p)
		return st.isDirectory() && !st.isSymbolicLink() ? [p, ...walkLinks(p)] : [p]
	})

// ---------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------

if (import.meta.main) {
	const args = process.argv.slice(2)
	const flag = (name: string) => {
		const i = args.indexOf(name)
		return i >= 0 ? path.resolve(args[i + 1] ?? '.') : null
	}
	const target = flag('--install')
	if (target) {
		for (const line of install(target)) console.log(`installed ${line}`)
		console.log('next: wire package.json (check:agents, gate), add formatter ignores, then run bun run check:agents')
		process.exit(0)
	}
	const root = flag('--root') ?? process.cwd()
	const { errors, notes } = check(root)
	for (const n of notes) console.log(`note  ${n}`)
	for (const e of errors) console.log(`error ${e}`)
	console.log(errors.length ? `\n${errors.length} error(s) — the standard: .agents/skills/update-docs/SKILL.md` : '\ncheck:agents clean')
	process.exit(errors.length ? 1 : 0)
}
