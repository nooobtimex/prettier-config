/**
 * check-agent-docs — the repo-kit gate for agent instructions (`bun run check:agents`).
 *
 * Holds CLAUDE.md and `.claude/{skills,rules,agents}` to the standard in `../SKILL.md`: frontmatter parses
 * with a real YAML parser and uses known keys, `name` matches its folder, every description carries a
 * "Use when" trigger, size budgets hold, links and `@imports` resolve, bundled files are reachable from
 * their skill, retired cross-tool files are gone, no symlink is broken, the repo-kit core is unedited,
 * and package.json wires the gate.
 *
 *   bun .claude/skills/update-docs/scripts/check-agent-docs.ts          check the repo in the cwd
 *   bun <kit>/payload/claude/skills/update-docs/scripts/check-agent-docs.ts --root <repo>
 *                                                                      the same, plus "outdated" vs the kit
 *   bun <kit>/payload/claude/skills/update-docs/scripts/check-agent-docs.ts --install <repo>
 *                                                                      copy the core into <repo>/.claude
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

type CoreItem = { path: string; stamp: string; local?: string }

export const CORE: CoreItem[] = [
	{ path: 'rules/delivery.md', stamp: 'rules/delivery.md' },
	{ path: 'skills/update-docs', stamp: 'skills/update-docs/SKILL.md', local: 'skills/update-docs/local.md' },
]

const STAMP_RX = /^<!-- repo-kit: version=(\S+) hash=([0-9a-f]{12}) -->$/m
const STAMP_BLANK = '<!-- repo-kit -->'
// The uploaded bundle renames nested SKILL.md files so claude.ai does not register them as skills.
const TEMPLATE_NAME = 'SKILL.template.md'

const normalizeRel = (rel: string) => rel.split(path.sep).join('/').replace(/SKILL\.template\.md$/, 'SKILL.md')

const resolveCoreFile = (claudeDir: string, rel: string) => {
	const direct = path.join(claudeDir, rel)
	if (fs.existsSync(direct) || !rel.endsWith('SKILL.md')) return direct
	return path.join(claudeDir, rel.replace(/SKILL\.md$/, TEMPLATE_NAME))
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

/** Files of a core item relative to the `.claude` dir, normalised, sorted, `local` excluded. */
const coreFiles = (claudeDir: string, item: CoreItem): string[] => {
	const root = path.join(claudeDir, item.path)
	if (!fs.existsSync(root)) return []
	if (!fs.statSync(root).isDirectory()) return [item.path]
	return walkFiles(root)
		.map(rel => normalizeRel(path.join(item.path, rel)))
		.filter(rel => rel !== item.local)
		.sort()
}

export const hashCore = (claudeDir: string, item: CoreItem): string => {
	const h = createHash('sha256')
	for (const rel of coreFiles(claudeDir, item)) {
		const text = fs.readFileSync(resolveCoreFile(claudeDir, rel), 'utf8').replace(/\r\n/g, '\n').replace(STAMP_RX, STAMP_BLANK)
		h.update(`${rel}\0${text}\0`)
	}
	return h.digest('hex').slice(0, 12)
}

export const readStamp = (claudeDir: string, item: CoreItem): { version: string; hash: string } | null => {
	const file = resolveCoreFile(claudeDir, item.stamp)
	if (!fs.existsSync(file)) return null
	const m = fs.readFileSync(file, 'utf8').match(STAMP_RX)
	return m ? { version: m[1]!, hash: m[2]! } : null
}

/** Rewrites the stamp line when the content hash changed. Returns true when it wrote. */
export const writeStamp = (claudeDir: string, item: CoreItem, version: string): boolean => {
	const hash = hashCore(claudeDir, item)
	const current = readStamp(claudeDir, item)
	if (current?.hash === hash) return false
	const file = resolveCoreFile(claudeDir, item.stamp)
	const text = fs.readFileSync(file, 'utf8')
	const line = `<!-- repo-kit: version=${version} hash=${hash} -->`
	fs.writeFileSync(file, STAMP_RX.test(text) ? text.replace(STAMP_RX, line) : `${text.replace(/\n*$/, '\n')}\n${line}\n`)
	return true
}

/** Copies the core from the `.claude` dir this script lives in into `<repo>/.claude`; keeps `local` files. */
export const install = (repo: string, fromClaudeDir = bundleClaudeDir()): string[] => {
	const done: string[] = []
	for (const item of CORE) {
		for (const rel of coreFiles(fromClaudeDir, item)) {
			const target = path.join(repo, '.claude', rel)
			fs.mkdirSync(path.dirname(target), { recursive: true })
			fs.copyFileSync(resolveCoreFile(fromClaudeDir, rel), target)
			done.push(`.claude/${rel}`)
		}
		if (item.local && !fs.existsSync(path.join(repo, '.claude', item.local))) {
			fs.copyFileSync(path.join(fromClaudeDir, item.local), path.join(repo, '.claude', item.local))
			done.push(`.claude/${item.local} (new — fill in this repo's sync map)`)
		}
	}
	return done
}

