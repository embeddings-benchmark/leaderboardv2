<script lang="ts">
	import type { BenchmarkPerLanguage, BenchmarkSummary, SummaryRow } from '$lib/types';
	import { pinnedModels } from '$lib/stores/pinned.svelte';
	import { isBoundaryCross } from '$lib/cell-hover';
	import { stickyHead } from '$lib/actions/sticky-head';
	import { stickyHScroll } from '$lib/actions/sticky-hscroll';
	import { type CsvCell } from '$lib/csv';
	import { floatPinnedToTop, heat, rowId } from '$lib/format';
	import { createSortState } from '$lib/stores/sort.svelte';
	import { loadPerLanguage } from '$lib/data/service';
	import ModelCellName from './ModelCellName.svelte';
	import ModelHoverPortal from './ModelHoverPortal.svelte';
	import PinButton from './PinButton.svelte';
	import SortHeader from './SortHeader.svelte';
	import { onMount } from 'svelte';

	// Real per-(model, language) scores from
	// `/v1/benchmarks/{name}/per-language`. Lazy-fetched on tab mount so
	// the Summary tab doesn't pay the explode + group_by cost. Until the
	// fetch resolves the table renders `'—'` placeholders; once `data`
	// is set the derived blocks rebuild against real scores.
	let data = $state<BenchmarkPerLanguage | null>(null);
	let scoresByModel = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const m = new Map<string, Record<string, number>>();
		if (data) for (const r of data.rows) m.set(r.modelName, r.scoresByLanguage);
		return m;
	});
	onMount(() => {
		loadPerLanguage(summary.benchmarkName).then((d) => {
			data = d;
		});
	});
	function langScore(row: SummaryRow, lang: string): number | null {
		const v = scoresByModel.get(row.model.name)?.[lang];
		return typeof v === 'number' ? v * 100 : null;
	}

	type Tip = {
		showFor: (t: HTMLElement, row: SummaryRow, requiredModalities?: string[]) => void;
		hide: () => void;
	};
	let tipPortal = $state<Tip | undefined>(undefined);

	function onCellEnter(e: PointerEvent | FocusEvent, row: SummaryRow) {
		if (!isBoundaryCross(e)) return;
		tipPortal?.showFor(e.currentTarget as HTMLElement, row, benchmarkModalities);
	}
	function onCellLeave(e?: PointerEvent | FocusEvent) {
		if (e && !isBoundaryCross(e)) return;
		tipPortal?.hide();
	}

	interface Props {
		summary: BenchmarkSummary;
		// Mirrors `Benchmark.language_view`. `'all'` = union of every
		// task's languages. Parent hides the tab when not set.
		languageView: string[] | 'all';
		// See `SummaryTable.svelte` — `false` when the pane is mounted but
		// hidden behind another tab. Inactive panes skip the pin-state
		// subscription so pin clicks elsewhere don't invalidate this
		// derived.
		active?: boolean;
		// See `SummaryTable.svelte` — forwarded to `ModelCellName`.
		benchmarkModalities?: string[];
	}
	let { summary, languageView, active = true, benchmarkModalities = undefined }: Props = $props();

	let LANGUAGES = $derived.by(() => {
		if (languageView === 'all') {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const seen = new Set<string>();
			const cols: string[] = [];
			for (const t of summary.tasksMeta ?? []) {
				for (const lang of t.languages ?? []) {
					if (!seen.has(lang)) {
						seen.add(lang);
						cols.push(lang);
					}
				}
			}
			cols.sort();
			return cols;
		}
		return [...languageView];
	});

	// Single O(rows × LANGUAGES) pass produces every per-row mean + per-lang
	// extrema + cross-row mean extrema. Replaces three separate passes (one
	// per quantity) and removes the O(N²) `rowMean` calls inside the sort
	// comparator. The row→mean map gives the comparator a constant-time
	// lookup.
	let rowStats = $derived.by(() => {
		const rowMeanMap = new WeakMap<SummaryRow, number | null>();
		const best: Record<string, number> = {};
		const worst: Record<string, number> = {};
		for (const lang of LANGUAGES) {
			best[lang] = -Infinity;
			worst[lang] = Infinity;
		}
		let bestMeanV = -Infinity;
		let worstMeanV = Infinity;
		for (const r of summary.rows) {
			let sum = 0;
			let n = 0;
			for (const lang of LANGUAGES) {
				const v = langScore(r, lang);
				if (v == null) continue;
				sum += v;
				n++;
				if (v > best[lang]) best[lang] = v;
				if (v < worst[lang]) worst[lang] = v;
			}
			const mean = n > 0 ? sum / n : null;
			rowMeanMap.set(r, mean);
			if (mean != null) {
				if (mean > bestMeanV) bestMeanV = mean;
				if (mean < worstMeanV) worstMeanV = mean;
			}
		}
		return { rowMeanMap, best, worst, bestMean: bestMeanV, worstMean: worstMeanV };
	});
	const rowMean = (r: SummaryRow): number | null => rowStats.rowMeanMap.get(r) ?? null;
	let best = $derived(rowStats.best);
	let worst = $derived(rowStats.worst);
	let bestMean = $derived(rowStats.bestMean);
	let worstMean = $derived(rowStats.worstMean);

	type SortKey = 'model' | 'mean' | `lang:${string}`;
	const sort = createSortState<SortKey>({
		urlKeys: ['s.lang', 'd.lang'],
		ascKeys: ['model']
	});

	let sortedRows = $derived.by(() => {
		let rows = summary.rows;
		if (sort.key) {
			const dir = sort.dir === 'asc' ? 1 : -1;
			const key = sort.key;
			// Resolve the language label once instead of slicing the key per comparison.
			const sortLang = key.startsWith('lang:') ? key.slice(5) : '';
			rows = [...rows].sort((a, b) => {
				if (key === 'model') {
					return (
						a.model.displayName.toLowerCase().localeCompare(b.model.displayName.toLowerCase()) * dir
					);
				}
				const va: number | null = key === 'mean' ? rowMean(a) : langScore(a, sortLang);
				const vb: number | null = key === 'mean' ? rowMean(b) : langScore(b, sortLang);
				// Push nulls to the bottom regardless of direction.
				if (va == null && vb == null) return 0;
				if (va == null) return 1;
				if (vb == null) return -1;
				return (va - vb) * dir;
			});
		}
		if (!active) return rows;
		return floatPinnedToTop(rows, (r) => pinnedModels.has(rowId(r)), pinnedModels.size);
	});

	function fmt(n: number | null): string {
		if (n == null) return '—';
		return n.toFixed(2);
	}
	// Exported as an instance method (Svelte 5) so the parent page can
	// render its DownloadButton in the shared `.toolbar-row` next to
	// the search bar — same layout as the Summary and Per-task tabs —
	// instead of letting this component show its own download button
	// on a second row.
	export function buildCsv() {
		const headers = ['Rank', 'Model', 'Mean', ...LANGUAGES];
		const round = (n: number | null) => (n == null ? null : Number(n.toFixed(2)));
		const rows: CsvCell[][] = summary.rows.map((row) => [
			row.rank,
			row.model.name,
			round(rowMean(row)),
			...LANGUAGES.map((lang) => round(langScore(row, lang)))
		]);
		return { headers, rows };
	}
