import { untrack } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';

import type { BenchmarkSummary, CustomGrouping, ModelType, SummaryRow, TaskMeta } from '$lib/types';
import { modelSearchKey } from '$lib/format';
import { opennessMeets, OPENNESS_FILTERABLE } from '$lib/openness';
import { readParams, updateUrl } from '$lib/url-state';
import { createFacetFilter, type FacetFilter } from '$lib/stores/facet-filter.svelte';

export type ZeroShotMode = 'allow_all' | 'remove_unknown' | 'only_zero_shot';
export type Availability = 'both' | 'open' | 'proprietary';
export type InstructionMode = 'both' | 'only_instruction' | 'only_non_instruction';

// Model-size slider works in log10 of millions of params: 0 → 1M, 6 → 1T.
export const SIZE_LOG_MIN = 0;
export const SIZE_LOG_MAX = 6;
export const SIZE_MIN_M = 1; // 1M
export const SIZE_MAX_M = 1_000_000; // 1T in millions

export const MODEL_TYPES: ModelType[] = [
	'dense',
	'cross-encoder',
	'late-interaction',
	'sparse',
	'router'
];

export const MODEL_MODALITIES = ['text', 'image', 'audio', 'video'] as const;
export type ModelModality = (typeof MODEL_MODALITIES)[number];

// Hot-path constant — avoids allocating a fresh `['text']` per row.
const TEXT_ONLY: readonly string[] = ['text'];

interface FiltersState {
	// model-row filters (scalars)
	nameQuery: string;
	minModelSizeM: number;
	maxModelSizeM: number;
	// Inactive until the user moves the slider; once on, also drops unsized models.
	sizeActive: boolean;
	zeroShot: ZeroShotMode;
	availability: Availability;
	instructions: InstructionMode;
	sentenceTransformersOnly: boolean;
	// Slider bounds; fall back to global defaults when no benchmark is loaded.
	availableMinModelSizeM: number;
	availableMaxModelSizeM: number;
}

function defaultState(): FiltersState {
	return {
		nameQuery: '',
		minModelSizeM: SIZE_MIN_M,
		maxModelSizeM: SIZE_MAX_M,
		sizeActive: false,
		zeroShot: 'allow_all',
		availability: 'both',
		instructions: 'both',
		sentenceTransformersOnly: false,
		availableMinModelSizeM: SIZE_MIN_M,
		availableMaxModelSizeM: SIZE_MAX_M
	};
}

