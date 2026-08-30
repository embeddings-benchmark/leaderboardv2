<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { leaderboard } from '$lib/stores/leaderboard.svelte';
	import { filters, applyFilters } from '$lib/stores/filters.svelte';
	import { pinnedModels } from '$lib/stores/pinned.svelte';
	import { safeIdle, safeCancelIdle } from '$lib/idle';
	import { primeBenchmarkCache } from '$lib/data/service';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// `$effect.pre` ensures this runs before the leaderboard store's load effect
	// regardless of source order.
	$effect.pre(() => {
		primeBenchmarkCache(data.benchmark.name, data.benchmark);
	});

	import FilterSidebar from '$lib/components/FilterSidebar.svelte';
	import ShareMeta from '$lib/components/ShareMeta.svelte';
	import ScrollToTopButton from '$lib/components/ScrollToTopButton.svelte';
	import SkeletonTable from '$lib/components/SkeletonTable.svelte';
	import CiteBlock from '$lib/components/CiteBlock.svelte';
	import CopyableId from '$lib/components/CopyableId.svelte';
	import ShareUrlButton from '$lib/components/ShareUrlButton.svelte';
	import MarkdownText from '$lib/components/MarkdownText.svelte';
	import { apiUrl, isIconUrl, sortModalities } from '$lib/format';
	import { opennessScore, opennessDimensions, OPENNESS_DIMENSIONS } from '$lib/openness';
	import { sanitizeFilename, type CsvCell } from '$lib/csv';
	import { getParam, updateUrl } from '$lib/url-state';
	import ModelSearchBar from '$lib/components/ModelSearchBar.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import SummaryTable from '$lib/components/SummaryTable.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import DownloadButton from '$lib/components/DownloadButton.svelte';
	import PerfSizeTab from '$lib/components/PerfSizeTab.svelte';
	import PerfTimeTab from '$lib/components/PerfTimeTab.svelte';
	import PerTaskTab from '$lib/components/PerTaskTab.svelte';
	import PerLanguageTab from '$lib/components/PerLanguageTab.svelte';
	import TaskInfoTab from '$lib/components/TaskInfoTab.svelte';

	let benchmarkName = $derived(data.benchmark.name);
	// Loader guarantees `data.benchmark` for the current slug (a miss throws
	// error(404)). Prefer the store's copy once it lands so summary-derived
	// fields stay in sync; otherwise fall back to the loader's copy.
	let benchmark = $derived(
		leaderboard.benchmark?.name === benchmarkName ? leaderboard.benchmark : data.benchmark
	);
	// Hero accent follows the canonical modality priority
	// (`video → audio → image → text`) — matches the BenchmarkCard tint
	// on /benchmarks so a card and its detail page read as the same surface.
	let accentModality = $derived(sortModalities(benchmark?.modalities)[0] ?? 'text');

	type TabId = 'summary' | 'perf_size' | 'perf_time' | 'perf_task' | 'perf_language' | 'task_info';
	// `perf_language` is filtered out below when the benchmark has no
	// `language_view` — its column list is undefined without one.
	const ALL_TABS: { id: TabId; label: string }[] = [
		{ id: 'summary', label: 'Summary' },
		{ id: 'perf_size', label: 'Performance per Model Size' },
		{ id: 'perf_time', label: 'Performance over Time' },
		{ id: 'perf_task', label: 'Performance per task' },
		{ id: 'perf_language', label: 'Performance per language' },
		{ id: 'task_info', label: 'Task information' }
	];
	let hasLanguageView = $derived(
		benchmark.languageView === 'all' ||
			(Array.isArray(benchmark.languageView) && benchmark.languageView.length > 0)
	);
	let TABS = $derived(ALL_TABS.filter((t) => t.id !== 'perf_language' || hasLanguageView));
	// Fall back to Summary if the deep-linked tab is no longer available
	// (e.g. ?tab=perf_language on a benchmark without language_view).
	$effect(() => {
		if (activeTab === 'perf_language' && !hasLanguageView) {
			activeTab = 'summary';
		}
	});

	// Validate against ALL_TABS — the reactive TABS isn't populated
	// at module init; the fallback effect above handles late removal.
	const TAB_IDS = new Set(ALL_TABS.map((t) => t.id));
	const initialTab = getParam('tab');
	let activeTab = $state<TabId>(
		initialTab && TAB_IDS.has(initialTab as TabId) ? (initialTab as TabId) : 'summary'
	);
	$effect(() => {
		// Default tab is implicit — omit from URL so the canonical share link
		// for the default view stays clean.
		updateUrl({ tab: activeTab === 'summary' ? null : activeTab });
	});

	// Mount-and-keep: once a tab body has been rendered, leave it in the DOM
	// and just hide it on switch. The big tables (PerTaskTab in particular —
	// hundreds of rows × dozens of task columns) take ~400ms to mount cold;
	// flipping `class:active` + content-visibility is ~1ms, so this trades
	// a one-time cost per tab for near-instant switches forever after.
	const visited = new SvelteSet<TabId>();
	$effect(() => {
		if (!visited.has(activeTab)) visited.add(activeTab);
	});

	// Pre-mount the heavy table panes once the active tab + filteredSummary
	// have rendered. They're created into `content-visibility: hidden` so
	// the layout/paint cost lands during idle time rather than when the
	// user clicks the tab. Combined with the cached-pane swap below, the
	// per-task / per-language tabs feel instant on first click. Each table
	// receives `active={activeTab === <id>}` so inactive panes can opt out
	// of pin-state reactivity (see the `active` prop in SummaryTable /
	// PerTaskTab / PerLanguageTab).
	const PREWARM: TabId[] = ['perf_task', 'perf_language'];
	$effect(() => {
		if (typeof window === 'undefined') return;
		if (!filteredSummary) return;
		const pending = PREWARM.filter(
			(t) => !visited.has(t) && (t !== 'perf_language' || hasLanguageView)
		);
		if (pending.length === 0) return;
		let cancelled = false;
		let handle: number | null = null;
		function next() {
			if (cancelled) return;
			const tab = pending.shift();
			if (!tab) return;
			handle = safeIdle(() => {
				if (cancelled) return;
				visited.add(tab);
				next();
			}, 2000);
		}
		next();
		return () => {
			cancelled = true;
			if (handle !== null) safeCancelIdle(handle);
		};
	});

	// Bound to the live PerLanguageTab instance so the page-level toolbar
	// can call its `buildCsv()` for the Download CSV button — keeps the
	// download next to the search bar like the other tabs, instead of
	// PerLanguageTab rendering its own button on a separate row.
	let perLanguageTab = $state<{ buildCsv: () => ReturnType<typeof buildPerTaskCsv> } | null>(null);

	$effect(() => {
		if (!benchmarkName) return;
		// Trigger load both when the URL benchmark differs from the store's
		// current selection AND when it matches but the summary hasn't loaded yet
		// (cold visit where selected already defaulted to this benchmark name).
		const needsSwitch = leaderboard.selected !== benchmarkName;
		const needsInitialLoad = !leaderboard.summary && !leaderboard.loading;
		if (needsSwitch || needsInitialLoad) {
			leaderboard.select(benchmarkName);
		}
	});

	// Pins are benchmark-scoped: persist across tab switches but
	// reset when the active benchmark changes. The $effect handles
	// stay-within-route nav (component reused, benchmarkName flips);
	// the onMount handles unmount→remount nav (URL is the canonical
	// persistence — no `?pin=` means no pins for this view).
	let prevBenchmarkForPins: string | null = null;
	$effect(() => {
		const current = benchmarkName;
		if (prevBenchmarkForPins !== null && prevBenchmarkForPins !== current) {
			pinnedModels.clear();
		}
		prevBenchmarkForPins = current;
	});
	onMount(() => {
		if (!page.url.searchParams.get('pin') && pinnedModels.size > 0) {
			pinnedModels.clear();
		}
	});
	$effect(() => {
		// Only feed initFor a summary that matches the current page. During
		// in-app navigation between two /benchmark/* pages, this effect can
		// fire while `leaderboard.summary` still holds the previous
		// benchmark's data (the async `select()` hasn't completed). If we
		// ran initFor with the stale summary, it would see "same benchmark"
		// against its `lastBenchmarkName` tracker, skip the reset, and call
		// sync() — which writes the previous benchmark's narrowed filter
		// picks into the NEW URL, persisting them across the navigation.
		if (!leaderboard.summary || leaderboard.summary.benchmarkName !== benchmarkName) return;
		filters.initFor(leaderboard.summary);
	});

	// When the language filter narrows, refetch the summary with
	// ``?languages=…`` so the server recomputes mean / per-task / per-type
	// scores over only the picked subsets. Toggling back to "all" refetches
	// the unfiltered summary (and hits the preload-warmed cache).
	$effect(() => {
		if (!leaderboard.summary || leaderboard.selected !== benchmarkName) return;
		const narrowed =
			filters.languages.size > 0 && filters.languages.size < filters.availableLanguages.length;
		const langs = narrowed ? Array.from(filters.languages) : undefined;
		leaderboard.requestSummaryForLanguages(langs);
	});

	// Guard on `summary.benchmarkName`, NOT `leaderboard.selected`. `select()`
	// flips `selected` synchronously before the async fetch completes, so a
	// `selected === benchmarkName` check passes while `summary` still holds the
	// previous benchmark's rows — the table flashes stale data for the duration
	// of the fetch. The summary's own `benchmarkName` is the authoritative
	// "which benchmark does this payload represent" identifier.
	let filteredSummary = $derived(
		leaderboard.summary && leaderboard.summary.benchmarkName === benchmarkName
			? applyFilters(leaderboard.summary)
			: null
	);
	// Count of fully-evaluated models: `meanTask` is `null` whenever a row is
	// missing any task cell, so non-null means every task in the benchmark
	// scored. Used by the Models KPI so partial-coverage rows aren't tallied.
	let fullyEvaluatedCount = $derived(
		filteredSummary?.rows.filter((r) => r.meanTask !== null).length ?? 0
	);

	// CSV builders for the three downloadable tabs. Wrapped as lazy closures
	// so DownloadButton only pays the serialisation cost on click.
	function buildSummaryCsv() {
		const s = filteredSummary!;
		const aggs = new Set(s.aggregations ?? []);
		const showTask = aggs.has('mean_task');
		const showType = aggs.has('mean_task_type');
		const showPP = aggs.has('public_private');
		const showTT = aggs.has('task_types');
		const publicNames = new Set(s.tasksMeta.filter((t) => t.isPublic !== false).map((t) => t.name));
		const privateNames = new Set(
			s.tasksMeta.filter((t) => t.isPublic === false).map((t) => t.name)
		);
		const meanOver = (row: (typeof s.rows)[number], names: Set<string>): number | null => {
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
			return n === names.size ? sum / n : null;
		};
		const headers = [
			'Rank',
			'Model',
			'Model Type',
			'Open Weights',
			'Instruction Tuned',
			'ST Compatible',
			'Modalities',
			'License',
			'Release Date',
			'Memory (MB)',
			'Zero-shot',
			'Active Params (B)',
			'Total Params (B)',
			'Embedding Dim',
			'Max Tokens',
			'Openness Score',
			...OPENNESS_DIMENSIONS.map((d) => `Openness: ${d.label}`),
			...(showTask ? ['Mean (Task)'] : []),
			...(showType ? ['Mean (TaskType)'] : []),
			...(showPP ? ['Mean (Public)', 'Mean (Private)'] : []),
			...(showTT ? s.taskTypes : [])
		];
		const pct = (v: number | null | undefined) => (v == null ? null : (v * 100).toFixed(2));
		const bool = (v: boolean | null | undefined): string | null =>
			v == null ? null : v ? 'true' : 'false';
		const rows: CsvCell[][] = s.rows.map((row) => {
			const m = row.model;
			const oScore = opennessScore(m);
			const oDims = opennessDimensions(m);
			return [
				row.rank,
				m.name,
				m.modelType,
				bool(m.openWeights),
				bool(m.instructionTuned),
				bool(m.sentenceTransformersCompatible),
				sortModalities(m.modalities).join('; ') || null,
				m.license ?? null,
				m.releaseDate ?? null,
				m.memoryUsageMb ?? null,
				row.zeroShotPct === -1 ? 'NA' : row.zeroShotPct,
				row.activeParamsB,
				row.totalParamsB,
				row.embeddingDim,
				row.maxTokens,
				oScore,
				...OPENNESS_DIMENSIONS.map((_, i) => (oScore === null ? null : bool(oDims[i].open))),
				...(showTask ? [pct(row.meanTask)] : []),
				...(showType ? [pct(row.meanTaskType)] : []),
				...(showPP ? [pct(meanOver(row, publicNames)), pct(meanOver(row, privateNames))] : []),
				...(showTT ? s.taskTypes.map((tt) => pct(row.scoresByTaskType[tt])) : [])
			];
		});
		return { headers, rows };
	}

	function buildPerTaskCsv() {
		const s = filteredSummary!;
		const headers = ['Rank', 'Model', ...s.tasks];
		const pct = (v: number | null | undefined) => (v == null ? null : (v * 100).toFixed(2));
		const rows: CsvCell[][] = s.rows.map((row) => [
			row.rank,
			row.model.name,
			...s.tasks.map((t) => pct(row.scoresByTask[t]))
		]);
		return { headers, rows };
	}
