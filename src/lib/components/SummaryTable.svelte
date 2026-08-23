<script lang="ts" module>
	import { COLUMN_INFO } from '$lib/column-info';

	// Tooltip copy is invariant across instances and benchmarks. Promoted
	// to a module-scope const so each SummaryTable mount doesn't re-build
	// the same object literal. Columns shared with ModelsTable (/models)
	// take their copy from `COLUMN_INFO` so the two can't drift.
	const INFO = {
		...COLUMN_INFO,
		rank: {
			title: 'Rank (Borda)',
			text: 'Rank is computed via the Borda count: each task votes for models by their relative performance. The model with the most votes across tasks gets the highest rank. Borda tends to reward consistent breadth over single peaks.'
		},
		model: {
			title: 'Model',
			text: 'Missing results — the model may not have been run on the tasks in the benchmark. We only display models that have been run on at least one task. To submit results, see the [submitting results guide](https://embeddings-benchmark.github.io/mteb/contributing/submitting_results/).'
		},
		zeroShot: {
			title: 'Zero-shot %',
			text: "What portion of the benchmark a model has not been trained on. 100% means fully out-of-distribution; 50% means it was fine-tuned on half the tasks. '⚠️ NA' means we don't know."
		},
		meanTask: {
			title: 'Mean (Task)',
			text: "Naïve average of the model's scores across every task in the benchmark. Continuous, simple to read, but tasks with higher score variance pull the mean around."
		},
		meanTaskType: {
			title: 'Mean (TaskType)',
			text: 'Weighted average computed by first averaging per task category (Classification, Retrieval, …) and then averaging across categories. Rewards models that perform well in every category.'
		},
		meanPublic: {
			title: 'Mean (Public)',
			text: "Average score across the benchmark's public (openly-released) task subset. Recomputed live when you narrow the visible task set with filters."
		},
		meanPrivate: {
			title: 'Mean (Private)',
			text: "Average score across the benchmark's private (held-out) task subset — datasets the benchmark keeps closed to discourage training-set contamination. Recomputed live with filters."
		}
	} as const;

	// Short header labels for the per-task-type columns. Full task type names
	// (especially the vision / audio ones — "AudioZeroshotClassification",
	// "Any2AnyMultilingualRetrieval") eat horizontal space and force the
	// table into awkward horizontal scrolling on benchmarks with many task
	// types. The abbreviated label sits in the column header; the full
	// humanized name is still announced via the hover tooltip's title.
	// Keys mirror the real `tasksMeta[].type` values returned by the API
	// (see `/v1/tasks`). Anything unmapped falls back to `humanizeType`.
	const TASK_TYPE_ABBREV: Record<string, string> = {
		Any2AnyMultilingualRetrieval: 'A2A MultiRetr.',
		Any2AnyRetrieval: 'A2A Retr.',
		AudioClassification: 'Aud Class.',
		AudioClustering: 'Aud Clust.',
		AudioMultilabelClassification: 'Aud MultiClass.',
		AudioPairClassification: 'Aud PairClass.',
		AudioReranking: 'Aud Rerank',
		AudioZeroshotClassification: 'Aud 0Shot Class.',
		BitextMining: 'Bitext',
		Classification: 'Class.',
		Clustering: 'Clust.',
		Compositionality: 'Comp.',
		DocumentUnderstanding: 'Doc Und.',
		ImageClassification: 'Img Class.',
		ImageClustering: 'Img Clust.',
		InstructionReranking: 'Instr Rerank',
		InstructionRetrieval: 'Instr Retr.',
		MultilabelClassification: 'MultiClass.',
		PairClassification: 'PairClass.',
		Regression: 'Regr.',
		Reranking: 'Rerank',
		Retrieval: 'Retr.',
		STS: 'STS',
		Summarization: 'Summ.',
		VideoCentricQA: 'Vid QA',
		VideoClassification: 'Vid Class.',
		VideoClustering: 'Vid Clust.',
		VideoPairClassification: 'Vid PairClass.',
		VideoZeroshotClassification: 'Vid 0Shot Class.',
		VisionCentricQA: 'Vis QA',
		'VisualSTS(eng)': 'V-STS (en)',
		'VisualSTS(multi)': 'V-STS (multi)',
		ZeroShotClassification: '0Shot Class.'
	};

	// Per-column hover descriptions. Keyed by `tasksMeta[i].type` (not the
	// `summary.taskTypes` form the backend strips) — see `realTaskType` below.
	const TASK_TYPE_INFO: Record<string, string> = {
		Classification: 'Classify text into pre-defined labels (sentiment, topic, intent, …).',
		Clustering:
			'Group similar texts together without supervision; scored by cluster quality vs gold labels.',
		PairClassification:
			'Predict a relation between two texts — e.g. paraphrase yes/no, entailment.',
		MultilabelClassification: 'Assign one or more labels per text from a fixed vocabulary.',
		Reranking: 'Re-order a candidate list relative to a query; measures top-K ordering quality.',
		InstructionReranking:
			'Rerank candidates according to a free-form natural-language instruction supplied with the query.',
		Retrieval: 'Find the most relevant documents for a query out of a large corpus.',
		STS: 'Rate the semantic similarity between two texts on a continuous scale.',
		BitextMining:
			'Pair sentences across two languages that carry the same meaning (translation alignment).',
		Summarization:
			'Produce or evaluate concise summaries of longer documents; scored against reference summaries.',
		// Vision / image-modality task types — surfaced on MIEB / MVEB / Image*.
		ImageClassification: 'Classify images into pre-defined labels.',
		ImageClustering: 'Group similar images together without supervision.',
		ZeroShotClassification:
			'Classify images / text into labels without per-task supervision; scored on held-out labels.',
		DocumentUnderstanding:
			'Parse document layouts (text, tables, figures) and answer questions over them.',
		MultilingualRetrieval: 'Find relevant documents in a multilingual corpus.',
		VisionCentricQA: 'Answer questions that require visual understanding of an image.',
		Compositionality:
			'Test compositional understanding (objects, attributes, and relations) in vision-language models.',
		'VisualSTS(eng)': 'Rate semantic similarity between English sentence pairs rendered as images.',
		'VisualSTS(multi)':
			'Rate semantic similarity between multilingual sentence pairs rendered as images.'
	};