function createFilters() {
	const state = $state<FiltersState>(defaultState());
	// $state.raw because these are reassigned wholesale (never deep-mutated)
	// and contain hundreds of entries per Multilingual benchmark.
	let availableTaskTypes = $state.raw<string[]>([]);
	let availableDomains = $state.raw<string[]>([]);
	let availableModalities = $state.raw<string[]>([]);
	let availableLanguages = $state.raw<string[]>([]);
	let availableTasks = $state.raw<TaskMeta[]>([]);
	// Same-benchmark refetches (e.g. language-scoped) refresh available-* without
	// resetting user picks — otherwise toggling a language would loop.
	let lastBenchmarkName: string | null = null;

	// One FacetFilter per set-based facet. Universe accessors close over the
	// `available*` state above, so each facet stays consistent with the
	// currently loaded benchmark.
	const taskTypesFacet = createFacetFilter({
		urlParam: 'types',
		chipLabel: 'Task type',
		universe: () => availableTaskTypes
	});
	const domainsFacet = createFacetFilter({
		urlParam: 'doms',
		chipLabel: 'Domain',
		universe: () => availableDomains
	});
	const modalitiesFacet = createFacetFilter({
		urlParam: 'mods',
		chipLabel: 'Modality',
		universe: () => availableModalities
	});
	const languagesFacet = createFacetFilter({
		urlParam: 'langs',
		chipLabel: 'Lang',
		universe: () => availableLanguages
	});
	const tasksFacet = createFacetFilter({
		urlParam: 'tasks',
		chipLabel: 'Task',
		universe: () => availableTasks.map((t) => t.name)
	});
	const modelTypesFacet = createFacetFilter({
		urlParam: 'mtypes',
		chipLabel: 'Type',
		universe: () => MODEL_TYPES
	});
	const modelModalitiesFacet = createFacetFilter({
		urlParam: 'mmods',
		chipLabel: 'Modality',
		universe: () => MODEL_MODALITIES
	});
	// Pre-seed the two fixed-universe model facets so the default state
	// (everything selected) matches the legacy behaviour.
	modelTypesFacet.reset();
	modelModalitiesFacet.reset();

	// Openness requirements: a set of dimension ids the model must ALL satisfy
	// (AND semantics). Unlike the OR-facets above, empty = no filter and there
	// is no "all selected = off" shortcut. Managed directly (not a FacetFilter)
	// because the semantics differ.
	const opennessReqs = new SvelteSet<string>();

	// `scope` = benchmark-scope facets (driven by availableX, dropped on /models).
	// `model` = model-row facets (fixed universes).
	// `all` = everything that gets URL-synced + hydrated.
	const scopeFacets = [taskTypesFacet, domainsFacet, modalitiesFacet, languagesFacet, tasksFacet];
	const modelFacets = [modelTypesFacet, modelModalitiesFacet];
	const allFacets = [...modelFacets, ...scopeFacets];

	// Map for the public `toggleInSet`/`setAll` helpers — keeps FilterContent's
	// call sites unchanged after the refactor.
	type SetKey =
		| 'taskTypes'
		| 'domains'
		| 'modalities'
		| 'languages'
		| 'tasks'
		| 'modelTypes'
		| 'modelModalities';
	const facetByKey: Record<SetKey, FacetFilter> = {
		taskTypes: taskTypesFacet,
		domains: domainsFacet,
		modalities: modalitiesFacet,
		languages: languagesFacet,
		tasks: tasksFacet,
		modelTypes: modelTypesFacet,
		modelModalities: modelModalitiesFacet
	};

	function initFor(summary: BenchmarkSummary | null) {
		if (!summary) return;
		// Whole body runs inside `untrack` so calling this from an $effect
		// (the `/benchmark/[name]` page does exactly that) doesn't subscribe
		// the caller to any state read here. The facet helpers (`prune`,
		// `reset`, `seed`) all call `opts.universe()` — which reads the
		// `available*` arrays we just wrote — so without `untrack` the
		// caller-effect would subscribe to its own writes and loop on
		// `effect_update_depth_exceeded`. Writes still notify other
		// subscribers normally; `untrack` only blocks the read-subscription
		// edge.
		untrack(() => {
			const isNewBenchmark = lastBenchmarkName !== summary.benchmarkName;
			lastBenchmarkName = summary.benchmarkName;

			// Local accumulators — never reactive.
			/* eslint-disable svelte/prefer-svelte-reactivity */
			const domains = new Set<string>();
			const modalities = new Set<string>();
			const languageCount = new Map<string, number>();
			/* eslint-enable svelte/prefer-svelte-reactivity */
			for (const t of summary.tasksMeta) {
				for (const d of t.domains ?? []) domains.add(d);
				for (const m of t.modalities ?? []) modalities.add(m);
				for (const l of t.languages ?? []) languageCount.set(l, (languageCount.get(l) ?? 0) + 1);
			}
			const sortedDomains = [...domains].sort();
			const sortedModalities = [...modalities].sort();
			const sortedLanguages = [...languageCount.entries()]
				.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
				.map(([l]) => l);

			// Bracket slider bounds to the actual observed min/max — no "nice" rounding
			// outwards, otherwise a benchmark whose largest model is 7B shows a slider
			// edge at 10B and users think there are unloaded rows past the visible top.
			let lowM = Number.POSITIVE_INFINITY;
			let highM = 0;
			for (const row of summary.rows) {
				const b = row.model.totalParamsB;
				if (!b) continue;
				const m = b * 1000;
				if (m < lowM) lowM = m;
				if (m > highM) highM = m;
			}
			const hasSizes = highM > 0 && lowM !== Number.POSITIVE_INFINITY;
			const boundLow = hasSizes ? Math.max(SIZE_MIN_M, lowM) : SIZE_MIN_M;
			const boundHigh = hasSizes ? Math.min(SIZE_MAX_M, highM) : SIZE_MAX_M;

			availableTaskTypes = summary.taskTypes;
			availableTasks = summary.tasksMeta;
			availableDomains = sortedDomains;
			availableModalities = sortedModalities;
			// Languages only refresh on benchmark change so the language-scoped
			// refetch dedupe key stays stable.
			if (isNewBenchmark) {
				availableLanguages = sortedLanguages;
			}
			state.availableMinModelSizeM = boundLow;
			state.availableMaxModelSizeM = boundHigh;
			// Same-benchmark refetch: keep picks, just trim ones no longer in the
			// shrunk universe (otherwise sidebar shows e.g. "9/8").
			if (!isNewBenchmark) {
				for (const f of scopeFacets) f.prune();
				sync();
				return;
			}
			// New benchmark — reset every scope facet to its (just-updated) universe.
			for (const f of scopeFacets) f.reset();
			state.minModelSizeM = boundLow;
			state.maxModelSizeM = boundHigh;
			state.sizeActive = false;

			// Layer URL params on top so deep links restore the exact view.
			hydrateFromUrl();
			sync();
		});
	}

	function hydrateFromUrl() {
		const p = readParams();
		const q = p.get('q');
		if (q !== null) state.nameQuery = q;
		const min = p.get('minSize');
		const max = p.get('maxSize');
		if (min !== null || max !== null) {
			const minN = Number(min);
			const maxN = Number(max);
			if (Number.isFinite(minN)) state.minModelSizeM = minN;
			if (Number.isFinite(maxN)) state.maxModelSizeM = maxN;
			state.sizeActive = true;
		}
		const avail = p.get('avail');
		if (avail === 'open' || avail === 'proprietary' || avail === 'both') state.availability = avail;
		const inst = p.get('inst');
		if (inst === 'only_instruction' || inst === 'only_non_instruction' || inst === 'both') {
			state.instructions = inst;
		}
		const zs = p.get('zs');
		if (zs === 'allow_all' || zs === 'remove_unknown' || zs === 'only_zero_shot')
			state.zeroShot = zs;
		if (p.get('st') === '1') state.sentenceTransformersOnly = true;
		const openreq = p.get('openreq');
		if (openreq !== null) {
			opennessReqs.clear();
			const valid = new Set<string>(OPENNESS_FILTERABLE.map((d) => d.id));
			for (const id of openreq.split(',')) if (valid.has(id)) opennessReqs.add(id);
		}
		// Set facets: seed delegates to FacetFilter, which intersects URL values
		// with the current universe (silently drops unknowns from stale links).
		for (const f of allFacets) f.seed();
	}

	// Microtask-debounced URL sync. `untrack` prevents reactive subscribers
	// from binding to state reads when called from inside an $effect.
	let syncScheduled = false;
	function sync() {
		if (syncScheduled) return;
		syncScheduled = true;
		queueMicrotask(() => {
			syncScheduled = false;
			doSync();
		});
	}
	function doSync() {
		untrack(() => {
			const patch: Record<string, string | null> = {
				q: state.nameQuery || null,
				minSize: state.sizeActive ? String(state.minModelSizeM) : null,
				maxSize: state.sizeActive ? String(state.maxModelSizeM) : null,
				avail: state.availability !== 'both' ? state.availability : null,
				inst: state.instructions !== 'both' ? state.instructions : null,
				zs: state.zeroShot !== 'allow_all' ? state.zeroShot : null,
				st: state.sentenceTransformersOnly ? '1' : null,
				// Canonical order (not insertion order) so the URL is stable.
				openreq:
					opennessReqs.size > 0
						? OPENNESS_FILTERABLE.filter((d) => opennessReqs.has(d.id))
								.map((d) => d.id)
								.join(',')
						: null
			};
			for (const f of allFacets) patch[f.urlParam] = f.urlValue();
			updateUrl(patch);
		});
	}

	function resetModelFilters() {
		state.nameQuery = '';
		state.minModelSizeM = state.availableMinModelSizeM;
		state.maxModelSizeM = state.availableMaxModelSizeM;
		state.sizeActive = false;
		state.zeroShot = 'allow_all';
		state.availability = 'both';
		state.instructions = 'both';
		state.sentenceTransformersOnly = false;
		opennessReqs.clear();
		for (const f of modelFacets) f.reset();
		sync();
	}

	function resetCustomize() {
		for (const f of scopeFacets) f.reset();
		sync();
	}

	function toggleInSet(key: SetKey, name: string) {
		facetByKey[key].toggle(name);
		sync();
	}

	function setAll(key: SetKey, values: readonly string[], checked: boolean) {
		const f = facetByKey[key];
		f.picked.clear();
		if (checked) for (const v of values) f.picked.add(v);
		sync();
	}

	return {
		get nameQuery() {
			return state.nameQuery;
		},
		set nameQuery(v: string) {
			state.nameQuery = v;
			sync();
		},
		get minModelSizeM() {
			return state.minModelSizeM;
		},
		set minModelSizeM(v: number) {
			state.minModelSizeM = v;
			state.sizeActive = true;
			sync();
		},
		get maxModelSizeM() {
			return state.maxModelSizeM;
		},
		set maxModelSizeM(v: number) {
			state.maxModelSizeM = v;
			state.sizeActive = true;
			sync();
		},
		get sizeActive() {
			return state.sizeActive;
		},
		get zeroShot() {
			return state.zeroShot;
		},
		set zeroShot(v: ZeroShotMode) {
			state.zeroShot = v;
			sync();
		},
		get availability() {
			return state.availability;
		},
		set availability(v: Availability) {
			state.availability = v;
			sync();
		},
		get instructions() {
			return state.instructions;
		},
		set instructions(v: InstructionMode) {
			state.instructions = v;
			sync();
		},
		get sentenceTransformersOnly() {
			return state.sentenceTransformersOnly;
		},
		set sentenceTransformersOnly(v: boolean) {
			state.sentenceTransformersOnly = v;
			sync();
		},
		// Openness requirements (AND). Returns the live SvelteSet for identity-
		// stable subscriptions; mutate via toggleOpennessReq / setAllOpennessReqs
		// so URL sync stays automatic.
		get opennessReqs(): SvelteSet<string> {
			return opennessReqs;
		},
		toggleOpennessReq(id: string) {
			if (opennessReqs.has(id)) opennessReqs.delete(id);
			else opennessReqs.add(id);
			sync();
		},
		setAllOpennessReqs(checked: boolean) {
			opennessReqs.clear();
			if (checked) for (const d of OPENNESS_FILTERABLE) opennessReqs.add(d.id);
			sync();
		},
		// Each get returns the underlying SvelteSet — same identity-preserving
		// contract the legacy store provided, so SummaryTable / FilterFacet
		// subscribers don't re-bind on every benchmark switch.
		get modelTypes(): SvelteSet<string> {
			return modelTypesFacet.picked;
		},
		get modelModalities(): SvelteSet<string> {
			return modelModalitiesFacet.picked;
		},
		get taskTypes(): SvelteSet<string> {
			return taskTypesFacet.picked;
		},
		get domains(): SvelteSet<string> {
			return domainsFacet.picked;
		},
		get modalities(): SvelteSet<string> {
			return modalitiesFacet.picked;
		},
		get languages(): SvelteSet<string> {
			return languagesFacet.picked;
		},
		get tasks(): SvelteSet<string> {
			return tasksFacet.picked;
		},
		get availableTaskTypes() {
			return availableTaskTypes;
		},
		get availableDomains() {
			return availableDomains;
		},
		get availableModalities() {
			return availableModalities;
		},
		get availableLanguages() {
			return availableLanguages;
		},
		get availableTasks() {
			return availableTasks;
		},
		get availableMinModelSizeM() {
			return state.availableMinModelSizeM;
		},
		get availableMaxModelSizeM() {
			return state.availableMaxModelSizeM;
		},
		// Facet instances exposed for chip / count derivations in FilterContent
		// (read-only — mutations still flow through toggleInSet / setAll so the
		// URL sync stays automatic).
		get modelFacets(): readonly FacetFilter[] {
			return modelFacets;
		},
		get scopeFacets(): readonly FacetFilter[] {
			return scopeFacets;
		},
		initFor,
		// Public for pages without a benchmark summary (e.g. /models); /benchmark
		// calls it implicitly inside initFor.
		hydrateFromUrl,
		resetModelFilters,
		resetCustomize,
		toggleInSet,
		setAll
	};
}

