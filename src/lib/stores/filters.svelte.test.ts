import { beforeEach, describe, expect, it } from 'vitest';
import type { BenchmarkSummary, CustomGrouping, ModelMeta, SummaryRow, TaskMeta } from '$lib/types';
import { applyFilters, filters } from './filters.svelte';

// ---------------------------------------------------------------------------
// Fixture builders. Kept tiny so each test reads top-to-bottom: build a
// synthetic summary, toggle filters, assert.
// ---------------------------------------------------------------------------

function makeModel(name: string, overrides: Partial<ModelMeta> = {}): ModelMeta {
	const [org, displayName] = name.includes('/') ? name.split('/') : ['', name];
	return {
		name,
		displayName,
		org,
		zeroShotPct: 100,
		activeParamsB: 1,
		totalParamsB: 1,
		embeddingDim: 768,
		maxTokens: 512,
		modelType: 'dense',
		instructionTuned: false,
		openWeights: true,
		sentenceTransformersCompatible: true,
		...overrides
	};
}

function makeTask(name: string, type: string, overrides: Partial<TaskMeta> = {}): TaskMeta {
	return {
		name,
		type,
		simplifiedType: type.toLowerCase(),
		languages: ['eng-Latn'],
		domains: ['general'],
		modalities: ['text'],
		description: '',
		...overrides
	};
}

// Two-group "Dim" dimension used by the custom-group narrowing tests below —
// G1 covers the two Retrieval tasks, G2 the one Classification task, so a
// task-type filter cleanly drops G2 (all of its tasks excluded) while
// leaving G1 untouched, and the "tasks" facet can partially narrow G1.
const CUSTOM_GROUPING_FIXTURE: CustomGrouping[] = [
	{
		name: 'Dim',
		groups: [
			{ label: 'G1', tasks: ['T1', 'T2'], description: null },
			{ label: 'G2', tasks: ['T3'], description: null }
		]
	}
];