</script>

<div class="wrap">
	<p class="muted head-note">
		Example per-language scores for the visible models. Click any column header to sort. Values are
		simulated until the backend exposes the real per-language breakdown.
	</p>
	<div class="tbl-scroll" use:stickyHScroll>
		<table class="tbl lang-table" use:stickyHead>
			<caption class="sr-only">Per-language scores</caption>
			<thead>
				<tr>
					<th scope="col" class="tbl-pin-col tbl-sticky-pin" aria-label="Pinned"></th>
					<th scope="col" class="tbl-sticky-col" aria-sort={sort.aria('model')}>
						<SortHeader {sort} field="model" label="Model" align="left" />
					</th>
					<th scope="col" class="tbl-num" aria-sort={sort.aria('mean')}>
						<SortHeader {sort} field="mean" label="Mean" />
					</th>
					{#each LANGUAGES as lang (lang)}
						{@const k = `lang:${lang}` as SortKey}
						<th scope="col" class="tbl-num" aria-sort={sort.aria(k)}>
							<SortHeader {sort} field={k} label={lang} />
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each sortedRows as row (rowId(row))}
					{@const rid = rowId(row)}
					{@const mean = rowMean(row)}
					<tr class:pinned={pinnedModels.has(rid)}>
						<td class="tbl-pin-col tbl-sticky-pin">
							<PinButton name={rid} />
						</td>
						<th
							scope="row"
							class="tbl-sticky-col"
							data-model-type={row.model.modelType}
							onpointerover={(e) => onCellEnter(e, row)}
							onpointerout={onCellLeave}
							onfocusin={(e) => onCellEnter(e, row)}
							onfocusout={onCellLeave}
						>
							<ModelCellName
								model={row.model}
								experiments={row.experiments}
								requiredModalities={benchmarkModalities}
							/>
						</th>
						<td
							class="tbl-num {heat(mean, worstMean, bestMean)}"
							class:tbl-best={mean != null && mean === bestMean}
						>
							{fmt(mean)}
						</td>
						{#each LANGUAGES as lang (lang)}
							{@const score = langScore(row, lang)}
							<td
								class="tbl-num {heat(score, worst[lang], best[lang])}"
								class:tbl-best={score != null && score === best[lang]}
							>
								{fmt(score)}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<ModelHoverPortal bind:this={tipPortal} />
</div>

<style>
	.wrap {
		padding-top: 8px;
	}
	/* `.muted` (color + margin: 0) lives in src/app.css. */
	.head-note {
		margin: 0 0 12px;
	}
	/* Per-language table always fits the main column; stretch to fill it. */
	.lang-table {
		width: 100%;
	}
</style>