export const filters = createFilters();

function isFullSet(selected: Set<string>, available: string[]): boolean {
	// "Full" = no narrowing. Empty universe = always full; empty pick set on a
	// populated universe = explicit "exclude everything".
	if (available.length === 0) return true;
	if (selected.size === 0) return false;
	// Element-wise check (not size===size): a server-scoped refetch can shrink
	// the universe while the user's pick set keeps a different element of the
	// same size.
	return available.every((x) => selected.has(x));
}

// Static per-summary reverse lookup (dimension -> task name -> group label),
// built once from summary.customGroupings — it doesn't depend on the active
// filters, so it's cached separately rather than rebuilt on every filter
// change like tasksByType is. Backs the client-side scoresByCustomGroup
// recompute in narrowTasks/computeAgg below.
const _customGroupTaskLookupCache = new WeakMap<
	BenchmarkSummary,
	Map<string, Map<string, string>>
>();
function customGroupTaskLookup(summary: BenchmarkSummary): Map<string, Map<string, string>> {
	const cached = _customGroupTaskLookupCache.get(summary);
	if (cached) return cached;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const byDim = new Map<string, Map<string, string>>();
	for (const dim of summary.customGroupings ?? []) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const taskToLabel = new Map<string, string>();
		for (const g of dim.groups) {
			for (const t of g.tasks) taskToLabel.set(t, g.label);
		}
		byDim.set(dim.name, taskToLabel);
	}
	_customGroupTaskLookupCache.set(summary, byDim);
	return byDim;
}