</script>

<script lang="ts">
	import type { BenchmarkSummary, SummaryRow } from '$lib/types';
	import { pinnedModels } from '$lib/stores/pinned.svelte';
	import {
		bestWorstPerColumn,
		floatPinnedToTop,
		fmtParamsUnit,
		fmtParamsValue,
		fmtPct,
		fmtZeroShot,
		heat,
		humanizeType,
		maxOf,
		minOf
	} from '$lib/format';
	import { stickyHead } from '$lib/actions/sticky-head';
	import { stickyHScroll } from '$lib/actions/sticky-hscroll';
	import { createSortState } from '$lib/stores/sort.svelte';
	import { safeIdle } from '$lib/idle';
	import { clampTooltipX, isBoundaryCross } from '$lib/cell-hover';
	import ModelCellName from './ModelCellName.svelte';
	import PinButton from './PinButton.svelte';
	import ModelHoverPortal from './ModelHoverPortal.svelte';
	import OpennessMeter from './OpennessMeter.svelte';
	import OpennessHoverPortal from './OpennessHoverPortal.svelte';
	import { opennessScore } from '$lib/openness';
	import HoverPortal from './HoverPortal.svelte';
	import InfoDot from './InfoDot.svelte';
	import MarkdownText from './MarkdownText.svelte';

	interface Props {
		summary: BenchmarkSummary;
		// `false` when this pane is mounted but hidden behind another tab. We
		// then skip subscribing `sortedRows` to `pinnedModels` so pin clicks
		// in the visible pane don't invalidate the hidden one's derived.
		// Defaults to `true` so callers that don't use the prewarm pattern
		// (e.g. /benchmark/[name] only mounts the active tab when prerender
		// is off) keep the live-pin behaviour.
		active?: boolean;
	}
	let { summary, active = true }: Props = $props();

	type SortKey =
		| 'rank'
		| 'model'
		| 'totalParams'
		| 'openness'
		| 'zeroShot'
		| 'meanTask'
		| 'meanTaskType'
		| 'meanPublic'
		| 'meanPrivate'
		| `tt:${string}`
		// Encodes `cg:{dimension}::{label}` — split on the first '::'.
		| `cg:${string}`;

	// Per-summary-tab sort. URL prefix `s.summary` / `d.summary` keeps
	// the per-task and per-language tabs independent (each has its own
	// namespace). `↕` is the resting indicator when no column is the
	// active sort.
	const sort = createSortState<SortKey>({
		urlKeys: ['s.summary', 'd.summary'],
		ascKeys: ['rank', 'model'],
		defaultIcon: '↕'
	});

	function getValue(row: SummaryRow, key: SortKey): { v: number | string; missing: boolean } {
		switch (key) {
			case 'rank':
				return { v: row.rank, missing: false };
			case 'model':
				return { v: row.model.displayName.toLowerCase(), missing: false };
			case 'totalParams':
				return { v: row.totalParamsB ?? 0, missing: !row.totalParamsB };
			case 'openness': {
				const s = opennessScore(row.model);
				return { v: s ?? 0, missing: s == null };
			}
			case 'zeroShot':
				// -1 is the "unknown" sentinel; treat as missing so it sorts
				// to the bottom regardless of direction.
				return { v: row.zeroShotPct, missing: row.zeroShotPct === -1 };
			case 'meanTask':
				return { v: row.meanTask ?? 0, missing: row.meanTask == null };
			case 'meanTaskType':
				return { v: row.meanTaskType ?? 0, missing: row.meanTaskType == null };
			case 'meanPublic': {
				const v = publicMeansByRow.get(row) ?? null;
				return { v: v ?? 0, missing: v == null };
			}
			case 'meanPrivate': {
				const v = privateMeansByRow.get(row) ?? null;
				return { v: v ?? 0, missing: v == null };
			}
		}
		if (key.startsWith('tt:')) {
			const tt = key.slice(3);
			const v = row.scoresByTaskType[tt];
			return { v: v ?? 0, missing: v === undefined };
		}
		if (key.startsWith('cg:')) {
			const [dim, label] = key.slice(3).split('::');
			const v = row.scoresByCustomGroup?.[dim]?.[label];
			return { v: v ?? 0, missing: v === undefined };
		}
		return { v: 0, missing: true };
	}

	let sortedRows = $derived.by(() => {
		let rows = summary.rows;
		if (sort.key) {
			const dir = sort.dir === 'asc' ? 1 : -1;
			const key = sort.key;
			// Precompute the comparison value once per row (was once per comparison —
			// O(N log N) calls to `getValue` collapsed to O(N)). Matters most for
			// meanPublic/meanPrivate where `getValue` would otherwise re-walk the
			// publicTaskNames Set inside each comparison.
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const byRow = new Map<SummaryRow, { v: number | string; missing: boolean }>();
			for (const r of rows) byRow.set(r, getValue(r, key));
			rows = [...rows].sort((a, b) => {
				const va = byRow.get(a)!;
				const vb = byRow.get(b)!;
				// Always push "missing" values to the bottom regardless of direction.
				if (va.missing && !vb.missing) return 1;
				if (!va.missing && vb.missing) return -1;
				if (va.missing && vb.missing) return 0;
				if (typeof va.v === 'string') return (va.v as string).localeCompare(vb.v as string) * dir;
				return ((va.v as number) - (vb.v as number)) * dir;
			});
		}
		// Inactive panes don't subscribe to `pinnedModels` — pin clicks
		// elsewhere don't invalidate this derived. Reactivates on tab switch
		// (the `active` prop change re-fires the derived).
		if (!active) return rows;
		return floatPinnedToTop(rows, (r) => pinnedModels.has(r.model.name), pinnedModels.size);
	});

	// Progressive row render — Firefox benefits a lot (cold first-paint
	// drops ~50%) because its layout engine streams large tbodies
	// incrementally and our 80-row first chunk paints before the rest of
	// the layer's columns get reflowed. Chromium / WebKit also see a
	// modest win. `lastRowSignature` lets the $effect bail on its own
	// writes to `visibleRows` (Svelte 5 re-fires the effect on every
	// state change inside it).
	const INITIAL_ROW_CHUNK = 80;
	const ROW_CHUNK_STEP = 200;
	let visibleRows = $state(INITIAL_ROW_CHUNK);
	let growVersion = 0;
	let lastRowSignature = '';
	let rowKickoffTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		// Anchor the progressive render to the underlying `summary.rows`
		// array identity, NOT to `sortedRows`. Pinning a model produces a
		// new `sortedRows` (partition pass floats pins to the top), but
		// the row set itself is unchanged — using `sortedRows` as the
		// dependency forced a full 80→200→… progressive re-render on every
		// pin click, freezing the UI for 600-row tables (MTEB(Multilingual)).
		// Sort changes are caught the same way: `sort.key/dir` change ⇒
		// new `sortedRows` array but `summary.rows` is the same array, so
		// we'd skip the reset — that's fine, the existing `visibleRows`
		// already covers everything for any ordering of the same set.
		const baseRows = summary.rows;
		const total = baseRows.length;
		const signature = `${total}|${baseRows[0]?.model.name ?? ''}|${baseRows[total - 1]?.model.name ?? ''}`;
		if (signature === lastRowSignature) return;
		lastRowSignature = signature;
		const myVersion = ++growVersion;
		// Small tables fit in the first chunk — render everything immediately
		// and skip the 60ms debounce + idle scheduling overhead.
		if (total <= INITIAL_ROW_CHUNK) {
			visibleRows = total;
			return;
		}
		visibleRows = INITIAL_ROW_CHUNK;
		if (rowKickoffTimer) clearTimeout(rowKickoffTimer);
		rowKickoffTimer = setTimeout(() => {
			rowKickoffTimer = null;
			if (myVersion !== growVersion) return;
			const grow = () => {
				if (myVersion !== growVersion) return;
				visibleRows = Math.min(visibleRows + ROW_CHUNK_STEP, total);
				if (visibleRows < total) safeIdle(grow);
			};
			safeIdle(grow);
		}, 60);
	});
	let renderedRows = $derived(sortedRows.slice(0, visibleRows));

	// Display the per-task-type columns A→Z. The API preserves
	// benchmark-specific order, but readers scan a wide table faster
	// when columns are alphabetised (and the mean columns to the left
	// stay anchored). `localeCompare` keeps "STS" before "Summarization"
	// regardless of locale, etc.
	// `summary.taskTypes` is pre-sorted at the service boundary.
	let sortedTaskTypes = $derived(summary.taskTypes);

	// `summary.taskTypes` carries the backend's stripped form (no parens,
	// and a stray `S` next to them — `VisualSTS(eng)` → `VisualSTeng`).
	// `tasksMeta[i].type` keeps the real form, so reverse the strip to
	// recover human labels + hit `TASK_TYPE_INFO` keys that contain parens.
	let realTaskType = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const m = new Map<string, string>();
		for (const t of summary.tasksMeta) {
			if (!t.type) continue;
			const stripped = t.type.replace(/S?\(|\)S?/g, '');
			if (!m.has(stripped)) m.set(stripped, t.type);
		}
		return m;
	});
	let typeBests = $derived(
		bestWorstPerColumn(sortedTaskTypes, summary.rows, (r, tt) => r.scoresByTaskType[tt])
	);
	let best = $derived(typeBests.best);
	let worst = $derived(typeBests.worst);
	// One bestWorstPerColumn pass per custom-grouping dimension — cheaper and
	// simpler than fighting the helper's generic-key signature into a single
	// call across dimensions, and mirrors the `typeBests` shape per dimension.
	let customGroupBests = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const out = new Map<string, { best: Record<string, number>; worst: Record<string, number> }>();
		for (const dim of summary.customGroupings ?? []) {
			out.set(
				dim.name,
				bestWorstPerColumn(
					dim.groups.map((g) => g.label),
					summary.rows,
					(r, label) => r.scoresByCustomGroup?.[dim.name]?.[label]
				)
			);
		}
		return out;
	});
	// Walk rows once and produce all the per-column bests/worsts at once.
	let meanStats = $derived.by(() => {
		let bTask = -Infinity,
			wTask = Infinity,
			bType = -Infinity,
			wType = Infinity;
		let sawTask = false,
			sawType = false;
		for (const r of summary.rows) {
			if (typeof r.meanTask === 'number') {
				if (r.meanTask > bTask) bTask = r.meanTask;
				if (r.meanTask < wTask) wTask = r.meanTask;
				sawTask = true;
			}
			if (typeof r.meanTaskType === 'number') {
				if (r.meanTaskType > bType) bType = r.meanTaskType;
				if (r.meanTaskType < wType) wType = r.meanTaskType;
				sawType = true;
			}
		}
		return {
			bestMeanTask: sawTask ? bTask : 0,
			worstMeanTask: sawTask ? wTask : 0,
			bestMeanTaskType: sawType ? bType : 0,
			worstMeanTaskType: sawType ? wType : 0
		};
	});
	let bestMeanTask = $derived(meanStats.bestMeanTask);
	let worstMeanTask = $derived(meanStats.worstMeanTask);
	let bestMeanTaskType = $derived(meanStats.bestMeanTaskType);
	let worstMeanTaskType = $derived(meanStats.worstMeanTaskType);
	// Column visibility is declarative — `summary.aggregations` lists exactly
	// which mean columns belong on this benchmark's leaderboard. Avoids
	// inferring from the score data (which led to ViDoRe showing an empty
	// Mean (TaskType) column it doesn't actually compute).
	let showMeanTask = $derived(summary.aggregations?.includes('mean_task') ?? false);
	let showMeanTaskType = $derived(summary.aggregations?.includes('mean_task_type') ?? false);
	let showTaskTypes = $derived(summary.aggregations?.includes('task_types') ?? false);
	let showPublicPrivate = $derived(summary.aggregations?.includes('public_private') ?? false);
	// Gated on both the aggregation flag AND non-empty data — defends
	// against a stale API that sends the flag without `customGroupings`.
	let showCustomGroups = $derived(
		(summary.aggregations?.includes('custom_groups') ?? false) &&
			(summary.customGroupings?.length ?? 0) > 0
	);
	// ViDoRe / RTEB don't track training-data overlap for their tasks, so
	// every row would render as a misleading uniform 100% — hide the column.
	let showZeroShot = $derived(summary.showZeroShot ?? true);
	// Only surface the Openness column when at least one row carries openness
	// data — avoids an all-empty column against an older API that omits it.
	let showOpenness = $derived(summary.rows.some((r) => opennessScore(r.model) !== null));
	// Recompute Mean (Public) / Mean (Private) from the model's per-task scores
	// using the benchmark's `tasksMeta[].isPublic` flag. This way the means
	// update live when the user filters the task set, instead of staying frozen
	// at the original benchmark-level values.
	let publicTaskNames = $derived(
		new Set(summary.tasksMeta.filter((t) => t.isPublic !== false).map((t) => t.name))
	);
	let privateTaskNames = $derived(
		new Set(summary.tasksMeta.filter((t) => t.isPublic === false).map((t) => t.name))
	);
	function meanOver(row: SummaryRow, names: Set<string>): number | null {
		if (names.size === 0) return null;
		let sum = 0;
		let n = 0;
		for (const name of names) {
			const v = row.scoresByTask[name];
			if (typeof v === 'number') {
				sum += v;
				n += 1;
			}
		}
		// Strict: missing any visible task drops the mean to null, matching the
		// policy applied to Mean (Task) / Mean (TaskType).
		return n === names.size ? sum / n : null;
	}
	// No fallback to the backend's row.meanPublic / row.meanPrivate: the user
	// might have deliberately filtered every public (or private) task out, in
	// which case the mean is undefined — falling back would surface the
	// pre-filter number and look stale. ``meanOver`` is null on empty input,
	// which is exactly the right answer.
	function liveMeanPublic(row: SummaryRow): number | null {
		if (!showPublicPrivate) return null;
		return meanOver(row, publicTaskNames);
	}
	function liveMeanPrivate(row: SummaryRow): number | null {
		if (!showPublicPrivate) return null;
		return meanOver(row, privateTaskNames);
	}
	// Compute the column arrays once and reuse for both bounds —
	// `meanOver` is the expensive part (per-row Set iteration).
	let publicMeans = $derived(summary.rows.map(liveMeanPublic));
	let privateMeans = $derived(summary.rows.map(liveMeanPrivate));
	// Per-row index of the same means so the sort comparator and cell
	// template can look up by row identity instead of re-calling
	// `meanOver` once per comparison / once per render.
	let publicMeansByRow = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const m = new Map<SummaryRow, number | null>();
		summary.rows.forEach((r, i) => m.set(r, publicMeans[i]));
		return m;
	});
	let privateMeansByRow = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const m = new Map<SummaryRow, number | null>();
		summary.rows.forEach((r, i) => m.set(r, privateMeans[i]));
		return m;
	});
	let bestMeanPublic = $derived(maxOf(publicMeans));
	let worstMeanPublic = $derived(minOf(publicMeans));
	let bestMeanPrivate = $derived(maxOf(privateMeans));
	let worstMeanPrivate = $derived(minOf(privateMeans));

	// Tooltip portal: we render a single tooltip element at the SummaryTable's
	// root (outside the <table> + .scroll wrapper) and update its position/content
	// on hover. Putting it inside a `<th>` would trap it inside that th's sticky
	// stacking context — even though it's position:fixed, the neighboring sticky
	// Model column has a higher z-index in their shared parent and would paint
	// over the left edge of any tip that crossed under it.
	//
	// The MODEL-cell hover now delegates to the shared `ModelHoverPortal`
	// (also used by PerTaskTab + PerLanguageTab) so all three tables show
	// byte-identical tooltips. This file's local `tipState` only handles
	// the column-header tooltips, which have a different shape (markdown
	// body, no dl rows).
	type TipState = {
		visible: boolean;
		title: string;
		text: string;
		x: number;
		y: number;
	};
	let tipState = $state<TipState>({
		visible: false,
		title: '',
		text: '',
		x: 0,
		y: 0
	});
	type ModelTip = {
		showFor: (t: HTMLElement, row: SummaryRow) => void;
		hide: () => void;
	};
	let modelTipPortal = $state<ModelTip | undefined>(undefined);
	type OpennessTip = {
		showFor: (t: HTMLElement, model: SummaryRow['model']) => void;
		hide: () => void;
	};
	let opennessTipPortal = $state<OpennessTip | undefined>(undefined);

	// Tooltip is `position: fixed; transform: translate(-50%, …)` so x is
	// the desired *centre*. Clamp it to the viewport with a half-width
	// margin so the bubble can't spill off either edge — Rank/leftmost
	// columns previously got the left half cut off; the same logic helps
	// rightmost task-type columns on narrow screens.
	const TIP_MAX_WIDTH = 340;
	const TIP_EDGE = 8;
	const clampTipX = (x: number) => clampTooltipX(x, TIP_MAX_WIDTH, TIP_EDGE);

	function showTip(e: PointerEvent | FocusEvent) {
		cancelHide();
		const cell = e.currentTarget as HTMLElement;
		const title = cell.dataset.tipTitle ?? '';
		const text = cell.dataset.tip ?? '';
		if (!text) return;
		const r = cell.getBoundingClientRect();
		tipState = {
			visible: true,
			title,
			text,
			x: clampTipX(r.left + r.width / 2),
			y: r.bottom
		};
	}

	function showModelTip(e: PointerEvent | FocusEvent, row: SummaryRow) {
		if (!isBoundaryCross(e)) return;
		modelTipPortal?.showFor(e.currentTarget as HTMLElement, row);
	}
	function hideModelTip(e?: PointerEvent | FocusEvent) {
		if (e && !isBoundaryCross(e)) return;
		modelTipPortal?.hide();
	}

	function showOpennessTip(e: PointerEvent | FocusEvent, row: SummaryRow) {
		if (e.type === 'pointerover' && !isBoundaryCross(e)) return;
		opennessTipPortal?.showFor(e.currentTarget as HTMLElement, row.model);
	}
	function hideOpennessTip(e?: PointerEvent | FocusEvent) {
		if (e && e.type === 'pointerout' && !isBoundaryCross(e)) return;
		opennessTipPortal?.hide();
	}

	// Hiding is debounced so the user can cross the 6 px gap between the
	// cell and the portal without the tip vanishing mid-traverse. The
	// portal's own pointerenter cancels the pending timer; pointerleave
	// re-arms it.
	let hideTimer: ReturnType<typeof setTimeout> | null = null;
	const HIDE_DELAY_MS = 200;
	function cancelHide() {
		if (hideTimer !== null) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
	}
	function hideTip(e?: PointerEvent | FocusEvent) {
		// `pointerout` fires on every internal traversal; only schedule
		// the hide when the cursor leaves the cell itself.
		if (e && !isBoundaryCross(e)) return;
		cancelHide();
		hideTimer = setTimeout(() => {
			tipState = { ...tipState, visible: false };
			hideTimer = null;
		}, HIDE_DELAY_MS);
	}
	function keepTip() {
		cancelHide();
	}

	// Every non-custom-group header cell spans both header rows (via this
	// rowspan) when a second row exists, so the extra row's height is only
	// ever spent on the aggregated columns themselves — not blank space
	// over Rank/Model/etc. `undefined` omits the attribute entirely when
	// there's only one header row to begin with.
	let cgRowspan = $derived(showCustomGroups ? 2 : undefined);
