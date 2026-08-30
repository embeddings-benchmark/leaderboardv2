<script lang="ts">
	import { resolve } from '$app/paths';
	import { loadModelScores, loadTasks } from '$lib/data/service';
	import type { ModelMeta, ModelScores } from '$lib/types';
	import BenchScoreTable, { type BenchScore } from '$lib/components/BenchScoreTable.svelte';
	import CiteBlock from '$lib/components/CiteBlock.svelte';
	import DownloadButton from '$lib/components/DownloadButton.svelte';
	import ModalityIcon from '$lib/components/ModalityIcon.svelte';
	import OpennessMeter from '$lib/components/OpennessMeter.svelte';
	import { opennessScore } from '$lib/openness';
	import ShareMeta from '$lib/components/ShareMeta.svelte';
	import { sortModalities } from '$lib/format';
	import ScrollToTopButton from '$lib/components/ScrollToTopButton.svelte';
	import ShareUrlButton from '$lib/components/ShareUrlButton.svelte';
	import SkeletonTable from '$lib/components/SkeletonTable.svelte';
	import { sanitizeFilename, type CsvCell } from '$lib/csv';
	import { COLLATOR, fmtInt, fmtParamsUnit, fmtParamsValue, modelPath, slug } from '$lib/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let modelName = $derived(data.modelName);

	// Scores aren't in the loader — fetched client-side here so prerender
	// only awaits the hero metadata. Stale-guard via `modelName === name`
	// so a slow earlier fetch can't overwrite a rapid model→model nav.
	let payload = $state<ModelScores | null>(null);
	let loadingScores = $state(true);
	let scoresError = $state<string | null>(null);
	$effect(() => {
		const name = modelName;
		payload = null;
		scoresError = null;
		loadingScores = true;
		loadModelScores(name).then(
			(s) => {
				if (modelName !== name) return;
				payload = s;
				loadingScores = false;
			},
			(e) => {
				if (modelName !== name) return;
				scoresError = e instanceof Error ? e.message : String(e);
				loadingScores = false;
			}
		);
	});

	// Scores payload carries a refined model with summary-derived fields;
	// loader guarantees `data.model` (a miss throws error(404)), so this
	// is always non-null.
	let model = $derived<ModelMeta>(payload?.model ?? data.model);

	let rawRows = $derived.by<BenchScore[]>(() => {
		if (!payload) return [];
		return payload.rows.map((r) => ({
			benchmarkName: r.benchmarkName,
			benchmarkDisplay: r.benchmarkDisplayName,
			rank: r.rank,
			meanTask: r.meanTask,
			meanTaskType: r.meanTaskType,
			zeroShotPct: r.zeroShotPct,
			totalModels: r.totalModels
		}));
	});

	// `bestBenchmark` keeps the API's rank-1 entry regardless of user-applied
	// sort. No longer surfaced as a KPI, but still drives the default
	// benchmark for the "Compare with another model" link.
	let bestBenchmark = $derived(rawRows[0] ?? null);

	// Which trainingDatasets entries map onto real mteb tasks (so we can
	// render them as links rather than plain chips). Fetched lazily once per
	// session — the /tasks endpoint is large; we only pay for it if this
	// model actually has training_datasets set.
	let mtebTaskNames = $state<Set<string>>(new Set());
	$effect(() => {
		const ds = model?.trainingDatasets;
		if (!ds || ds.length === 0 || mtebTaskNames.size > 0) return;
		loadTasks()
			.then((tasks) => {
				mtebTaskNames = new Set(tasks.map((t) => t.name));
			})
			.catch(() => {
				/* leave empty — chips render as plain text on failure */
			});
	});

	function fmtMemoryMb(mb: number | null | undefined): string {
		if (mb == null || mb <= 0) return '—';
		// Use GB once we cross 1024 MB so the number stays short.
		if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
		return `${Math.round(mb)} MB`;
	}
	function compareHref(modelName: string, seed: BenchScore | null): string {
		// Local URL builder, not held by $state — plain URLSearchParams is correct.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams({ model: modelName });
		if (seed) params.set('benchmark', seed.benchmarkName);
		return `${resolve('/compare')}?${params.toString()}`;
	}
	function buildCsv() {
		// Column order mirrors the on-screen `BenchScoreTable`: Benchmark,
		// Zero-shot, Rank, Total Models, Mean (Task), Mean (TaskType).
		const headers = [
			'Benchmark',
			'Zero-shot',
			'Rank',
			'Total Models',
			'Mean (Task)',
			'Mean (TaskType)'
		];
		const pct = (v: number | null | undefined) => (v == null ? null : (v * 100).toFixed(2));
		const rows: CsvCell[][] = rawRows.map((s) => [
			s.benchmarkName,
			s.zeroShotPct === -1 ? 'NA' : s.zeroShotPct,
			s.rank,
			s.totalModels,
			pct(s.meanTask),
			pct(s.meanTaskType)
		]);
		return { headers, rows };
	}