function meanOf(m: Record<string, number>): number | null {
	const xs = Object.values(m);
	return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function customGroupMeans(
	scoresByTask: Record<string, number>,
	groupings: CustomGrouping[]
): Record<string, Record<string, number>> {
	const out: Record<string, Record<string, number>> = {};
	for (const dim of groupings) {
		const dimOut: Record<string, number> = {};
		for (const g of dim.groups) {
			const picked: Record<string, number> = {};
			for (const t of g.tasks) {
				const v = scoresByTask[t];
				if (v !== undefined) picked[t] = v;
			}
			const mean = meanOf(picked);
			if (mean !== null) dimOut[g.label] = mean;
		}
		out[dim.name] = dimOut;
	}
	return out;
}

function makeRow(
	rank: number,
	model: ModelMeta,
	scoresByTask: Record<string, number>,
	scoresByTaskType: Record<string, number>,
	scoresByCustomGroup: Record<string, Record<string, number>> = customGroupMeans(
		scoresByTask,
		CUSTOM_GROUPING_FIXTURE
	)
): SummaryRow {
	// Derive the means from the score maps so the fixture matches what the
	// API would emit — `applyFilters` under "no narrowing" preserves
	// `row.meanTask` rather than recomputing, so a `null` fixture would
	// look like a regression on the happy-path assertions.
	return {
		rank,
		model,
		zeroShotPct: model.zeroShotPct,
		activeParamsB: model.activeParamsB,
		totalParamsB: model.totalParamsB,
		embeddingDim: model.embeddingDim,
		maxTokens: model.maxTokens,
		meanTask: meanOf(scoresByTask),
		meanTaskType: meanOf(scoresByTaskType),
		scoresByTask,
		scoresByTaskType,
		scoresByCustomGroup
	};
}

function fixtureSummary(): BenchmarkSummary {
	// Three tasks across two types: retrieval (T1, T2) and classification (T3).
	// Four models with deliberately skewed score distributions so Borda re-rank
	// produces a different order than naive mean.
	const tasks = ['T1', 'T2', 'T3'];
	const taskTypes = ['Retrieval', 'Classification'];
	const tasksMeta: TaskMeta[] = [
		makeTask('T1', 'Retrieval', { languages: ['eng-Latn'], domains: ['general'] }),
		makeTask('T2', 'Retrieval', { languages: ['fra-Latn'], domains: ['legal'] }),
		makeTask('T3', 'Classification', { languages: ['eng-Latn'], domains: ['general'] })
	];

	const a = makeModel('org/A', { modelType: 'dense', openWeights: true });
	const b = makeModel('org/B', { modelType: 'sparse', openWeights: true });
	const c = makeModel('org/C', { modelType: 'dense', openWeights: false }); // proprietary
	const d = makeModel('org/D', { modelType: 'dense', openWeights: true, zeroShotPct: -1 });

	const rows: SummaryRow[] = [
		makeRow(1, a, { T1: 0.9, T2: 0.5, T3: 0.6 }, { Retrieval: 0.7, Classification: 0.6 }),
		makeRow(2, b, { T1: 0.7, T2: 0.8, T3: 0.7 }, { Retrieval: 0.75, Classification: 0.7 }),
		makeRow(3, c, { T1: 0.6, T2: 0.7, T3: 0.5 }, { Retrieval: 0.65, Classification: 0.5 }),
		makeRow(4, d, { T1: 0.8, T2: 0.6, T3: 0.4 }, { Retrieval: 0.7, Classification: 0.4 })
	];

	return {
		benchmarkName: 'TestBench',
		taskTypes,
		tasks,
		tasksMeta,
		rows,
		aggregations: ['mean_task', 'mean_task_type', 'custom_groups'],
		customGroupings: CUSTOM_GROUPING_FIXTURE
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
	// Re-seed the singleton with the fixture's available-set every test so prior
	// mutations don't leak. initFor + resetModelFilters together restore the
	// "everything visible" baseline.
	filters.initFor(fixtureSummary());
	filters.resetModelFilters();
	filters.resetCustomize();
});

describe('applyFilters: no narrowing', () => {
	it('passes every row, every task, and every type through unchanged', () => {
		const out = applyFilters(fixtureSummary());
		expect(out.tasks).toEqual(['T1', 'T2', 'T3']);
		expect(out.taskTypes).toEqual(['Retrieval', 'Classification']);
		expect(out.rows).toHaveLength(4);
	});

	it('recomputes meanTask / meanTaskType from the visible slice', () => {
		const out = applyFilters(fixtureSummary());
		const a = out.rows.find((r) => r.model.name === 'org/A')!;
		// Mean across T1, T2, T3 → (0.9 + 0.5 + 0.6) / 3 = 0.6667
		expect(a.meanTask).toBeCloseTo(2.0 / 3, 5);
		// Mean across both task types → (0.7 + 0.6) / 2 = 0.65
		expect(a.meanTaskType).toBeCloseTo(0.65, 5);
	});

	it('preserves the API order + rank when no task-set narrowing is active', () => {
		// Row-only filters (search query, availability, …) shouldn't relabel
		// peers' ranks just because some rows got hidden. Without any filter
		// active, the unfiltered view must keep the fixture's API order.
		const out = applyFilters(fixtureSummary());
		expect(out.rows.map((r) => r.model.name)).toEqual(['org/A', 'org/B', 'org/C', 'org/D']);
		expect(out.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
	});
});

describe('applyFilters: task-set narrowing', () => {
	it('hides tasks dropped by the type filter and recomputes the mean', () => {
		filters.setAll('taskTypes', ['Retrieval'], true); // only Retrieval
		const out = applyFilters(fixtureSummary());
		expect(out.tasks).toEqual(['T1', 'T2']);
		expect(out.taskTypes).toEqual(['Retrieval']);
		const a = out.rows.find((r) => r.model.name === 'org/A')!;
		// New mean: (0.9 + 0.5) / 2 = 0.7
		expect(a.meanTask).toBeCloseTo(0.7, 5);
	});

	it('does NOT drop tasks by language filter — that is now handled server-side', () => {
		// The backend re-runs the summary scoped to the picked languages via
		// `?languages=` on /scores; the client trusts whatever task list the
		// new summary carries. Filtering tasks client-side by language would
		// drift wrong while the debounced refetch is in flight (it would
		// re-apply the new filter to the OLD summary's per-task slots).
		filters.setAll('languages', ['eng-Latn'], true);
		const out = applyFilters(fixtureSummary());
		expect(out.tasks).toEqual(['T1', 'T2', 'T3']);
	});
});

describe('applyFilters: custom-group narrowing', () => {
	it('passes scoresByCustomGroup and customGroupings through unchanged when nothing is filtered', () => {
		const out = applyFilters(fixtureSummary());
		expect(out.customGroupings).toEqual(CUSTOM_GROUPING_FIXTURE);
		const a = out.rows.find((r) => r.model.name === 'org/A')!;
		// G1 = mean(T1, T2) = (0.9 + 0.5) / 2 = 0.7; G2 = T3 = 0.6.
		expect(a.scoresByCustomGroup).toEqual({ Dim: { G1: 0.7, G2: 0.6 } });
	});

	it('drops a group from customGroupings once every one of its tasks is filtered out', () => {
		filters.setAll('taskTypes', ['Retrieval'], true); // drops T3 (Classification) → G2 empties
		const out = applyFilters(fixtureSummary());
		expect(out.customGroupings).toEqual([
			{ name: 'Dim', groups: [{ label: 'G1', tasks: ['T1', 'T2'], description: null }] }
		]);
		const a = out.rows.find((r) => r.model.name === 'org/A')!;
		expect(a.scoresByCustomGroup!.Dim.G2).toBeUndefined();
		// G1's own tasks (T1, T2) are both still visible, so it recomputes unchanged.
		expect(a.scoresByCustomGroup!.Dim.G1).toBeCloseTo(0.7, 5);
	});

	it('the "tasks" picker narrows a group mean to just the picked tasks within it', () => {
		// Keep T1 and T3 via the individual task picker, drop T2 — same
		// "total = visible tasks in this bucket" semantics scoresByTaskType
		// already uses (its typeTasks.length is also visible-only), so G1's
		// mean narrows from mean(T1, T2) to just T1; G2 (only ever T3) is
		// untouched.
		filters.setAll('tasks', ['T1', 'T3'], true);
		const out = applyFilters(fixtureSummary());
		expect(out.customGroupings![0].groups.map((g) => g.label)).toEqual(['G1', 'G2']);
		const a = out.rows.find((r) => r.model.name === 'org/A')!;
		// Was 0.7 (mean of T1=0.9, T2=0.5) under no narrowing; now just T1.
		expect(a.scoresByCustomGroup!.Dim.G1).toBeCloseTo(0.9, 5);
		expect(a.scoresByCustomGroup!.Dim.G2).toBeCloseTo(0.6, 5);
	});

	it('nulls a group when the model is missing a score for one of its visible tasks', () => {
		// org/D has no T2 score at all (simulates a model that didn't run
		// that task). Narrow to Retrieval (T1, T2 visible, same as the
		// "drops an empty group" test above) — G1 needs both, so org/D
		// (T1 only) goes null under strict (no language filter) semantics,
		// while org/A (has both) still gets a value.
		const summary = fixtureSummary();
		const d = summary.rows.find((r) => r.model.name === 'org/D')!;
		delete d.scoresByTask.T2;
		d.scoresByCustomGroup = customGroupMeans(d.scoresByTask, CUSTOM_GROUPING_FIXTURE);

		filters.setAll('taskTypes', ['Retrieval'], true);
		const out = applyFilters(summary);
		const outA = out.rows.find((r) => r.model.name === 'org/A')!;
		const outD = out.rows.find((r) => r.model.name === 'org/D')!;
		expect(outA.scoresByCustomGroup!.Dim.G1).toBeCloseTo(0.7, 5);
		expect(outD.scoresByCustomGroup?.Dim?.G1).toBeUndefined();
	});

	it('does NOT drop custom groups by language filter — that is handled server-side', () => {
		filters.setAll('languages', ['eng-Latn'], true);
		const out = applyFilters(fixtureSummary());
		expect(out.customGroupings).toEqual(CUSTOM_GROUPING_FIXTURE);
	});
});

describe('applyFilters: tasksComplete=false (scoped) groups are frozen, not recomputed or dropped', () => {
	// A scoped group's declared tasks is empty by construction (mirrors
	// CustomGroupSchema.tasksComplete), so it never gets a bucket and would
	// otherwise read as "zero visible tasks" and get dropped.
	const SCOPED_GROUPING: CustomGrouping = {
		name: 'ScopedDim',
		groups: [{ label: 'GScoped', tasks: [], description: null, tasksComplete: false }]
	};
	const MIXED_GROUPING: CustomGrouping = {
		name: 'MixedDim',
		groups: [
			{ label: 'MComplete', tasks: ['T1'], description: null },
			{ label: 'MScoped', tasks: [], description: null, tasksComplete: false }
		]
	};

	function fixtureSummaryWithScopedGroups(): BenchmarkSummary {
		const summary = fixtureSummary();
		return {
			...summary,
			customGroupings: [...summary.customGroupings!, SCOPED_GROUPING, MIXED_GROUPING],
			rows: summary.rows.map((r) => ({
				...r,
				scoresByCustomGroup: {
					...r.scoresByCustomGroup,
					// Distinct per-row sentinel so a wrong-row bug wouldn't slip
					// past a coincidental match.
					ScopedDim: { GScoped: r.rank * 0.111 },
					MixedDim: { MComplete: r.rank * 0.222, MScoped: r.rank * 0.333 }
				}
			}))
		};
	}

	it('stays present in customGroupings even when a filter would otherwise empty its bucket', () => {
		filters.setAll('taskTypes', ['Retrieval'], true); // drops T3 -> Dim's G2 empties too
		const out = applyFilters(fixtureSummaryWithScopedGroups());
		const dimNames = out.customGroupings!.map((d) => d.name);
		expect(dimNames).toContain('ScopedDim');
		const scopedDim = out.customGroupings!.find((d) => d.name === 'ScopedDim')!;
		expect(scopedDim.groups.map((g) => g.label)).toEqual(['GScoped']);
		// Dim's G2 (a genuinely empty, non-scoped group) still drops as before.
		const dim = out.customGroupings!.find((d) => d.name === 'Dim')!;
		expect(dim.groups.map((g) => g.label)).toEqual(['G1']);
	});

	it("freezes a scoped group's score at the server value instead of recomputing it", () => {
		const unfiltered = fixtureSummaryWithScopedGroups();
		const a = unfiltered.rows.find((r) => r.model.name === 'org/A')!;
		const frozenValue = a.scoresByCustomGroup!.ScopedDim.GScoped;

		filters.setAll('taskTypes', ['Retrieval'], true);
		const out = applyFilters(fixtureSummaryWithScopedGroups());
		const outA = out.rows.find((r) => r.model.name === 'org/A')!;
		expect(outA.scoresByCustomGroup!.ScopedDim.GScoped).toBe(frozenValue);
	});

	it('recomputes a complete group but freezes an incomplete group within the same dimension', () => {
		const unfiltered = fixtureSummaryWithScopedGroups();
		const a = unfiltered.rows.find((r) => r.model.name === 'org/A')!;
		const frozenValue = a.scoresByCustomGroup!.MixedDim.MScoped;

		filters.setAll('taskTypes', ['Retrieval'], true); // T1, T2 visible
		const out = applyFilters(fixtureSummaryWithScopedGroups());
		const outA = out.rows.find((r) => r.model.name === 'org/A')!;
		// MComplete's declared tasks = ['T1'], unaffected by the T3 drop ->
		// recomputes to org/A's T1 score (0.9), not frozen.
		expect(outA.scoresByCustomGroup!.MixedDim.MComplete).toBeCloseTo(0.9, 5);
		expect(outA.scoresByCustomGroup!.MixedDim.MScoped).toBe(frozenValue);
	});
});

describe('applyFilters: model-row narrowing', () => {
	it('proprietary-only / open-only flip rows in/out', () => {
		filters.availability = 'open';
		let out = applyFilters(fixtureSummary());
		expect(out.rows.map((r) => r.model.name).sort()).toEqual(['org/A', 'org/B', 'org/D']);

		filters.availability = 'proprietary';
		out = applyFilters(fixtureSummary());
		expect(out.rows.map((r) => r.model.name)).toEqual(['org/C']);
	});

	it('model-type chips intersect on .modelType', () => {
		filters.setAll('modelTypes', ['sparse'], true);
		const out = applyFilters(fixtureSummary());
		expect(out.rows.map((r) => r.model.name)).toEqual(['org/B']);
	});

	it('only_zero_shot drops models with zeroShotPct != 100', () => {
		filters.zeroShot = 'only_zero_shot';
		const out = applyFilters(fixtureSummary());
		// D has zeroShotPct = -1; A/B/C all default to 100 in the fixture.
		expect(out.rows.map((r) => r.model.name).sort()).toEqual(['org/A', 'org/B', 'org/C']);
	});

	it('remove_unknown drops only the -1 sentinel', () => {
		filters.zeroShot = 'remove_unknown';
		const out = applyFilters(fixtureSummary());
		expect(out.rows.find((r) => r.model.name === 'org/D')).toBeUndefined();
		expect(out.rows.find((r) => r.model.name === 'org/A')).toBeDefined();
	});

	it('name query matches against name, displayName, and org', () => {
		filters.nameQuery = 'A';
		const out = applyFilters(fixtureSummary());
		// Substring "A" matches displayName="A" of org/A; "org" matches every row.
		// We narrow with a distinctive token to keep the assertion tight.
		expect(out.rows.length).toBeGreaterThan(0);

		filters.nameQuery = 'nonexistent-substring-xyz';
		const empty = applyFilters(fixtureSummary());
		expect(empty.rows).toHaveLength(0);
	});
});