</script>

<div class="summary">
	<div class="tbl-scroll" use:stickyHScroll>
		<table class="tbl summary-table" use:stickyHead>
			<caption class="sr-only">Model leaderboard</caption>
			<thead>
				<tr>
					<th
						scope="col"
						class="sticky-left rank-head"
						rowspan={cgRowspan}
						data-tip-title={INFO.rank.title}
						data-tip={INFO.rank.text}
						onpointerenter={showTip}
						onpointerleave={hideTip}
						onfocusin={showTip}
						onfocusout={hideTip}
						aria-sort={sort.aria('rank')}
					>
						<button class="sort-btn tbl-num" onclick={() => sort.click('rank')}>
							<span>Rank</span>
							<InfoDot ariaLabel="What is {INFO.rank.title}?" />
							<span class="ind" class:on={sort.key === 'rank'}>{sort.icon('rank')}</span>
						</button>
					</th>
					<th
						scope="col"
						class="sticky-model"
						rowspan={cgRowspan}
						aria-sort={sort.aria('model')}
						data-tip-title={INFO.model.title}
						data-tip={INFO.model.text}
						onpointerenter={showTip}
						onpointerleave={hideTip}
						onfocusin={showTip}
						onfocusout={hideTip}
					>
						<button class="sort-btn" onclick={() => sort.click('model')}>
							<span>Model</span>
							<InfoDot ariaLabel="What is {INFO.model.title}?" />
							<span class="ind" class:on={sort.key === 'model'}>{sort.icon('model')}</span>
						</button>
					</th>
					<th
						scope="col"
						class="tbl-num"
						rowspan={cgRowspan}
						data-tip-title={INFO.totalParams.title}
						data-tip={INFO.totalParams.text}
						onpointerenter={showTip}
						onpointerleave={hideTip}
						onfocusin={showTip}
						onfocusout={hideTip}
						aria-sort={sort.aria('totalParams')}
					>
						<button class="sort-btn tbl-num" onclick={() => sort.click('totalParams')}>
							<span>Parameters</span>
							<InfoDot ariaLabel="What is {INFO.totalParams.title}?" />
							<span class="ind" class:on={sort.key === 'totalParams'}
								>{sort.icon('totalParams')}</span
							>
						</button>
					</th>
					{#if showOpenness}
						<th
							scope="col"
							class="openness-head"
							rowspan={cgRowspan}
							data-tip-title={INFO.openness.title}
							data-tip={INFO.openness.text}
							onpointerenter={showTip}
							onpointerleave={hideTip}
							onfocusin={showTip}
							onfocusout={hideTip}
							aria-sort={sort.aria('openness')}
						>
							<button class="sort-btn" onclick={() => sort.click('openness')}>
								<span>Openness</span>
								<InfoDot ariaLabel="What is {INFO.openness.title}?" />
								<span class="ind" class:on={sort.key === 'openness'}>{sort.icon('openness')}</span>
							</button>
						</th>
					{/if}
					{#if showZeroShot}
						<th
							scope="col"
							class="tbl-num"
							rowspan={cgRowspan}
							data-tip-title={INFO.zeroShot.title}
							data-tip={INFO.zeroShot.text}
							onpointerenter={showTip}
							onpointerleave={hideTip}
							onfocusin={showTip}
							onfocusout={hideTip}
							aria-sort={sort.aria('zeroShot')}
						>
							<button class="sort-btn tbl-num" onclick={() => sort.click('zeroShot')}>
								<span>Zero-shot</span>
								<InfoDot ariaLabel="What is {INFO.zeroShot.title}?" />
								<span class="ind" class:on={sort.key === 'zeroShot'}>{sort.icon('zeroShot')}</span>
							</button>
						</th>
					{/if}
					{#if showMeanTask}
						<th
							class="tbl-num"
							rowspan={cgRowspan}
							data-tip-title={INFO.meanTask.title}
							data-tip={INFO.meanTask.text}
							onpointerenter={showTip}
							onpointerleave={hideTip}
							onfocusin={showTip}
							onfocusout={hideTip}
							aria-sort={sort.aria('meanTask')}
						>
							<button class="sort-btn tbl-num" onclick={() => sort.click('meanTask')}>
								<span>Mean (Task)</span>
								<InfoDot ariaLabel="What is {INFO.meanTask.title}?" />
								<span class="ind" class:on={sort.key === 'meanTask'}>{sort.icon('meanTask')}</span>
							</button>
						</th>
					{/if}
					{#if showMeanTaskType}
						<th
							class="tbl-num"
							rowspan={cgRowspan}
							data-tip-title={INFO.meanTaskType.title}
							data-tip={INFO.meanTaskType.text}
							onpointerenter={showTip}
							onpointerleave={hideTip}
							onfocusin={showTip}
							onfocusout={hideTip}
							aria-sort={sort.aria('meanTaskType')}
						>
							<button class="sort-btn tbl-num" onclick={() => sort.click('meanTaskType')}>
								<span>Mean (TaskType)</span>
								<InfoDot ariaLabel="What is {INFO.meanTaskType.title}?" />
								<span class="ind" class:on={sort.key === 'meanTaskType'}
									>{sort.icon('meanTaskType')}</span
								>
							</button>
						</th>
					{/if}
					{#if showPublicPrivate}
						<th
							class="tbl-num"
							rowspan={cgRowspan}
							data-tip-title={INFO.meanPublic.title}
							data-tip={INFO.meanPublic.text}
							onpointerenter={showTip}
							onpointerleave={hideTip}
							onfocusin={showTip}
							onfocusout={hideTip}
							aria-sort={sort.aria('meanPublic')}
						>
							<button class="sort-btn tbl-num" onclick={() => sort.click('meanPublic')}>
								<span>Mean (Public)</span>
								<InfoDot ariaLabel="What is {INFO.meanPublic.title}?" />
								<span class="ind" class:on={sort.key === 'meanPublic'}
									>{sort.icon('meanPublic')}</span
								>
							</button>
						</th>
						<th
							class="tbl-num"
							rowspan={cgRowspan}
							data-tip-title={INFO.meanPrivate.title}
							data-tip={INFO.meanPrivate.text}
							onpointerenter={showTip}
							onpointerleave={hideTip}
							onfocusin={showTip}
							onfocusout={hideTip}
							aria-sort={sort.aria('meanPrivate')}
						>
							<button class="sort-btn tbl-num" onclick={() => sort.click('meanPrivate')}>
								<span>Mean (Private)</span>
								<InfoDot ariaLabel="What is {INFO.meanPrivate.title}?" />
								<span class="ind" class:on={sort.key === 'meanPrivate'}
									>{sort.icon('meanPrivate')}</span
								>
							</button>
						</th>
					{/if}
					{#if showTaskTypes}
						{#each sortedTaskTypes as tt (tt)}
							{@const k = `tt:${tt}` as SortKey}
							{@const real = realTaskType.get(tt) ?? tt}
							{@const desc = TASK_TYPE_INFO[real] ?? TASK_TYPE_INFO[tt]}
							{@const full = humanizeType(real)}
							{@const label = TASK_TYPE_ABBREV[real] ?? TASK_TYPE_ABBREV[tt] ?? full}
							<th
								scope="col"
								class="tbl-num"
								rowspan={cgRowspan}
								aria-sort={sort.aria(k)}
								data-tip-title={full}
								data-tip={desc ?? ''}
								onpointerenter={showTip}
								onpointerleave={hideTip}
								onfocusin={showTip}
								onfocusout={hideTip}
							>
								<button class="sort-btn tbl-num" onclick={() => sort.click(k)} title={full}>
									<span>{label}</span>
									<InfoDot ariaLabel="What is {full}?" />
									<span class="ind" class:on={sort.key === k}>{sort.icon(k)}</span>
								</button>
							</th>
						{/each}
					{/if}
					{#if showCustomGroups}
						{#each summary.customGroupings ?? [] as dim (dim.name)}
							<th colspan={dim.groups.length} class="cg-dim-head" scope="colgroup">
								{dim.name}
							</th>
						{/each}
					{/if}
				</tr>
				{#if showCustomGroups}
					<!-- Second header row exists ONLY for the aggregated custom-group
					     columns — every other header cell above spans both rows via
					     `rowspan={cgRowspan}` instead of leaving a blank cell here, so
					     the extra row doesn't add height over the whole table, just
					     over the dimension(s) that actually need a sub-header. -->
					<tr class="cg-subhead">
						{#each summary.customGroupings ?? [] as dim (dim.name)}
							{#each dim.groups as g (g.label)}
								{@const k = `cg:${dim.name}::${g.label}` as SortKey}
								{@const title = `${dim.name}: ${g.label}`}
								<th
									scope="col"
									class="tbl-num"
									aria-sort={sort.aria(k)}
									data-tip-title={title}
									data-tip={g.description ?? `Mean score across ${dim.name} = "${g.label}" tasks.`}
									onpointerenter={showTip}
									onpointerleave={hideTip}
									onfocusin={showTip}
									onfocusout={hideTip}
								>
									<button class="sort-btn tbl-num" onclick={() => sort.click(k)} {title}>
										<span>{g.label}</span>
										<InfoDot ariaLabel="What is {title}?" />
										<span class="ind" class:on={sort.key === k}>{sort.icon(k)}</span>
									</button>
								</th>
							{/each}
						{/each}
					</tr>
				{/if}
			</thead>
			<tbody>
				{#each renderedRows as row (row.model.name)}
					<tr class:pinned={pinnedModels.has(row.model.name)}>
						<td class="sticky-left">
							<div class="rank-cell">
								<PinButton name={row.model.name} />
								<span class="rank-pill">#{row.rank}</span>
							</div>
						</td>
						<th
							scope="row"
							class="sticky-model has-tip"
							data-model-type={row.model.modelType}
							onpointerover={(e) => showModelTip(e, row)}
							onpointerout={hideModelTip}
							onfocusin={(e) => showModelTip(e, row)}
							onfocusout={hideModelTip}
						>
							<ModelCellName model={row.model} />
						</th>
						<td class="tbl-num param-cell" data-model-type={row.model.modelType}>
							{fmtParamsValue(row.totalParamsB)}{#if fmtParamsUnit(row.totalParamsB)}<span
									class="unit">{fmtParamsUnit(row.totalParamsB)}</span
								>{/if}
						</td>
						{#if showOpenness}
							{@const hasOpenness = opennessScore(row.model) !== null}
							<td
								class="openness-cell"
								class:has-openness={hasOpenness}
								onpointerover={(e) => hasOpenness && showOpennessTip(e, row)}
								onpointerout={hideOpennessTip}
								onfocusin={(e) => hasOpenness && showOpennessTip(e, row)}
								onfocusout={hideOpennessTip}
							>
								{#if hasOpenness}
									<!-- A `<td>` isn't focusable, so the breakdown portal was pointer-only.
									     A real button gives keyboard users a tab stop; the tip shows on
									     focus (handled by the cell's `onfocusin`) and Escape dismisses it,
									     per the ARIA tooltip pattern. The button's accessible name comes
									     from the meter's own `role="img"` label. -->
									<button
										type="button"
										class="openness-trigger"
										onkeydown={(e) => e.key === 'Escape' && hideOpennessTip()}
									>
										<OpennessMeter model={row.model} compact />
									</button>
								{/if}
							</td>
						{/if}
						{#if showZeroShot}
							<td class="tbl-num zs-cell" class:partial={row.zeroShotPct === -1}>
								{fmtZeroShot(row.zeroShotPct)}
							</td>
						{/if}
						{#if showMeanTask}
							<td
								class="tbl-num {heat(row.meanTask, worstMeanTask, bestMeanTask)}"
								class:tbl-best={row.meanTask === bestMeanTask}
							>
								{fmtPct(row.meanTask)}
							</td>
						{/if}
						{#if showMeanTaskType}
							<td
								class="tbl-num {heat(row.meanTaskType, worstMeanTaskType, bestMeanTaskType)}"
								class:tbl-best={row.meanTaskType === bestMeanTaskType}
							>
								{fmtPct(row.meanTaskType)}
							</td>
						{/if}
						{#if showPublicPrivate}
							{@const mp = publicMeansByRow.get(row) ?? null}
							{@const mpr = privateMeansByRow.get(row) ?? null}
							<td
								class="tbl-num {heat(mp, worstMeanPublic, bestMeanPublic)}"
								class:tbl-best={mp != null && mp === bestMeanPublic}
							>
								{fmtPct(mp)}
							</td>
							<td
								class="tbl-num {heat(mpr, worstMeanPrivate, bestMeanPrivate)}"
								class:tbl-best={mpr != null && mpr === bestMeanPrivate}
							>
								{fmtPct(mpr)}
							</td>
						{/if}
						{#if showTaskTypes}
							{#each sortedTaskTypes as tt (tt)}
								{@const v = row.scoresByTaskType[tt]}
								<td
									class="tbl-num {heat(v, worst[tt], best[tt])}"
									class:tbl-best={v !== undefined && v === best[tt]}
								>
									{v !== undefined ? fmtPct(v) : ''}
								</td>
							{/each}
						{/if}
						{#if showCustomGroups}
							{#each summary.customGroupings ?? [] as dim (dim.name)}
								{@const bw = customGroupBests.get(dim.name)}
								{#each dim.groups as g (g.label)}
									{@const v = row.scoresByCustomGroup?.[dim.name]?.[g.label]}
									{@const cgWorst = bw?.worst[g.label] ?? Infinity}
									{@const cgBest = bw?.best[g.label] ?? -Infinity}
									<td
										class="tbl-num {heat(v, cgWorst, cgBest)}"
										class:tbl-best={v !== undefined && v === cgBest}
									>
										{v !== undefined ? fmtPct(v) : ''}
									</td>
								{/each}
							{/each}
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Column-header tooltip — `interactive` so the user can click any
	     [link](url) we slip into the body. The cell's pointerleave
	     still fires on exit because the bubble's `pointerenter` /
	     `pointerleave` chain back into `keepTip` / `hideTip`. -->
	<HoverPortal
		visible={tipState.visible}
		title={tipState.title}
		x={tipState.x}
		y={tipState.y}
		interactive
		onPointerEnter={keepTip}
		onPointerLeave={hideTip}
	>
		<span class="tip-portal-body"><MarkdownText text={tipState.text} /></span>
	</HoverPortal>

	<!-- Model-cell tooltip is the shared `ModelHoverPortal` so all three
	     leaderboard tables (Summary / PerTask / PerLanguage) render
	     byte-identical bubbles. -->
	<ModelHoverPortal bind:this={modelTipPortal} />

	<!-- Per-cell openness breakdown — same card-style meter + dimensions. -->
	<OpennessHoverPortal bind:this={opennessTipPortal} />
</div>

<style>
	/* Stretch this table to the full main-column width — shared `.tbl` deliberately
	   doesn't set a width because per-task/language tables let columns size to
	   content. */
	.summary-table {
		width: 100%;
	}
	/* Dimension label cell (e.g. "Memory Type") grouping a set of columns
	   under one name — sits in the main header row's trailing edge, colspan
	   over its group columns, with a bottom border removed so it visually
	   merges into the sub-header row of individual group columns beneath it
	   (`.cg-subhead`). Every other header cell in this row uses `rowspan`
	   instead of a matching cell here, so this second row only ever adds
	   height above the aggregated columns, not the whole table. */
	.cg-dim-head {
		padding: 6px 12px 2px;
		text-align: center;
		vertical-align: bottom;
		border-bottom: none;
		font-weight: 600;
		font-size: 12px;
		color: var(--text-muted);
		background: var(--surface-muted);
		white-space: nowrap;
	}
	/* Tooltip shell + title styles live in HoverPortal.svelte. We only
	   own the column-tip body wrapper so MarkdownText output (links,
	   spans, etc.) sits as a block under the title. */
	.tip-portal-body {
		display: block;
	}

	/* `.type-icon` + per-model-type tints, plus shared row hover, live in
	   src/lib/styles/leaderboard-table.css. The link inside the model
	   cell now comes from ModelCellName.svelte; `:global(...)` reaches
	   it across the component boundary so the dotted-underline hint
	   (only on SummaryTable's tip-bearing cells) still applies. */
	.has-tip :global(.tbl-model-link) {
		text-decoration: underline dotted color-mix(in srgb, var(--link) 50%, transparent);
		text-underline-offset: 3px;
		text-decoration-thickness: 1px;
	}
	.has-tip :global(.tbl-model-link:hover) {
		text-decoration-color: var(--link);
	}
	.sort-btn {
		all: unset;
		/* `all: unset` flips box-sizing back to content-box; force border-box. */
		box-sizing: border-box;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 10px 12px;
		cursor: pointer;
		color: var(--text-muted);
		font-weight: 600;
		transition: color 0.12s;
	}
	.sort-btn.tbl-num {
		justify-content: flex-end;
	}
	.zs-cell {
		font-variant-numeric: tabular-nums;
	}
	.zs-cell.partial {
		color: var(--text-subtle);
		font-weight: 500;
	}
	/* `.openness-cell` / `.openness-trigger` live in
	   src/lib/styles/leaderboard-table.css — shared with ModelsTable. Only the
	   centring is local: this table centres the column, /models left-aligns it
	   alongside its other attribute columns. */
	.openness-head .sort-btn {
		justify-content: center;
	}
	.openness-cell {
		text-align: center;
	}
	.sort-btn:hover {
		color: var(--text);
		background: color-mix(in srgb, var(--primary-soft) 60%, transparent);
	}
	.sort-btn:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: -2px;
		border-radius: 4px;
	}
	.ind {
		font-size: 11px;
		color: var(--text-muted);
		opacity: 0.85;
		transition:
			opacity 0.12s,
			color 0.12s;
		font-weight: 700;
	}
	.sort-btn:hover .ind {
		opacity: 1;
	}
	.ind.on {
		color: var(--primary-strong);
		opacity: 1;
	}
	/* `.unit` lives in src/lib/styles/leaderboard-table.css — shared with
	   ModelsTable so the two tables format params identically. */
	/* Pin button + rank pill share the leftmost column. */
	.rank-cell {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 8px;
	}
	/* Combined pin + rank column. Single source of truth for the
	   column width — `.sticky-model` reads the same token for its
	   `left` offset so the two columns butt cleanly regardless of
	   how wide the rank pill ends up. Bumped from 72px so 4-digit
	   ranks (#1234) don't get clipped under the sticky model column. */
	.summary-table {
		--rank-col-w: 88px;
	}
	.sticky-left {
		position: sticky;
		left: 0;
		background: var(--surface);
		z-index: 2;
		width: var(--rank-col-w);
		min-width: var(--rank-col-w);
		max-width: var(--rank-col-w);
	}
	.sticky-left .sort-btn {
		justify-content: flex-start;
		padding: 10px 8px 10px 12px;
	}
	tbody td.sticky-left {
		padding: 0;
	}
	thead th.sticky-left {
		background: var(--surface-muted);
		z-index: 3;
	}
	tbody tr:nth-child(even) td.sticky-left {
		background: var(--row-alt);
	}
	.sticky-model {
		position: sticky;
		left: var(--rank-col-w);
		background: var(--surface);
		z-index: 2;
		/* Hold the column to a fixed width window. Long model names wrap
		   inside the cell (row grows in height) instead of either truncating
		   or stretching the column. */
		width: 260px;
		min-width: 260px;
		max-width: 260px;
		white-space: normal;
		overflow-wrap: anywhere;
		vertical-align: middle;
	}
	thead th.sticky-model {
		background: var(--surface-muted);
		z-index: 3;
	}
	tbody tr:nth-child(even) th.sticky-model {
		background: var(--row-alt);
	}
	/* Per-component pinned overrides — the generic `tr.pinned :is(td, th)`
	   rules in leaderboard-table.css (specificity 0,2,3 / 0,3,3) lose to
	   the Svelte-scoped even-row rule above (0,4,3 once the scoping class
	   is added), so pinned rows would otherwise show the zebra tint on
	   the sticky columns. */
	tbody tr.pinned td.sticky-left,
	tbody tr.pinned th.sticky-model {
		background: var(--row-pinned-bg);
	}
	tbody tr.pinned:nth-child(even) td.sticky-left,
	tbody tr.pinned:nth-child(even) th.sticky-model {
		background: var(--row-pinned-bg-alt);
	}

	/* Mobile: 72 px (rank) + 260 px (model) of sticky pane eats almost
	   the whole 375 px viewport, leaving the score columns unreachable.
	   Drop the stickyness and let everything flow inside the horizontal
	   scroll container — rank and model just become the first two
	   columns the user scrolls past. */
	@media (max-width: 640px) {
		.sticky-left,
		thead th.sticky-left,
		tbody td.sticky-left {
			position: static;
			width: auto;
			min-width: 0;
		}
		.sticky-model,
		thead th.sticky-model {
			position: static;
			left: auto;
			width: auto;
			min-width: 160px;
			max-width: 200px;
		}
	}
</style>