// Cached per (summary, task-filter signature) so name-search keystrokes
// reuse the previous narrowing result.
interface NarrowingResult {
	signature: string;
	fullView: boolean;
	visibleTasks: TaskMeta[];
	taskTypesOut: string[];
	taskNamesOut: string[];
	tasksByType: Map<string, string[]>;
	// dimension name -> group label -> visible task names, intersected with
	// the current filter narrowing (empty in fullView — computeAgg isn't
	// called there, rows pass through summary.rows unchanged).
	customGroupTasksByLabel: Map<string, Map<string, string[]>>;
	// summary.customGroupings narrowed the same way taskTypesOut narrows
	// summary.taskTypes — a group with zero visible tasks drops out of its
	// dimension entirely; a dimension with zero remaining groups drops too.
	customGroupingsOut: CustomGrouping[];
	perRowAgg: WeakMap<
		SummaryRow,
		{
			meanTask: number | null;
			meanTaskType: number | null;
			scoresByTaskType: Record<string, number>;
			scoresByCustomGroup: Record<string, Record<string, number>>;
		}
	>;
	// Per-task sorted (name, score) lists — backs the Borda cache,
	// independent of the row filter (intersected at compute time).
	sortedByTask: Map<string, readonly { name: string; v: number }[]>;
}
const _narrowingCache = new WeakMap<BenchmarkSummary, NarrowingResult>();