const bundleClaudeDir = () => path.resolve(import.meta.dir, '../../..')

// ---------------------------------------------------------------------------------------------------
// The standard
// ---------------------------------------------------------------------------------------------------

const SKILL_KEYS = new Set([
	'name', 'description', 'when_to_use', 'argument-hint', 'arguments', 'disable-model-invocation',
	'user-invocable', 'allowed-tools', 'disallowed-tools', 'model', 'effort', 'context', 'agent',
	'background', 'hooks', 'paths', 'shell', 'license', 'compatibility', 'metadata',
])
const RULE_KEYS = new Set(['paths', 'description'])
const CLAUDE_MD_SKELETON = ['Safety', 'Delivery contract', 'Read before you edit', 'Repository map', 'Further reading']
const RETIRED = ['AGENTS.md', 'CODEX.md', 'GEMINI.md', '.cursorrules', '.cursor', '.agents', '.codex', '.claude/commands']
const BUNDLED_DIRS = ['references', 'scripts', 'assets', 'templates']
const SKIP_LINKS_UNDER = ['/templates/', '/payload/']
const BUDGET = { claudeMd: 200, skillTarget: 150, skillMax: 500, desc: 1024, listing: 1536 }

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

const agentMarkdown = (root: string): string[] => {
	const nested = listRepoFiles(root).filter(f => path.basename(f) === 'CLAUDE.md' && f !== 'CLAUDE.md')
	const out = [...new Set(['CLAUDE.md', '.claude/CLAUDE.md', ...nested])].map(f => path.join(root, f)).filter(f => fs.existsSync(f))
	const claude = path.join(root, '.claude')
	if (fs.existsSync(claude))
		out.push(
			...walkFiles(claude)
				.filter(f => f.endsWith('.md') && !f.startsWith('worktrees'))
				.map(f => path.join(claude, f)),
		)
	return out
}