</script>

<ShareMeta
	title={benchmark?.displayName ?? benchmarkName}
	description={benchmark?.description
		? `${benchmark.tasks.length} tasks, ${benchmark.languages.length} languages, ${filteredSummary?.rows.length ?? '—'} models — ${benchmark.description}`
		: `Benchmark on the MTEB Leaderboard.`}
	entity={{ kind: 'benchmark', name: benchmarkName }}
	image={benchmark?.icon && isIconUrl(benchmark.icon) ? apiUrl(benchmark.icon) : undefined}
/>

<div class="layout-sidebar">
	<main id="main-content" tabindex="-1" class="main">
		<nav class="breadcrumb" aria-label="Breadcrumb">
			<a href={resolve('/')}>Home</a>
			<span class="sep">/</span>
			<a href={resolve('/benchmarks')}>Benchmarks</a>
			<span class="sep">/</span>
			<span class="current">{benchmark?.displayName ?? benchmarkName}</span>
		</nav>

		{#if leaderboard.error}
			<section class="empty panel">
				<h1>Couldn't load benchmark</h1>
				<p>{leaderboard.error}</p>
				<a class="back" href={resolve('/')}>← Back home</a>
			</section>
		{:else}
			<section class="hero panel hero-grid accent-rail" data-modality={accentModality}>
				<div class="hero-left">
					<div class="title-block">
						{#if benchmark.icon}
							{#if isIconUrl(benchmark.icon)}
								<img
									class="hero-icon icon-tile"
									src={apiUrl(benchmark.icon)}
									alt="{benchmark.displayName} icon"
									width="32"
									height="32"
									fetchpriority="high"
									crossorigin="anonymous"
								/>
							{:else}
								<span class="hero-icon icon-tile icon-tile-text" aria-hidden="true"
									>{benchmark.icon}</span
								>
							{/if}
						{/if}
						<div class="title-text">
							<h1>{benchmark.displayName}</h1>
							<CopyableId value={benchmark.name} ariaLabel="Copy benchmark id" />
						</div>
					</div>
					<p class="desc"><MarkdownText text={benchmark.description} /></p>
					{#if benchmark.reference}
						<!-- External paper URL -->
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a class="ref" href={benchmark.reference} target="_blank" rel="noreferrer">
							Reference paper →
						</a>
					{/if}
					<CiteBlock kind="benchmark" citation={benchmark.citation} />
				</div>
				<div class="kpis">
					<div class="kpi">
						<span class="kpi-label">Languages</span>
						<span class="kpi-value">{benchmark.languages.length}</span>
					</div>
					<div class="kpi">
						<span class="kpi-label">Tasks</span>
						<span class="kpi-value">{filteredSummary?.tasks.length ?? benchmark.tasks.length}</span>
					</div>
					<div class="kpi">
						<span class="kpi-label">Task Types</span>
						<span class="kpi-value"
							>{filteredSummary?.taskTypes.length ?? benchmark.taskTypes.length}</span
						>
					</div>
					<div class="kpi">
						<span class="kpi-label">Models</span>
						<span class="kpi-value">{fullyEvaluatedCount}</span>
					</div>
				</div>
			</section>

			<Tabs tabs={TABS} active={activeTab} onSelect={(id) => (activeTab = id)} />

			<ProgressBar
				active={leaderboard.loading || leaderboard.refetching}
				label={leaderboard.refetching ? 'Recomputing scores' : 'Loading benchmark'}
			/>

			{#if activeTab === 'summary' || activeTab === 'perf_task' || activeTab === 'perf_language'}
				<div class="toolbar-row">
					<ModelSearchBar
						matchCount={filteredSummary?.rows.length}
						totalCount={leaderboard.summary?.rows.length}
					/>
					{#if activeTab === 'summary' && filteredSummary}
						<DownloadButton
							filename="{sanitizeFilename(benchmark.name)}_summary"
							build={buildSummaryCsv}
						/>
					{:else if activeTab === 'perf_task' && filteredSummary}
						<DownloadButton
							filename="{sanitizeFilename(benchmark.name)}_per_task"
							build={buildPerTaskCsv}
						/>
					{:else if activeTab === 'perf_language' && filteredSummary && perLanguageTab}
						<DownloadButton
							filename="{sanitizeFilename(benchmark.name)}_per_language"
							build={() => perLanguageTab!.buildCsv()}
						/>
					{/if}
				</div>
			{/if}

			<section class="tab-body">
				{#if !filteredSummary}
					<SkeletonTable />
				{:else if filteredSummary.rows.length === 0}
					<p class="muted">No models match the current filters.</p>
				{:else}
					<!-- Mount-and-keep: each pane is created on first activation
					     (or earlier via the PREWARM idle scheduler) and stays in
					     the DOM. `class:active` flips content-visibility so
					     subsequent tab switches restore the cached layer. Each
					     table gets `active={activeTab === <id>}` so inactive
					     panes opt out of pin-state reactivity (pin click cost
					     stays scoped to the visible tab). -->
					{#if visited.has('summary')}
						<div class="tab-pane" class:active={activeTab === 'summary'}>
							<SummaryTable
								summary={filteredSummary}
								active={activeTab === 'summary'}
								benchmarkModalities={benchmark.modalities}
							/>
						</div>
					{/if}
					{#if visited.has('perf_size')}
						<div class="tab-pane" class:active={activeTab === 'perf_size'}>
							<PerfSizeTab summary={filteredSummary} />
						</div>
					{/if}
					{#if visited.has('perf_time')}
						<div class="tab-pane" class:active={activeTab === 'perf_time'}>
							<PerfTimeTab summary={filteredSummary} />
						</div>
					{/if}
					{#if visited.has('perf_task')}
						<!-- `data-prepaint`: keep the pane in the paint pipeline while
						     hidden (clip-path: inset(100%) below). Browser caches the
						     painted layer so first click after the idle pre-mount is
						     nearly instant. Only applied to table panes — Plotly tabs
						     need a real-size container on mount. -->
						<div class="tab-pane" class:active={activeTab === 'perf_task'} data-prepaint>
							<PerTaskTab
								summary={filteredSummary}
								active={activeTab === 'perf_task'}
								benchmarkModalities={benchmark.modalities}
							/>
						</div>
					{/if}
					{#if visited.has('perf_language') && hasLanguageView && benchmark.languageView}
						<div class="tab-pane" class:active={activeTab === 'perf_language'} data-prepaint>
							<PerLanguageTab
								summary={filteredSummary}
								languageView={benchmark.languageView}
								active={activeTab === 'perf_language'}
								benchmarkModalities={benchmark.modalities}
								bind:this={perLanguageTab}
							/>
						</div>
					{/if}
					{#if visited.has('task_info')}
						<div class="tab-pane" class:active={activeTab === 'task_info'}>
							<TaskInfoTab {benchmark} tasksMeta={filteredSummary.tasksMeta} />
						</div>
					{/if}
				{/if}
			</section>
		{/if}
	</main>

	<FilterSidebar />
</div>

<ScrollToTopButton />
<ShareUrlButton />

<style>
	/* No max-width cap so the leaderboard table can stretch full
	   width on ultrawide displays. */
	.main {
		flex: 1;
		min-width: 0;
		padding: 18px 12px 40px 28px;
	}

	/* `.hero-grid` shell from detail-page.css; overrides hug KPIs to content. */
	.hero {
		--hero-cols: minmax(0, 1fr) auto;
		--hero-padding-block: 22px;
		--hero-padding-inline: 30px 26px;
		--hero-margin-block-end: 16px;
	}
	.hero[data-modality] {
		--card-accent: var(--modality-tint-fg);
	}
	.title-block {
		display: flex;
		/* Top-align so the hero icon sits next to the h1's row, not
		   vertically centred between the h1 and the id pill below it. */
		align-items: flex-start;
		flex-wrap: wrap;
		gap: 10px;
		margin-bottom: 8px;
	}
	/* Stack the display name and the id pill vertically so the pill
	   sits *under* the name instead of being centred beside it. */
	.title-text {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		min-width: 0;
	}
	.hero-icon {
		--icon-size: 32px;
		--icon-radius: 5px;
		--icon-font-size: 22px;
	}
	.hero-left h1 {
		font-size: 26px;
		font-weight: 700;
		letter-spacing: -0.01em;
		line-height: 1.1;
		margin: 0;
		color: var(--ink-strong);
	}
	.desc {
		color: var(--text-muted);
		margin: 0 0 12px;
	}
	.ref {
		font-size: 13px;
		font-weight: 600;
	}
	/* CiteBlock lives inside the hero card now; give it a little air above. */
	.hero-left :global(.cite) {
		margin-top: 14px;
	}
	.kpis {
		display: flex;
		flex-direction: column;
		gap: 6px;
		align-self: start;
	}
	.kpi {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 6px 12px;
		min-width: 150px;
	}
	.kpi-label {
		font-size: 11px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-subtle);
		font-weight: 600;
	}
	.kpi-value {
		font-size: 15px;
		font-weight: 700;
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}
	@media (max-width: 1000px) {
		.kpis {
			flex-direction: row;
			flex-wrap: wrap;
		}
		.kpi {
			min-width: 0;
			flex: 1;
		}
	}
	@media (max-width: 640px) {
		/* 4 KPIs on a 375 px row leaves ~80 px each, which makes the
		   value (e.g. 380 models) burst out of the chip. A 2×2 grid
		   gives each ~150 px and stacks the value under the label
		   so big numbers always fit inside their tile. */
		.kpis {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 6px;
		}
		.kpi {
			flex-direction: column;
			align-items: flex-start;
			gap: 2px;
		}
		.kpi-value {
			font-size: 18px;
		}
	}

	.tab-body {
		padding-top: 14px;
		position: relative;
	}
	/* Default: inactive panes are taken out of layout via
	   `content-visibility: hidden`, which preserves the rendered state
	   without painting or laying out. First activation pays the paint
	   cost; subsequent switches restore from cache. */
	.tab-pane {
		content-visibility: hidden;
		contain-intrinsic-size: 0;
	}
	.tab-pane.active {
		content-visibility: visible;
		contain-intrinsic-size: none;
	}
	/* `data-prepaint`: render the pane fully but hide it via clip-path
	   while inactive. Unlike `content-visibility: hidden`, this keeps
	   the painted layer in the GPU cache so the first activation is
	   instant — but it costs paint cycles during the hidden phase, so
	   it's reserved for the heavy table panes that the PREWARM loop
	   pre-mounts on idle. The clip-path doesn't take the pane out of
	   layout (it still consumes its intrinsic height), so we also pin
	   it absolutely at the top-left when inactive to avoid pushing the
	   page footer down by the table's height.
	   `height: 0; overflow: hidden` clamps the absolute box to 0 px so
	   the prepainted (~3000 px) table doesn't extend document scroll
	   when a short chart tab (perf_size / perf_time at ~580 px) is
	   active. Layout still happens under content-visibility: visible,
	   so first activation stays instant — only the paint of the
	   already-clipped content is skipped. */
	.tab-pane[data-prepaint]:not(.active) {
		content-visibility: visible;
		clip-path: inset(100%);
		position: absolute;
		inset: 0 auto auto 0;
		width: 100%;
		height: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.toolbar-row {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.toolbar-row :global(.bar) {
		flex: 1;
		min-width: 0;
		margin: 8px 0;
	}

	.empty {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 40px;
		text-align: center;
	}
	.empty h1 {
		font-size: 20px;
		margin: 0 0 6px;
	}
	.empty p {
		color: var(--text-muted);
	}
	.back {
		display: inline-block;
		margin-top: 12px;
		font-weight: 600;
	}
</style>