function narrowTasks(summary: BenchmarkSummary, lenient: boolean): NarrowingResult {
	// Signature of every input that flips `fullView` or changes
	// `visibleTasks`; sets sorted so iteration order is stable.
	const sig = [
		lenient ? 'L' : 'S',
		[...filters.taskTypes].sort().join('|'),
		[...filters.domains].sort().join('|'),
		[...filters.modalities].sort().join('|'),
		[...filters.tasks].sort().join('|'),
		filters.availableDomains.length,
		filters.availableModalities.length
	].join('§');
	const cached = _narrowingCache.get(summary);
	if (cached && cached.signature === sig) return cached;

	const fullTypes = isFullSet(filters.taskTypes, summary.taskTypes);
	const fullDomains = isFullSet(filters.domains, filters.availableDomains);
	const fullModalities = isFullSet(filters.modalities, filters.availableModalities);
	const fullTasks = isFullSet(filters.tasks, summary.tasks);
	const fullView = fullTypes && fullDomains && fullModalities && fullTasks;

	let visibleTasks: TaskMeta[];
	let taskTypesOut: string[];
	let taskNamesOut: string[];
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const tasksByType = new Map<string, string[]>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const customGroupTasksByLabel = new Map<string, Map<string, string[]>>();
	let customGroupingsOut: CustomGrouping[];
	if (fullView) {
		visibleTasks = summary.tasksMeta;
		taskTypesOut = summary.taskTypes;
		taskNamesOut = summary.tasks;
		customGroupingsOut = summary.customGroupings ?? [];
	} else {
		visibleTasks = summary.tasksMeta.filter((t) => {
			if (!fullTypes && !filters.taskTypes.has(t.type)) return false;
			if (!fullDomains && !t.domains.some((d) => filters.domains.has(d))) return false;
			if (!fullModalities && !(t.modalities ?? []).some((m) => filters.modalities.has(m)))
				return false;
			if (!fullTasks && !filters.tasks.has(t.name)) return false;
			return true;
		});
		const visibleTaskNames = new Set(visibleTasks.map((t) => t.name));
		const visibleTaskTypes = new Set(visibleTasks.map((t) => t.type));
		taskTypesOut = summary.taskTypes.filter((t) => visibleTaskTypes.has(t));
		taskNamesOut = summary.tasks.filter((t) => visibleTaskNames.has(t));
		// Bucket once so the per-row aggregate loop is O(rows × visibleTasks).
		const customGroupTaskLookupByDim = customGroupTaskLookup(summary);
		for (const t of visibleTasks) {
			const arr = tasksByType.get(t.type);
			if (arr) arr.push(t.name);
			else tasksByType.set(t.type, [t.name]);

			for (const [dim, taskToLabel] of customGroupTaskLookupByDim) {
				const label = taskToLabel.get(t.name);
				if (label === undefined) continue;
				let byLabel = customGroupTasksByLabel.get(dim);
				if (!byLabel) {
					// eslint-disable-next-line svelte/prefer-svelte-reactivity
					byLabel = new Map();
					customGroupTasksByLabel.set(dim, byLabel);
				}
				const labelArr = byLabel.get(label);
				if (labelArr) labelArr.push(t.name);
				else byLabel.set(label, [t.name]);
			}
		}
		customGroupingsOut = (summary.customGroupings ?? [])
			.map((dim) => ({
				...dim,
				// Scoped groups (tasksComplete === false) have empty `tasks`, so
				// they never get a bucket below — always keep them (frozen, see
				// computeAgg) instead of reading that as "zero visible tasks".
				groups: dim.groups.filter(
					(g) =>
						g.tasksComplete === false ||
						(customGroupTasksByLabel.get(dim.name)?.get(g.label)?.length ?? 0) > 0
				)
			}))
			.filter((dim) => dim.groups.length > 0);
	}

	const result: NarrowingResult = {
		signature: sig,
		fullView,
		visibleTasks,
		taskTypesOut,
		taskNamesOut,
		tasksByType,
		customGroupTasksByLabel,
		customGroupingsOut,
		perRowAgg: new WeakMap(),
		sortedByTask: new Map()
	};
	_narrowingCache.set(summary, result);
	return result;
}

