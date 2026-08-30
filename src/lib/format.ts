import { PUBLIC_API_URL } from '$env/static/public';
import type { ModelMeta } from './types';

/**
 * Insert a space before each new capitalized word so CamelCase task type
 * identifiers read naturally in the UI. The backend canonicalises these to
 * CamelCase ("BitextMining") so per-type column keys line up with
 * `tasksMeta[].type` across filter / table / chart code; this is the one
 * place that humanises the same string for display.
 *
 * Examples:
 *   "BitextMining"          -> "Bitext Mining"
 *   "InstructionReranking"  -> "Instruction Reranking"
 *   "STS"                   -> "STS"
 *   "Classification"        -> "Classification"
 */
export function humanizeType(s: string): string {
	return s.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

// Canonical visual order for modality chips across every card / hero
// (`video → audio → image → text`). Heaviest medium first so the most
// distinctive marker reads earliest; unknown modalities sort after the
// canonical ones, alphabetically among themselves. Pure / stable: never
// mutates the input array.
const MODALITY_ORDER: Record<string, number> = {
	video: 0,
	audio: 1,
	image: 2,
	text: 3
};
export function sortModalities<T extends string>(mods: readonly T[] | undefined): T[] {
	if (!mods) return [];
	return [...mods].sort((a, b) => {
		const ai = MODALITY_ORDER[a] ?? 99;
		const bi = MODALITY_ORDER[b] ?? 99;
		if (ai !== bi) return ai - bi;
		return a.localeCompare(b);
	});
}

/**
 * Required modalities (e.g. a benchmark's or task's) the model can't encode.
 * Empty when the model covers everything required, or when nothing is
 * required. `modelModalities` defaults to `["text"]` when empty/missing —
 * mirrors the backend's own default (see `ModelMeta.modalities` in types.ts)
 * so a model with an omitted field isn't flagged against a text-only
 * benchmark.
 *
 * Surfaces cases like a text-only model ranked on a benchmark whose corpus
 * is image+text (e.g. ViDoRe) — the model can't have "seen" the images, so
 * its score likely comes from an OCR/caption fallback rather than genuine
 * multimodal understanding.
 */
export function missingModalities(
	modelModalities: readonly string[] | undefined,
	requiredModalities: readonly string[] | undefined
): string[] {
	if (!requiredModalities || requiredModalities.length === 0) return [];
	const have = new Set(modelModalities?.length ? modelModalities : ['text']);
	return requiredModalities.filter((m) => !have.has(m));
}

/**
 * Resolve an API-relative URL (one starting with "/") against PUBLIC_API_URL.
 * Absolute URLs and empty/null inputs pass through unchanged. Used so the
 * backend can serve cache-friendly proxy paths (e.g. /v1/icon/<name>) without
 * the frontend having to know the API origin at every consumer.
 */
export function apiUrl(path: string | null | undefined): string | undefined {
	if (!path) return undefined;
	if (/^https?:\/\//i.test(path)) return path;
	const base = PUBLIC_API_URL?.trim().replace(/\/$/, '') ?? '';
	if (!base) return path; // offline build — return as-is, will 404 but harmlessly
	return `${base}${path.startsWith('/') ? path : '/' + path}`;
}

/**
 * A benchmark icon may be a URL (flag SVG, hosted PNG, our /v1/icon proxy path)
 * or short text/emoji ("🌍"). URLs get rendered as <img>; everything else
 * is rendered as text in the consumer's UI.
 */
export function isIconUrl(icon: string | null | undefined): boolean {
	if (!icon) return false;
	return icon.startsWith('/') || /^(https?:|data:)/i.test(icon);
}

/**
 * URL-safe form of a benchmark / model / task name for use in route paths
 * (e.g. ``/models/{slug(name)}``). Benchmark names contain parens, commas,
 * and spaces — ``encodeURIComponent`` covers them all. Identical helper
 * was inlined in 7 components before this was extracted.
 */
export function slug(name: string): string {
	return encodeURIComponent(name);
}

// Preserves `/` in HuggingFace-style `org/name`. Strips edge slashes — SvelteKit's
// `resolve()` rejects rest-param values with leading/trailing slashes.
export function modelPath(name: string): string {
	return name
		.replace(/^\/+|\/+$/g, '')
		.split('/')
		.map((segment) => encodeURIComponent(segment))
		.join('/');
}

/**
 * Stable per-row identifier for tables that may hold experiment-variant rows.
 *
 * Multiple rows can share the same ``model.name`` when the backend emits
 * experiment ablations (one row per kwargs combination). The Svelte ``{#each}``
 * key, pin store, and any other identity-keyed map needs a string that's
 * unique per (model, experiments) pair.
 *
 * Base rows return ``model.name`` unchanged so legacy ``?pin=org/name`` URL
 * params (and any code that still passes the raw name) keep working.
 * Variant rows append ``"::"`` + a deterministic kwargs serialisation that
 * matches the backend's variant id (sorted keys, ``__`` between pairs, ``_``
 * between key and value).
 */
export function rowId(row: {
	model: { name: string };
	experiments?: Record<string, unknown> | null;
}): string {
	const exp = row.experiments;
	if (!exp) return row.model.name;
	const keys = Object.keys(exp);
	if (keys.length === 0) return row.model.name;
	const serialized = keys
		.slice()
		.sort()
		.map((k) => `${k}_${exp[k]}`)
		.join('__');
	return `${row.model.name}::${serialized}`;
}

/** Tabular integer with locale grouping, em-dash for falsy values. */
export function fmtInt(n: number | null | undefined): string {
	return n ? n.toLocaleString() : '—';
}

/**
 * Compact integer formatting for dense UI strips: 1234 → "1.2k", 1000000 → "1M".
 * Falsy values render as ``'0'`` (callers usually guard with a length check
 * before showing the stat at all). Used by the benchmark cards' stats-line
 * so massive multilingual benchmarks (1000+ languages, 300+ models) still
 * fit on one row without forcing the layout to wrap.
 */
const COMPACT_FMT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export function fmtCompact(n: number | null | undefined): string {
	if (!n) return '0';
	if (n < 1000) return n.toString();
	return COMPACT_FMT.format(n);
}

/**
 * Shared `Intl.Collator` — ~2x the throughput of `String.prototype.localeCompare`
 * because it avoids the per-call options-parsing cost. Use for any non-trivial
 * (>50 items) sort and for hot per-keystroke comparators.
 */
export const COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base' });

export interface ModelLanguageSummary {
	label: string;
	title: string;
	ariaLabel: string;
}

/** Compact language scope for model cards, with the full list in a tooltip. */
export function summarizeModelLanguages(
	languages: readonly string[] | null | undefined
): ModelLanguageSummary | null {
	const unique = [
		...new Set((languages ?? []).map((language) => language.trim()).filter(Boolean))
	].sort(COLLATOR.compare);
	if (unique.length === 0) return null;

	const title = unique.join(', ');
	if (unique.length === 1) {
		return {
			label: 'Monolingual',
			title,
			ariaLabel: `Supported language: ${title}`
		};
	}

	return {
		label: 'Multilingual',
		title,
		ariaLabel: `Supported languages: ${title}`
	};
}

/**
 * Lowercased "name\ndisplayName\norg" key for a model — substring search in
 * the name-query filter hits this single string instead of three separate
 * `.toLowerCase()` calls per row per keystroke. Memoised by `ModelMeta`
 * identity so a row that survives multiple keystrokes pays the cost once.
 */
const _modelSearchKeyCache = new WeakMap<ModelMeta, string>();
export function modelSearchKey(m: ModelMeta): string {
	let v = _modelSearchKeyCache.get(m);
	if (v === undefined) {
		v = `${m.name}\n${m.displayName}\n${m.org}`.toLowerCase();
		_modelSearchKeyCache.set(m, v);
	}
	return v;
}

/**
 * Split a parameter count (in billions) into a value + unit pair, so
 * tables can right-align the number and left-align the unit. ``0`` /
 * ``null`` / ``undefined`` → ``("—", "")``; ``≥1`` keeps billions;
 * ``<1`` switches to millions. The backend emits ``null`` for
 * proprietary models with no declared param count.
 */
export function fmtParamsValue(b: number | null | undefined): string {
	if (!b) return '—';
	if (b >= 1) return b.toFixed(1);
	return (b * 1000).toFixed(0);
}
export function fmtParamsUnit(b: number | null | undefined): string {
	if (!b) return '';
	return b >= 1 ? 'B' : 'M';
}

/**
 * One-string formatter for billion-scale params. `sep` lets callers pick
 * tight (`"1.5B"`, default) or spaced (`"1.5 B"`) units; the spaced form
 * suits the hover-card layout. Returns `"—"` for null/0.
 */
export function fmtParamsCompact(b: number | null | undefined, sep = ''): string {
	if (!b) return '—';
	return b >= 1 ? `${b.toFixed(1)}${sep}B` : `${(b * 1000).toFixed(0)}${sep}M`;
}

/** Direction of a sortable column. */
export type SortDir = 'asc' | 'desc';

/**
 * Glyph shown in a sortable column header. ``↑`` / ``↓`` when active,
 * ``inactiveGlyph`` (default ``↕``, SummaryTable uses ``''``) otherwise.
 */
export function sortIcon<K extends string>(
	key: K,
	activeKey: K | null,
	dir: SortDir,
	inactiveGlyph = '↕'
): string {
	if (activeKey !== key) return inactiveGlyph;
	return dir === 'asc' ? '↑' : '↓';
}

/** `aria-sort` value for a sortable `<th>` — active column gets the live direction. */
export function ariaSort<K extends string>(
	key: K,
	activeKey: K | null,
	dir: SortDir
): 'ascending' | 'descending' | 'none' {
	if (activeKey !== key) return 'none';
	return dir === 'asc' ? 'ascending' : 'descending';
}

/**
 * Score formatted as a 2-decimal percentage (``0.7613`` → ``"76.13"``).
 * ``null``/``undefined`` becomes ``"—"`` so cells with missing data
 * render as a clear placeholder instead of ``"NaN"``.
 */
/**
 * Split a canonical ``org/name`` HuggingFace identifier into its two
 * segments. The API never ships ``org`` / ``displayName`` separately on
 * lightweight payloads (e.g. `LeaderModel`) — consumers derive them
 * here so the wire stays tight. Returns ``{ org: '', displayName: name }``
 * when no slash is present.
 */
export function splitModelName(name: string): { org: string; displayName: string } {
	const i = name.indexOf('/');
	if (i < 0) return { org: '', displayName: name };
	return { org: name.slice(0, i), displayName: name.slice(i + 1) };
}

export function fmtPct(score: number | null | undefined): string {
	if (score == null) return '—';
	return (score * 100).toFixed(2);
}

/** Real value vs the em-dash / NA placeholder used by ``fmtPct``/``fmtInt``. */
export function hasValue(s: string): boolean {
	return s !== '—' && s !== '⚠️ NA';
}

/**
 * Zero-shot percentage label. ``-1`` is the "unknown" sentinel from the API
 * — rendered as a warning marker so the user knows the value is missing
 * rather than zero. Shared across SummaryTable, BenchScoreTable, ModelHoverPortal.
 */
export function fmtZeroShot(pct: number): string {
	if (pct === -1) return '⚠️ NA';
	return `${pct.toFixed(0)}%`;
}

/**
 * Heat-shading class for a score cell, normalised against the column's own
 * [min, max] range. The strongest cell in a column gets ~55 % primary tint;
 * the weakest gets 0 %. Returns ``heat-N`` (matching the static rules in
 * ``app.css``) or ``''`` for null / out-of-range inputs.
 *
 * Was previously an inline ``style="background-color: …"`` string per cell —
 * static classes let the browser's style cache dedupe, where unique inline
 * styles per cell couldn't be shared at scale.
 */
export function heat(score: number | null | undefined, min: number, max: number): string {
	if (score == null) return '';
	if (!Number.isFinite(min) || !Number.isFinite(max)) return '';
	if (max <= min) return '';
	const ratio = Math.max(0, Math.min(1, (score - min) / (max - min)));
	const pct = Math.round(ratio * 55);
	if (pct === 0) return '';
	return `heat-${pct}`;
}

/**
 * Default sort direction for a column. Names / ranks read more
 * naturally ascending (A→Z, 1→N); numeric score columns read better
 * descending (best first). Pass the list of keys that should default
 * to ``'asc'``; everything else defaults to ``'desc'``.
 */
export function defaultDirFor<K extends string>(key: K, ascKeys: readonly K[]): SortDir {
	return ascKeys.includes(key) ? 'asc' : 'desc';
}

/**
 * Max numeric value in an array that may include ``null`` / ``undefined``.
 * Returns ``0`` when no numbers are present so the result is safe to
 * use as a denominator (the matching ``heat`` helper short-circuits on
 * non-positive max).
 */
export function maxOf(vs: readonly (number | null | undefined)[]): number {
	let max = -Infinity;
	let seen = false;
	for (const v of vs) {
		if (typeof v !== 'number') continue;
		if (v > max) max = v;
		seen = true;
	}
	return seen ? max : 0;
}

/**
 * Min numeric value in an array that may include ``null`` / ``undefined``.
 * Returns ``0`` when no numbers are present. The matching ``heat``
 * helper short-circuits when min ≥ max, so degenerate inputs render
 * as un-tinted cells.
 */
export function minOf(vs: readonly (number | null | undefined)[]): number {
	let min = Infinity;
	let seen = false;
	for (const v of vs) {
		if (typeof v !== 'number') continue;
		if (v < min) min = v;
		seen = true;
	}
	return seen ? min : 0;
}

/**
 * For every key in ``keys``, the max value across ``rows`` looked up
 * via ``getValue``. Used by leaderboard tables to highlight the
 * best-in-column score (per task, per task-type, per language).
 * Missing values (``undefined``) are skipped; if a column has no
 * values at all the result entry is ``-Infinity``.
 */
export function bestPerColumn<R, K extends string>(
	keys: readonly K[],
	rows: readonly R[],
	getValue: (row: R, key: K) => number | undefined
): Record<string, number> {
	const best: Record<string, number> = {};
	for (const k of keys) {
		let max = -Infinity;
		for (const r of rows) {
			const v = getValue(r, k);
			if (v !== undefined && v > max) max = v;
		}
		best[k] = max;
	}
	return best;
}

/**
 * Mirror of ``bestPerColumn`` for the *worst* value in each column.
 * Used as the lower bound when computing heat-shading against the
 * column's own [min, max] range. Empty columns yield ``+Infinity``.
 */
export function worstPerColumn<R, K extends string>(
	keys: readonly K[],
	rows: readonly R[],
	getValue: (row: R, key: K) => number | undefined
): Record<string, number> {
	const worst: Record<string, number> = {};
	for (const k of keys) {
		let min = Infinity;
		for (const r of rows) {
			const v = getValue(r, k);
			if (v !== undefined && v < min) min = v;
		}
		worst[k] = min;
	}
	return worst;
}

/**
 * Single-pass version of ``bestPerColumn`` + ``worstPerColumn``. Tables
 * always need both bounds (the best cell for the bold-highlight, both
 * bounds for the heat ramp), so combining halves the row × column work.
 */
export function bestWorstPerColumn<R, K extends string>(
	keys: readonly K[],
	rows: readonly R[],
	getValue: (row: R, key: K) => number | undefined
): { best: Record<string, number>; worst: Record<string, number> } {
	const best: Record<string, number> = {};
	const worst: Record<string, number> = {};
	for (const k of keys) {
		let mn = Infinity;
		let mx = -Infinity;
		for (const r of rows) {
			const v = getValue(r, k);
			if (v === undefined) continue;
			if (v < mn) mn = v;
			if (v > mx) mx = v;
		}
		best[k] = mx;
		worst[k] = mn;
	}
	return { best, worst };
}

/**
 * Three-state sort click handler used by every leaderboard table.
 *  1. New column → activate, use ``defaultDir(key)``.
 *  2. Same column, still at the default direction → flip.
 *  3. Same column, already flipped → clear (return null key).
 *
 * Returns the next ``{ key, dir }`` instead of mutating, so callers
 * stay in control of the reactive ``$state`` writes.
 */
export function nextSort<K extends string>(
	clickedKey: K,
	currentKey: K | null,
	currentDir: SortDir,
	defaultDir: (k: K) => SortDir
): { key: K | null; dir: SortDir } {
	if (currentKey !== clickedKey) {
		return { key: clickedKey, dir: defaultDir(clickedKey) };
	}
	if (currentDir === defaultDir(clickedKey)) {
		return { key: clickedKey, dir: currentDir === 'asc' ? 'desc' : 'asc' };
	}
	return { key: null, dir: currentDir };
}

/**
 * Partition `rows` so pinned ones come first, others keep their order.
 * Returns the input array unchanged when nothing is pinned. Callers should
 * pass `pinnedCount` (typically `pinnedModels.size`) so the helper can
 * short-circuit before walking every row — the common-case state is zero
 * pins, where the partition pass would be pure waste.
 */
export function floatPinnedToTop<T>(
	rows: readonly T[],
	isPinned: (r: T) => boolean,
	pinnedCount?: number
): T[] {
	if (rows.length === 0 || pinnedCount === 0) return rows as T[];
	const pinned: T[] = [];
	const unpinned: T[] = [];
	for (const r of rows) (isPinned(r) ? pinned : unpinned).push(r);
	if (pinned.length === 0) return rows as T[];
	return [...pinned, ...unpinned];
}