</script>

<ShareMeta
	title={model.displayName}
	description={`${model.modelType} embedding model · ${fmtParamsValue(model.totalParamsB)}${fmtParamsUnit(model.totalParamsB)} params · ${model.embeddingDim || '—'}-dim · ${model.maxTokens || '—'} max tokens${model.openWeights ? ' · open weights' : ''}`}
	entity={{ kind: 'model', name: modelName }}
/>

<main id="main-content" tabindex="-1" class="page">
	<nav class="breadcrumb" aria-label="Breadcrumb">
		<a href={resolve('/')}>Home</a>
		<span class="sep">/</span>
		<a href={resolve('/models')}>Models</a>
		<span class="sep">/</span>
		<span class="current">{model.displayName}</span>
	</nav>

	<section class="hero panel hero-grid" data-type={model.modelType}>
		<div class="hero-left">
			<div class="kicker">
				<span class="category-badge" data-type={model.modelType}>
					<span>{model.modelType}</span>
				</span>
				<span class="badge" class:open={model.openWeights}>
					{model.openWeights ? 'Open weights' : 'Proprietary'}
				</span>
				{#if model.instructionTuned}
					<span class="badge soft">Instruction-tuned</span>
				{/if}
				{#if model.sentenceTransformersCompatible}
					<span class="badge soft">ST compatible</span>
				{/if}
				{#each sortModalities(model.modalities) as mod (mod)}
					<span class="badge modality-tint" data-modality={mod} title={mod}>
						<ModalityIcon modality={mod} size={12} />
						<span>{mod}</span>
					</span>
				{/each}
			</div>
			<h1>
				<span class="org">{model.org}</span><span class="sl">/</span>{model.displayName}
			</h1>
			<div class="links">
				<!-- href returned by compareHref(), which uses resolve('/compare') internally -->
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a class="ref muted" href={compareHref(model.name, bestBenchmark)}>
					Compare with another model →
				</a>
			</div>
			<dl class="spec-list">
				<div class="row">
					<dt>Reference</dt>
					<dd>
						{#if model.url}
							<!-- External model URL (HuggingFace etc.) -->
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a href={model.url} target="_blank" rel="noreferrer">{model.url}</a>
						{:else}
							<span class="muted-dd">—</span>
						{/if}
					</dd>
				</div>
				{#if model.languages && model.languages.length > 0}
					{@const PREVIEW = 12}
					{@const langs = [...new Set(model.languages.map((l) => l.trim()).filter(Boolean))].sort(
						COLLATOR.compare
					)}
					{@const previewed = langs.slice(0, PREVIEW)}
					{@const hidden = langs.length - previewed.length}
					<div class="row">
						<dt>Languages</dt>
						<dd>
							{#if hidden <= 0}
								<span class="chips">
									{#each langs as l (l)}
										<span class="chip">{l}</span>
									{/each}
								</span>
							{:else}
								<!-- Same fold-out shape as "Trained on": closed state shows the
								     first N languages plus a "+M more" pill; opening reveals the
								     full set and flips the pill to "Show fewer". -->
								<details class="chip-foldout details-flat">
									<summary>
										<span class="chips">
											{#each previewed as l (l)}
												<span class="chip">{l}</span>
											{/each}
											<span class="chip more-toggle more-collapsed">+{hidden} more</span>
											<span class="chip more-toggle more-expanded">Show fewer</span>
										</span>
									</summary>
									<span class="chips chips-rest">
										{#each langs.slice(PREVIEW) as l (l)}
											<span class="chip">{l}</span>
										{/each}
									</span>
								</details>
							{/if}
						</dd>
					</div>
				{/if}
				{#if model.license}
					<div class="row">
						<dt>License</dt>
						<dd>{model.license}</dd>
					</div>
				{/if}
				{#if model.openness && Object.keys(model.openness).length > 0}
					<div class="row">
						<dt>Openness</dt>
						<dd>
							<span class="chips">
								{#each Object.entries(model.openness) as [criterion, met] (criterion)}
									<span class="badge" class:open={met} class:soft={!met}>{criterion}</span>
								{/each}
							</span>
							{#if model.opennessScore != null}
								<p class="openness-score">
									{model.opennessScore}/{Object.keys(model.openness).length} criteria met
								</p>
							{/if}
						</dd>
					</div>
				{/if}
				{#if model.publicTrainingCode}
					<div class="row">
						<dt>Training code</dt>
						<dd>
							{#if /^https?:\/\//.test(model.publicTrainingCode)}
								<!-- External training-code URL -->
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
								<a href={model.publicTrainingCode} target="_blank" rel="noreferrer"
									>{model.publicTrainingCode}</a
								>
							{:else}
								{model.publicTrainingCode}
							{/if}
						</dd>
					</div>
				{/if}
				{#if model.publicTrainingData}
					<div class="row">
						<dt>Training data</dt>
						<dd>
							{#if /^https?:\/\//.test(model.publicTrainingData)}
								<!-- External training-data URL -->
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
								<a href={model.publicTrainingData} target="_blank" rel="noreferrer"
									>{model.publicTrainingData}</a
								>
							{:else}
								{model.publicTrainingData}
							{/if}
						</dd>
					</div>
				{/if}
				{#if model.adaptedFrom}
					<div class="row">
						<dt>Adapted from</dt>
						<dd>
							<a
								class="model-link"
								href={resolve('/models/[...name=modelName]', {
									name: modelPath(model.adaptedFrom)
								})}>{model.adaptedFrom}</a
							>
						</dd>
					</div>
				{/if}
				{#if model.supersededBy}
					<div class="row">
						<dt>Superseded by</dt>
						<dd>
							<a
								class="model-link"
								href={resolve('/models/[...name=modelName]', {
									name: modelPath(model.supersededBy)
								})}>{model.supersededBy}</a
							>
						</dd>
					</div>
				{/if}
				{#if model.trainingDatasets && model.trainingDatasets.length > 0}
					{@const PREVIEW = 8}
					{@const datasets = model.trainingDatasets}
					{@const previewed = datasets.slice(0, PREVIEW)}
					{@const hidden = datasets.length - previewed.length}
					<div class="row">
						<dt>Trained on</dt>
						<dd>
							{#if hidden <= 0}
								<span class="chips">
									{#each datasets as ds (ds)}
										{#if mtebTaskNames.has(ds)}
											<a class="chip chip-link" href={resolve('/tasks/[name]', { name: slug(ds) })}
												>{ds}</a
											>
										{:else}
											<span class="chip">{ds}</span>
										{/if}
									{/each}
								</span>
							{:else}
								<!-- Long lists fold into a <details>. Closed state shows the
									     first N chips with a "+M more" pill so the reader still
									     sees a representative sample; opening flips that pill to
									     "Show fewer" and renders the full set. -->
								<details class="chip-foldout details-flat">
									<summary>
										<span class="chips">
											{#each previewed as ds (ds)}
												{#if mtebTaskNames.has(ds)}
													<a
														class="chip chip-link"
														href={resolve('/tasks/[name]', { name: slug(ds) })}
														onclick={(e) => e.stopPropagation()}
													>
														{ds}
													</a>
												{:else}
													<span class="chip">{ds}</span>
												{/if}
											{/each}
											<span class="chip more-toggle more-collapsed">+{hidden} more</span>
											<span class="chip more-toggle more-expanded">Show fewer</span>
										</span>
									</summary>
									<span class="chips chips-rest">
										{#each datasets.slice(PREVIEW) as ds (ds)}
											{#if mtebTaskNames.has(ds)}
												<a
													class="chip chip-link"
													href={resolve('/tasks/[name]', { name: slug(ds) })}>{ds}</a
												>
											{:else}
												<span class="chip">{ds}</span>
											{/if}
										{/each}
									</span>
								</details>
							{/if}
						</dd>
					</div>
				{/if}
			</dl>
			<CiteBlock kind="model" citation={model.citation} />
		</div>
		<div class="hero-right">
			<div class="kpis">
				<div class="kpi">
					<span class="kpi-label">Parameters</span>
					<span class="kpi-value"
						>{fmtParamsValue(model.totalParamsB)}{#if fmtParamsUnit(model.totalParamsB)}<span
								class="unit">{fmtParamsUnit(model.totalParamsB)}</span
							>{/if}</span
					>
				</div>
				<div class="kpi">
					<span class="kpi-label">Active parameters</span>
					<span class="kpi-value"
						>{fmtParamsValue(model.activeParamsB)}{#if fmtParamsUnit(model.activeParamsB)}<span
								class="unit">{fmtParamsUnit(model.activeParamsB)}</span
							>{/if}</span
					>
				</div>
				<div class="kpi">
					<span class="kpi-label">Embedding dim</span>
					<span class="kpi-value">{fmtInt(model.embeddingDim)}</span>
				</div>
				<div class="kpi">
					<span class="kpi-label">Max tokens</span>
					<span class="kpi-value">{fmtInt(model.maxTokens)}</span>
				</div>
				<div class="kpi">
					<span class="kpi-label">Memory</span>
					<span class="kpi-value">{fmtMemoryMb(model.memoryUsageMb)}</span>
				</div>
				<div class="kpi">
					<span class="kpi-label">Released</span>
					<span class="kpi-value date">{model.releaseDate ?? '—'}</span>
				</div>
			</div>
			{#if opennessScore(model) !== null}
				<section class="openness-block" aria-label="Openness">
					<h2 class="openness-title">Openness</h2>
					<OpennessMeter {model} breakdown />
				</section>
			{/if}
		</div>
	</section>

	<section class="scores">
		<header class="scores-head">
			<h2>Benchmark scores</h2>
			<span class="muted">
				{#if loadingScores}Loading…
				{:else}{rawRows.length} benchmark{rawRows.length === 1 ? '' : 's'}{/if}
			</span>
			{#if rawRows.length > 0}
				<DownloadButton filename="{sanitizeFilename(model.name)}_benchmarks" build={buildCsv} />
			{/if}
		</header>
		{#if loadingScores}
			<SkeletonTable rows={8} cols={6} />
		{:else if scoresError}
			<p class="muted">Failed to load scores: {scoresError}</p>
		{:else if rawRows.length === 0}
			<p class="muted">This model has no scores yet.</p>
		{:else}
			<BenchScoreTable rows={rawRows} />
		{/if}
	</section>
</main>

<ScrollToTopButton />
<ShareUrlButton />

<style>
	.hero-left :global(.cite) {
		margin-top: 10px;
	}
	.hero-right {
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-width: 0;
	}
	.openness-block {
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}
	.openness-title {
		font-size: 15px;
		font-weight: 700;
		color: var(--text);
		letter-spacing: 0.01em;
		margin: 0 0 10px;
	}
	.hero::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		width: 3px;
		background: var(--category-tint-fg, var(--border));
	}

	.hero h1 {
		font-size: 28px;
		font-weight: 800;
		letter-spacing: -0.02em;
		margin: 0 0 14px;
		word-break: break-word;
	}
	.hero h1 .org {
		color: var(--text-subtle);
		font-weight: 400;
	}
	.hero h1 .sl {
		color: var(--border-strong);
		margin: 0 2px;
		font-weight: 400;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
	}
	.ref {
		font-size: 13px;
		font-weight: 600;
		color: var(--category-tint-fg, var(--primary-strong));
	}
	.ref.muted {
		color: var(--link);
	}

	.kpi-value .unit {
		font-size: 0.65em;
		font-weight: 500;
		color: var(--text-subtle);
		margin-left: 2px;
	}
	.kpi-value.date {
		font-size: 16px;
	}
	/* Chips here render as anchor tags; strip the underline so they
	   read as pills. */
	.spec-list .chip {
		text-decoration: none;
	}
	.spec-list .chip-link {
		color: var(--link);
		border-color: color-mix(in srgb, var(--link) 30%, var(--border));
	}
	.spec-list .chip-link:hover {
		background: color-mix(in srgb, var(--link) 10%, var(--surface));
	}
	/* Chip fold-out (shared by "Trained on" + "Languages"): <summary>
	   carries the preview chips + a pill-styled "+N more" toggle; the
	   matching "Show fewer" pill becomes visible only while open. */
	.chip-foldout summary {
		cursor: pointer;
	}
	.chip-foldout summary:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: 2px;
		border-radius: 4px;
	}
	.chip-foldout .more-toggle {
		font-family: var(--font-sans);
		color: var(--link);
		border-color: color-mix(in srgb, var(--link) 40%, var(--border));
		background: color-mix(in srgb, var(--link) 8%, var(--surface));
		cursor: pointer;
		user-select: none;
	}
	.chip-foldout .more-expanded {
		display: none;
	}
	.chip-foldout[open] .more-collapsed {
		display: none;
	}
	.chip-foldout[open] .more-expanded {
		display: inline-block;
	}
	.chip-foldout .chips-rest {
		margin-top: 4px;
	}
	.spec-list .model-link {
		font-family: var(--font-mono);
		font-size: 12px;
	}
	.openness-score {
		margin: 6px 0 0;
		font-size: 11.5px;
		color: var(--text-subtle);
	}
	@media (max-width: 720px) {
		.spec-list {
			grid-template-columns: 1fr;
			row-gap: 12px;
		}
		.spec-list dt {
			padding-top: 0;
		}
	}

	/* Scores section ------------------------------------------------------- */
	.scores {
		margin-top: 24px;
	}
	.scores-head {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 10px;
	}
	.scores-head .muted {
		flex: 1;
	}
	.scores h2 {
		font-size: 18px;
		font-weight: 700;
		margin: 0;
	}
	/* Base `.muted` (color + margin: 0) lives in src/app.css. */
	.muted {
		font-size: 13px;
	}
	/* Table-specific styles live in src/lib/components/BenchScoreTable.svelte. */
</style>