export function applyFilters(summary: BenchmarkSummary): BenchmarkSummary {
	// Empty language pick set = "exclude everything"; the backend's `?languages=`
	// treats it as no filter, so enforce the drop client-side.
	if (filters.availableLanguages.length > 0 && filters.languages.size === 0) {
		return {
			...summary,
			rows: [],
			tasks: [],
			tasksMeta: [],
			taskTypes: [],
			customGroupings: []
		};
	}
	// Language is server-scoped via `?languages=` — don't refilter client-side.
	const lenient =
		filters.languages.size > 0 && filters.languages.size < filters.availableLanguages.length;
	const narrow = narrowTasks(summary, lenient);
	const {
		fullView,
		visibleTasks,
		taskTypesOut,
		taskNamesOut,
		tasksByType,
		customGroupTasksByLabel,
		customGroupingsOut,
		perRowAgg
	} = narrow;

	// All tasks filtered out → drop rows too; otherwise the table renders model
	// names with all-`—` aggregates.
	if (!fullView && visibleTasks.length === 0) {
		return {
			...summary,
			rows: [],
			tasks: [],
			tasksMeta: [],
			taskTypes: [],
			customGroupings: []
		};
	}

	const q = filters.nameQuery.trim().toLowerCase();
	// Re-rank 1..N when an explicit filter narrows rows; name search alone is a
	// find-in-table gesture and keeps original ranks.
	const rowFilterActive =
		filters.availability !== 'both' ||
		filters.instructions !== 'both' ||
		filters.sentenceTransformersOnly ||
		filters.opennessReqs.size > 0 ||
		filters.modelTypes.size !== MODEL_TYPES.length ||
		filters.modelModalities.size !== MODEL_MODALITIES.length ||
		filters.sizeActive ||
		filters.zeroShot !== 'allow_all';
	const passesRowFilter = (row: SummaryRow): boolean => {
		const m = row.model;
		if (q && !modelSearchKey(m).includes(q)) return false;
		if (filters.availability === 'open' && !m.openWeights) return false;
		if (filters.availability === 'proprietary' && m.openWeights) return false;

		if (filters.instructions === 'only_instruction' && !m.instructionTuned) return false;
		if (filters.instructions === 'only_non_instruction' && m.instructionTuned) return false;

		if (filters.sentenceTransformersOnly && !m.sentenceTransformersCompatible) return false;

		if (filters.opennessReqs.size > 0 && !opennessMeets(m, filters.opennessReqs)) return false;

		if (!filters.modelTypes.has(m.modelType)) return false;

		if (filters.modelModalities.size < MODEL_MODALITIES.length) {
			const mm = m.modalities ?? TEXT_ONLY;
			let any = false;
			for (const x of mm) {
				if (filters.modelModalities.has(x)) {
					any = true;
					break;
				}
			}
			if (!any) return false;
		}

		// Active size filter also drops unsized (proprietary) models.
		if (filters.sizeActive) {
			if (m.totalParamsB == null || m.totalParamsB <= 0) return false;
			const paramsM = m.totalParamsB * 1000;
			if (paramsM < filters.minModelSizeM) return false;
			if (paramsM > filters.maxModelSizeM) return false;
		}

		if (filters.zeroShot === 'only_zero_shot' && row.zeroShotPct !== 100) return false;
		if (filters.zeroShot === 'remove_unknown' && row.zeroShotPct === -1) return false;

		return true;
	};

	let rows: SummaryRow[];
	if (fullView) {
		rows = summary.rows.filter(passesRowFilter);
	} else {
		// Strict (no language filter): every visible task must be present.
		// Lenient (language filter on): any present value contributes — matches
		// the backend's `_skipna_false_mean` policy.
		const meanOrNull = (sum: number, n: number, total: number): number | null => {
			if (lenient) return n > 0 ? sum / n : null;
			return total > 0 && n === total ? sum / total : null;
		};
		const computeAgg = (row: SummaryRow) => {
			let taskSum = 0;
			let taskN = 0;
			for (const t of taskNamesOut) {
				const v = row.scoresByTask[t];
				if (v !== undefined) {
					taskSum += v;
					taskN++;
				}
			}
			const meanTask = meanOrNull(taskSum, taskN, taskNamesOut.length);

			const scoresByTaskType: Record<string, number> = {};
			for (const tt of taskTypesOut) {
				const typeTasks = tasksByType.get(tt);
				if (!typeTasks || typeTasks.length === 0) continue;
				let typeSum = 0;
				let typeN = 0;
				for (const name of typeTasks) {
					const v = row.scoresByTask[name];
					if (v !== undefined) {
						typeSum += v;
						typeN++;
					}
				}
				const typeMean = meanOrNull(typeSum, typeN, typeTasks.length);
				if (typeMean !== null) scoresByTaskType[tt] = typeMean;
			}

			let mttSum = 0;
			let mttN = 0;
			for (const tt of taskTypesOut) {
				const v = scoresByTaskType[tt];
				if (v !== undefined) {
					mttSum += v;
					mttN++;
				}
			}
			const meanTaskType = meanOrNull(mttSum, mttN, taskTypesOut.length);

			// Same bucket-and-average shape as scoresByTaskType just above,
			// keyed by (dimension, label) instead of task type — backed by
			// customGroupTasksByLabel (narrowTasks), which already
			// intersected each group's declared tasks with the current
			// task-type/domain/modality narrowing.
			const scoresByCustomGroup: Record<string, Record<string, number>> = {};
			for (const [dim, byLabel] of customGroupTasksByLabel) {
				const dimOut: Record<string, number> = {};
				for (const [label, tasks] of byLabel) {
					let groupSum = 0;
					let groupN = 0;
					for (const name of tasks) {
						const v = row.scoresByTask[name];
						if (v !== undefined) {
							groupSum += v;
							groupN++;
						}
					}
					const groupMean = meanOrNull(groupSum, groupN, tasks.length);
					if (groupMean !== null) dimOut[label] = groupMean;
				}
				if (Object.keys(dimOut).length > 0) scoresByCustomGroup[dim] = dimOut;
			}

			// Scoped groups never get a bucket above, so carry the row's
			// original server value through instead of leaving it missing.
			for (const dim of customGroupingsOut) {
				for (const g of dim.groups) {
					if (g.tasksComplete !== false) continue;
					const v = row.scoresByCustomGroup?.[dim.name]?.[g.label];
					if (v === undefined) continue;
					let dimOut = scoresByCustomGroup[dim.name];
					if (!dimOut) {
						dimOut = {};
						scoresByCustomGroup[dim.name] = dimOut;
					}
					dimOut[g.label] = v;
				}
			}

			return { meanTask, meanTaskType, scoresByTaskType, scoresByCustomGroup };
		};

		rows = [];
		for (const row of summary.rows) {
			if (!passesRowFilter(row)) continue;
			let agg = perRowAgg.get(row);
			if (!agg) {
				agg = computeAgg(row);
				perRowAgg.set(row, agg);
			}
			rows.push({
				...row,
				meanTask: agg.meanTask,
				meanTaskType: agg.meanTaskType,
				scoresByTaskType: agg.scoresByTaskType,
				scoresByCustomGroup: agg.scoresByCustomGroup
			});
		}
	}

	// Re-rank: fresh Borda when tasks narrowed; renumber 1..N when only rows
	// narrowed; keep API ranks for name-search-only (find-in-table gesture).
	let rankedRows: typeof rows;
	if (fullView) {
		if (rowFilterActive) {
			rankedRows = rows.map((row, i) => ({ ...row, rank: i + 1 }));
		} else {
			rankedRows = rows;
		}
	} else {
		const { sortedByTask } = narrow;
		if (sortedByTask.size === 0) {
			for (const taskName of taskNamesOut) {
				const ranked: { name: string; v: number }[] = [];
				for (const r of summary.rows) {
					const v = r.scoresByTask[taskName];
					if (v !== undefined) ranked.push({ name: r.model.name, v });
				}
				// Stable tie-break by name for deterministic Borda points.
				ranked.sort((a, b) => b.v - a.v || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
				sortedByTask.set(taskName, ranked);
			}
		}
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const visibleNames = new Set<string>();
		for (const r of rows) visibleNames.add(r.model.name);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const bordaPoints = new Map<string, number>();
		for (const taskName of taskNamesOut) {
			const ranked = sortedByTask.get(taskName);
			if (!ranked) continue;
			let visibleCount = 0;
			for (const r of ranked) if (visibleNames.has(r.name)) visibleCount++;
			let i = 0;
			for (const r of ranked) {
				if (!visibleNames.has(r.name)) continue;
				bordaPoints.set(r.name, (bordaPoints.get(r.name) ?? 0) + (visibleCount - i));
				i++;
			}
		}
		rankedRows = rows
			.map((row) => ({ row, borda: bordaPoints.get(row.model.name) ?? 0 }))
			.sort((a, b) => {
				if (a.borda !== b.borda) return b.borda - a.borda;
				const am = a.row.meanTask ?? -Infinity;
				const bm = b.row.meanTask ?? -Infinity;
				return bm - am;
			})
			.map(({ row }, i) => ({ ...row, rank: i + 1 }));
	}

	return {
		...summary,
		taskTypes: taskTypesOut,
		tasks: taskNamesOut,
		tasksMeta: visibleTasks,
		customGroupings: customGroupingsOut,
		rows: rankedRows
	};
}