export const check = (root: string, bundle = bundleClaudeDir()): Result => {
	const errors: string[] = []
	const notes: string[] = []
	const rel = (f: string) => path.relative(root, f) || f
	const err = (f: string, line: number, msg: string) => errors.push(`${rel(f)}:${line} ${msg}`)
	const files = listRepoFiles(root, ['-co', '--exclude-standard']).filter(f => !f.startsWith('.claude/worktrees/'))
	const matches = (patterns: string[]) => patterns.some(p => files.some(f => new Glob(p).match(f)))
	const claudeMdPath = path.join(root, 'CLAUDE.md')
	const claudeMd = fs.existsSync(claudeMdPath) ? fs.readFileSync(claudeMdPath, 'utf8') : ''

	// Skills
	const skillsDir = path.join(root, '.claude', 'skills')
	if (fs.existsSync(skillsDir) && fs.lstatSync(skillsDir).isSymbolicLink())
		err(skillsDir, 1, '.claude/skills must be a real directory (symlink only individual skill folders)')
	const skills = fs.existsSync(skillsDir)
		? fs.readdirSync(skillsDir).filter(d => fs.existsSync(path.join(skillsDir, d, 'SKILL.md')))
		: []
	for (const name of skills) {
		const dir = path.join(skillsDir, name)
		const file = path.join(dir, 'SKILL.md')
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
		if (claudeMd && !claudeMd.includes(`skills/${name}/SKILL.md`)) err(claudeMdPath, 1, `does not link the skill .claude/skills/${name}/SKILL.md`)

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

	// Rules and agents
	const rulesDir = path.join(root, '.claude', 'rules')
	const rules = fs.existsSync(rulesDir) ? walkFiles(rulesDir).filter(f => f.endsWith('.md')) : []
	for (const r of rules) {
		const file = path.join(rulesDir, r)
		const fm = frontmatter(fs.readFileSync(file, 'utf8'))
		if (fm.error) err(file, 1, fm.error)
		if (fm.data) {
			for (const line of plainScalarComments(fm.raw)) err(file, line, 'unquoted value contains " #" — quote it')
			for (const key of Object.keys(fm.data)) if (!RULE_KEYS.has(key)) err(file, 1, `unknown rule frontmatter key "${key}"`)
			const paths = typeof fm.data.paths === 'string' ? [fm.data.paths] : Array.isArray(fm.data.paths) ? fm.data.paths.map(String) : []
			if (paths.length && !matches(paths)) err(file, 1, `paths: ${paths.join(', ')} match no file in the repo`)
		}
		if (claudeMd && !claudeMd.includes(`rules/${r}`)) err(claudeMdPath, 1, `does not link the rule .claude/rules/${r}`)
	}
	const agentsDir = path.join(root, '.claude', 'agents')
	for (const a of fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir).filter(f => f.endsWith('.md')) : []) {
		const file = path.join(agentsDir, a)
		const fm = frontmatter(fs.readFileSync(file, 'utf8'))
		if (fm.error) err(file, 1, fm.error)
		else if (!fm.data?.name || !fm.data?.description) err(file, 1, 'subagent needs name and description')
	}

	// CLAUDE.md
	if (!claudeMd) err(claudeMdPath, 1, 'missing — start from the repo-kit CLAUDE.md template')
	else {
		const lines = claudeMd.split('\n').length
		if (lines > BUDGET.claudeMd) err(claudeMdPath, lines, `CLAUDE.md is ${lines} lines (max ${BUDGET.claudeMd})`)
		const h2 = [...claudeMd.matchAll(/^## (.+)$/gm)].map(m => m[1]!.trim().toLowerCase())
		for (const s of CLAUDE_MD_SKELETON)
			if (!h2.some(h => h.endsWith(s.toLowerCase()))) err(claudeMdPath, 1, `missing the skeleton heading "## ${s}"`)
	}

	// Links and @imports
	for (const file of agentMarkdown(root)) {
		if (SKIP_LINKS_UNDER.some(s => file.includes(s))) continue
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

	// Retired cross-tool files, broken symlinks
	for (const r of RETIRED) {
		const p = path.join(root, r)
		let exists = false
		try {
			fs.lstatSync(p)
			exists = true
		} catch {}
		if (exists) err(p, 1, 'retired: Claude-only repos keep instructions in CLAUDE.md and .claude/ — fold anything unique in, then delete')
	}
	for (const f of listRepoFiles(root))
		if (path.basename(f) === 'AGENTS.md' && f !== 'AGENTS.md') err(path.join(root, f), 1, 'tracked AGENTS.md — fold it into the CLAUDE.md beside it (next dev then upserts its block there instead)')
	const linkRoots = [root, path.join(root, '.claude')]
	for (const base of linkRoots) {
		if (!fs.existsSync(base)) continue
		const entries = base === root ? fs.readdirSync(root).map(e => path.join(root, e)) : walkLinks(base)
		for (const p of entries)
			if (fs.lstatSync(p).isSymbolicLink() && !fs.existsSync(p)) err(p, 1, `broken symlink → ${fs.readlinkSync(p)}`)
	}

	// The repo-kit core
	const claudeDir = path.join(root, '.claude')
	const inBundle = fs.existsSync(claudeDir) && fs.realpathSync(claudeDir) === fs.realpathSync(bundle)
	for (const item of CORE) {
		const at = path.join(claudeDir, item.stamp)
		if (!coreFiles(claudeDir, item).length) {
			err(path.join(claudeDir, item.path), 1, 'repo-kit core missing — run /repo-kit align')
			continue
		}
		const stamp = readStamp(claudeDir, item)
		if (!stamp) {
			err(at, 1, 'repo-kit core has no stamp line — reinstall it with /repo-kit align')
			continue
		}
		if (hashCore(claudeDir, item) !== stamp.hash)
			err(at, 1, `edited locally (kit ${stamp.version}) — change it in the repo-kit repo, or move repo-specific text to ${item.local ? `.claude/${item.local}` : 'CLAUDE.md'}`)
		if (!inBundle) {
			const kit = readStamp(bundle, item)
			if (kit && kit.hash !== stamp.hash) err(at, 1, `outdated: repo ${stamp.version} vs kit ${kit.version} — run /repo-kit align`)
		}
	}

	// package.json wiring
	const pkgPath = path.join(root, 'package.json')
	if (fs.existsSync(pkgPath)) {
		const scripts = (JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts ?? {}) as Record<string, string>
		if (!scripts['check:agents']) err(pkgPath, 1, 'add "check:agents": "bun .claude/skills/update-docs/scripts/check-agent-docs.ts"')
		if (!scripts.gate?.includes('check:agents')) err(pkgPath, 1, 'add a "gate" script that ends with "bun run check:agents"')
	}

	return { errors, notes }
}

/** Every entry under `.claude` (worktrees skipped), symlinks reported rather than followed. */
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
	console.log(errors.length ? `\n${errors.length} error(s) — the standard: .claude/skills/update-docs/SKILL.md` : '\ncheck:agents clean')
	process.exit(errors.length ? 1 : 0)
}
