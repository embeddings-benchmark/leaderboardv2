<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { safeIdle } from '$lib/idle';
	import { filters, MODEL_MODALITIES } from '$lib/stores/filters.svelte';
	import { opennessMeets, opennessScore } from '$lib/openness';
	import FilterSidebar from '$lib/components/FilterSidebar.svelte';
	import ModalityIcon from '$lib/components/ModalityIcon.svelte';
	import ModelsTable from '$lib/components/ModelsTable.svelte';
	import OpennessMeter from '$lib/components/OpennessMeter.svelte';
	import ShareMeta from '$lib/components/ShareMeta.svelte';
	import ModelSearchBar from '$lib/components/ModelSearchBar.svelte';
	import ScrollToTopButton from '$lib/components/ScrollToTopButton.svelte';
	import SkeletonGrid from '$lib/components/SkeletonGrid.svelte';
	import SortDirIcon from '$lib/components/SortDirIcon.svelte';
	import ShareUrlButton from '$lib/components/ShareUrlButton.svelte';
	import ViewModeToggle, { type ViewMode } from '$lib/components/ViewModeToggle.svelte';
	import type { SortState } from '$lib/stores/sort.svelte';
	import type { ModelMeta } from '$lib/types';
	import {
		ariaSort,
		COLLATOR,
		fmtInt,
		fmtParamsCompact,
		modelPath,
		modelSearchKey,
		sortIcon,
		sortModalities,
		summarizeModelLanguages
	} from '$lib/format';
	import { createFacetFilter } from '$lib/stores/facet-filter.svelte';
	import { getParam, updateUrl } from '$lib/url-state';
	import type { PageData } from './$types';
	import type { ModelsData } from './+page';

	let { data }: { data: PageData } = $props();

	// Stale-guard via `data.models === p` so a slow earlier promise can't
	// overwrite a fresh nav.
	let resolved = $state<ModelsData | null>(null);
	let loadError = $state<string | null>(null);
	$effect(() => {
		const p = data.models;
		loadError = null;
		p.then((r) => {
			if (data.models === p) resolved = r;
		}).catch((e) => {
			if (data.models === p) loadError = e instanceof Error ? e.message : String(e);
		});
	});

	let ALL_MODELS = $derived<ModelMeta[]>(resolved?.models ?? []);

	// Page-local — /models is the only page with this language pill list.
	let LANGUAGES = $derived<string[]>(resolved?.languages ?? []);
	const languageFacet = createFacetFilter({
		urlParam: 'langs',
		chipLabel: 'Lang',
		universe: () => LANGUAGES
	});
	const languagesPicked = languageFacet.picked;
	$effect(() => {
		if (resolved) languageFacet.seed();
	});

	const SORTS = [
		{ id: 'name', label: 'Name' },
		{ id: 'type', label: 'Type' },
		{ id: 'params', label: 'Parameters' },
		{ id: 'embedDim', label: 'Embed dim' },
		{ id: 'maxTokens', label: 'Max tokens' },
		{ id: 'released', label: 'Release date' },
		{ id: 'openness', label: 'Openness' }
	] as const;
	type SortId = (typeof SORTS)[number]['id'];
	type SortDir = 'asc' | 'desc';
	// Each sort key has a "natural" direction (alphabetical → asc, numeric and
	// dates → desc/newest-first). When the user picks a new key we snap to
	// that default; the explicit toggle below lets them override.
	const NATURAL_DIR: Record<SortId, SortDir> = {
		name: 'asc',
		type: 'asc',
		params: 'desc',
		embedDim: 'desc',
		maxTokens: 'desc',
		released: 'desc',
		openness: 'desc'
	};
	// Defaults seed first; onMount below syncs from URL to avoid hydration mismatch.
	const SORT_IDS = new Set(SORTS.map((s) => s.id));
	const DEFAULT_SORT: SortId = 'released';
	let sort = $state<SortId>(DEFAULT_SORT);
	let sortDir = $state<SortDir>(NATURAL_DIR[DEFAULT_SORT]);
	// Gate URL writes until the onMount URL→state sync has run, otherwise the
	// default-state write nukes deep-link params.
	let urlHydrated = $state(false);
	$effect(() => {
		if (!urlHydrated) return;
		const isDefault = sort === DEFAULT_SORT && sortDir === NATURAL_DIR[DEFAULT_SORT];
		updateUrl({
			's.models': isDefault ? null : sort,
			'd.models': isDefault ? null : sortDir
		});
	});

	function onSortKeyChange(next: SortId) {
		sort = next;
		sortDir = NATURAL_DIR[next];
	}
	function toggleSortDir() {
		sortDir = sortDir === 'asc' ? 'desc' : 'asc';
	}

	let view = $state<ViewMode>('cards');
	$effect(() => {
		if (!urlHydrated) return;
		updateUrl({ view: view === 'cards' ? null : view });
	});

	// Page-local `?langs=` sync; shared filters handle their own params.
	// `resolved` gate: empty pre-load universe would delete `?langs=` deep links.
	$effect(() => {
		if (!urlHydrated || !resolved) return;
		updateUrl({ langs: languageFacet.urlValue() });
	});

	onMount(() => {
		const us = getParam('s.models');
		const ud = getParam('d.models');
		const uv = getParam('view');
		if (us && SORT_IDS.has(us as SortId)) {
			sort = us as SortId;
			sortDir = ud === 'asc' || ud === 'desc' ? ud : NATURAL_DIR[us as SortId];
		} else if (ud === 'asc' || ud === 'desc') {
			sortDir = ud;
		}
		if (uv === 'table') view = 'table';
		// No summary here, so call hydrateFromUrl directly.
		filters.hydrateFromUrl();
		urlHydrated = true;
	});
	const sortAdapter: SortState<SortId> = {
		get key() {
			return sort;
		},
		get dir() {
			return sortDir;
		},
		click(k: SortId) {
			if (sort !== k) onSortKeyChange(k);
			else toggleSortDir();
		},
		icon(k: SortId) {
			return sortIcon(k, sort, sortDir, '↕');
		},
		aria(k: SortId) {
			return ariaSort(k, sort, sortDir);
		}
	};

	// Apply the shared leaderboard filter store's predicates to a flat model
	// list. Same logic as applyFilters() in filters.svelte.ts, just minus the
	// benchmark-scope / sort / re-rank parts that only make sense for a
	// summary's rows.
	function buildPasses(): (m: ModelMeta) => boolean {
		// All cross-row inputs read once at the top so the per-row predicate
		// doesn't re-read them 800x per keystroke.
		const q = filters.nameQuery.trim().toLowerCase();
		const availability = filters.availability;
		const instructions = filters.instructions;
		const stOnly = filters.sentenceTransformersOnly;
		const opennessReqs = filters.opennessReqs;
		const opennessActive = opennessReqs.size > 0;
		const modelTypes = filters.modelTypes;
		const modelTypesSize = modelTypes.size;
		const sizeMin = filters.minModelSizeM;
		const sizeMax = filters.maxModelSizeM;
		const sizeActive = filters.sizeActive;
		const langPicked = languagesPicked;
		const langCount = LANGUAGES.length;
		const langActive = langCount > 0 && langPicked.size !== langCount;
		// Client-side modality filter; models without declared modalities default to ['text'].
		const modalitiesPicked = filters.modelModalities;
		const modalitiesActive = modalitiesPicked.size !== MODEL_MODALITIES.length;
		return (m: ModelMeta) => {
			if (q && !modelSearchKey(m).includes(q)) return false;
			if (availability === 'open' && !m.openWeights) return false;
			if (availability === 'proprietary' && m.openWeights) return false;
			if (instructions === 'only_instruction' && !m.instructionTuned) return false;
			if (instructions === 'only_non_instruction' && m.instructionTuned) return false;
			if (stOnly && !m.sentenceTransformersCompatible) return false;
			if (opennessActive && !opennessMeets(m, opennessReqs)) return false;
			// Empty pick set = "deselect everything" → nothing matches.
			if (modelTypesSize === 0 || !modelTypes.has(m.modelType)) return false;
			if (modalitiesActive) {
				const mods = m.modalities ?? ['text'];
				let any = false;
				for (const x of mods) {
					if (modalitiesPicked.has(x)) {
						any = true;
						break;
					}
				}
				if (!any) return false;
			}
			if (sizeActive) {
				if (m.totalParamsB == null || m.totalParamsB <= 0) return false;
				const paramsM = m.totalParamsB * 1000;
				if (paramsM < sizeMin) return false;
				if (paramsM > sizeMax) return false;
			}
			// Language predicate: "all on" = filter off; otherwise require
			// at least one declared language to be in the picked set.
			// Models with no declared languages (`undefined`/`[]`) get a
			// pass — language metadata is optional upstream and we don't
			// want to silently drop pre-tagged models.
			if (langActive) {
				const mlangs = m.languages;
				if (mlangs && mlangs.length > 0 && !mlangs.some((l) => langPicked.has(l))) return false;
			}
			return true;
		};
	}

	// Split filter / sort so name-query keystrokes (which only narrow rows)
	// don't trigger a full re-sort. The sort only re-runs when its inputs
	// (`sort`, `sortDir`, or the filtered list identity) change.
	let matched = $derived.by(() => ALL_MODELS.filter(buildPasses()));
	let filtered = $derived.by(() => {
		const list = [...matched];
		list.sort((a, b) => {
			let cmp: number;
			if (sort === 'name') {
				cmp = COLLATOR.compare(a.name, b.name);
			} else if (sort === 'type') {
				cmp = COLLATOR.compare(a.modelType ?? '', b.modelType ?? '');
			} else if (sort === 'params') {
				const aP = a.totalParamsB || -1;
				const bP = b.totalParamsB || -1;
				cmp = aP - bP;
			} else if (sort === 'embedDim') {
				cmp = (a.embeddingDim ?? -1) - (b.embeddingDim ?? -1);
			} else if (sort === 'maxTokens') {
				cmp = (a.maxTokens ?? -1) - (b.maxTokens ?? -1);
			} else if (sort === 'released') {
				cmp = COLLATOR.compare(a.releaseDate ?? '', b.releaseDate ?? '');
			} else if (sort === 'openness') {
				// `null` (no openness data) sorts below a genuine 0 — same
				// missing-value convention as the numeric columns above.
				cmp = (opennessScore(a) ?? -1) - (opennessScore(b) ?? -1);
			} else {
				cmp = 0;
			}
			if (cmp === 0) cmp = COLLATOR.compare(a.name, b.name);
			return sortDir === 'asc' ? cmp : -cmp;
		});
		return list;
	});

	// Progressive render — same pattern as /tasks. Debounce the grow
	// kick-off so the storm of filter-set seeding during data load
	// doesn't permanently reset visibleCount to the initial chunk.
	const INITIAL_CHUNK = 60;
	const CHUNK_STEP = 200;
	let visibleCount = $state(INITIAL_CHUNK);
	let growVersion = 0;
	let lastFilteredSignature = '';
	let kickoffTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		const total = filtered.length;
		// Signature catches real filter changes; lets our own visibleCount
		// writes re-fire the effect harmlessly (bail on same signature).
		const signature = `${total}|${filtered[0]?.name ?? ''}|${filtered[total - 1]?.name ?? ''}`;
		if (signature === lastFilteredSignature) return;
		lastFilteredSignature = signature;
		const myVersion = ++growVersion;
		visibleCount = Math.min(INITIAL_CHUNK, total);
		if (visibleCount >= total) return;
		if (kickoffTimer) clearTimeout(kickoffTimer);
		kickoffTimer = setTimeout(() => {
			kickoffTimer = null;
			if (myVersion !== growVersion) return;
			const grow = () => {
				if (myVersion !== growVersion) return;
				visibleCount = Math.min(visibleCount + CHUNK_STEP, total);
				if (visibleCount < total) safeIdle(grow);
			};
			safeIdle(grow);
		}, 80);
	});
	let visibleModels = $derived(filtered.slice(0, visibleCount));
</script>

<ShareMeta
	title="Models"
	description={`Every embedding model on the MTEB Leaderboard — ${ALL_MODELS.length || '700+'} models with architecture type, parameter count, embedding dimension, context length, release date, and supported languages.`}
/>

<div class="layout-sidebar">
	<main id="main-content" tabindex="-1" class="layout-main">
		<header class="hero index-hero">
			<h1>Models</h1>
			<p class="lead">
				Every model in the leaderboard with its architecture type, parameter count, embedding
				dimension, max context, and release date. Filters here share state with the leaderboard on
				every benchmark detail page.
			</p>
			<p class="contribute-note">
				To add your model, follow our
				<a
					href="https://embeddings-benchmark.github.io/mteb/contributing/adding_a_model/"
					target="_blank"
					rel="noreferrer">contributor guide</a
				>. Already have scores? Read the
				<a
					href="https://embeddings-benchmark.github.io/mteb/contributing/submitting_results/"
					target="_blank"
					rel="noreferrer">submitting results guide</a
				>.
			</p>
		</header>

		<div class="toolbar">
			<ModelSearchBar matchCount={filtered.length} totalCount={ALL_MODELS.length} />
			<div class="sort">
				<label for="sort-select">Sort by</label>
				<select
					id="sort-select"
					value={sort}
					onchange={(e) => onSortKeyChange((e.currentTarget as HTMLSelectElement).value as SortId)}
				>
					{#each SORTS as s (s.id)}
						<option value={s.id}>{s.label}</option>
					{/each}
				</select>
				<button
					type="button"
					class="dir-btn"
					onclick={toggleSortDir}
					aria-label={sortDir === 'asc' ? 'Ascending' : 'Descending'}
					title={sortDir === 'asc'
						? 'Ascending (click for descending)'
						: 'Descending (click for ascending)'}
				>
					<SortDirIcon dir={sortDir} />
				</button>
			</div>
			<ViewModeToggle value={view} onChange={(v) => (view = v)} />
		</div>

		{#if !resolved && !loadError}
			<SkeletonGrid />
		{:else if loadError}
			<p class="empty">Failed to load models: {loadError}</p>
		{:else if filtered.length === 0}
			<p class="empty">No models match those filters.</p>
		{:else if view === 'table'}
			<ModelsTable rows={filtered} sort={sortAdapter} />
		{:else}
			<div class="grid card-grid">
				{#each visibleModels as m (m.name)}
					{@const languageSummary = summarizeModelLanguages(m.languages)}
					<a
						class="card card-link card-link-vis accent-rail"
						href={resolve('/models/[...name=modelName]', { name: modelPath(m.name) })}
						data-type={m.modelType}
						title={m.modelType}
					>
						<div class="card-head">
							<div class="title-wrap">
								<span class="title">
									<span class="org">{m.org}</span><span class="sep">/</span>{m.displayName}
								</span>
								{#if m.releaseDate}
									<span class="title-date">Released {m.releaseDate}</span>
								{/if}
							</div>
							<span class="type-chip" data-type={m.modelType}>
								<span>{m.modelType}</span>
							</span>
						</div>
						<dl class="card-stats">
							<div>
								<dt>Parameters</dt>
								<dd>{fmtParamsCompact(m.totalParamsB)}</dd>
							</div>
							<div>
								<dt>Embed dim</dt>
								<dd>{fmtInt(m.embeddingDim)}</dd>
							</div>
							<div>
								<dt>Max tokens</dt>
								<dd>{fmtInt(m.maxTokens)}</dd>
							</div>
							<div>
								<dt>Openness</dt>
								<dd class="openness-stat">
									{#if opennessScore(m) !== null}
										<OpennessMeter model={m} compact showScore />
									{:else}
										—
									{/if}
								</dd>
							</div>
						</dl>
						<div class="badges">
							<span class="badge" class:open={m.openWeights} class:closed={!m.openWeights}>
								{m.openWeights ? 'Open weights' : 'Proprietary'}
							</span>
							{#if m.instructionTuned}
								<span class="badge soft">Instruction-tuned</span>
							{/if}
							{#if m.sentenceTransformersCompatible}
								<span class="badge soft">ST compatible</span>
							{/if}
							{#if languageSummary}
								<span
									class="badge soft language-badge"
									title={languageSummary.title}
									aria-label={languageSummary.ariaLabel}
								>
									<span>{languageSummary.label}</span>
								</span>
							{/if}
						</div>
						{#if m.modalities && m.modalities.length > 0}
							<div class="chip-row modality-row" aria-label="Supported modalities">
								{#each sortModalities(m.modalities) as mod (mod)}
									<span class="badge modality-tint" data-modality={mod} title={mod}>
										<ModalityIcon modality={mod} size={12} />
										<span>{mod}</span>
									</span>
								{/each}
							</div>
						{/if}
					</a>
				{/each}
			</div>
		{/if}
	</main>

	<FilterSidebar
		hideScope
		flatModel
		hideZeroShot
		hideExperiments
		languageOptions={LANGUAGES}
		languagesPicked={languagesPicked as unknown as Set<string>}
		onToggleLanguage={(l) => languageFacet.toggle(l)}
		onToggleAllLanguages={() => languageFacet.toggleAll()}
		onResetLanguages={() => languageFacet.reset()}
	/>
</div>

<ScrollToTopButton />
<ShareUrlButton />

<style>
	/* `min-height` gives `.modality-row { margin-top: auto }` slack
	   to push the modalities to the card bottom — without it the
	   column collapses to content and the auto margin resolves to 0. */
	.card {
		--card-intrinsic: 220px;
		min-height: 220px;
	}
	.card[data-type] {
		--card-tint: var(--category-tint);
		--card-accent: var(--category-tint-fg);
	}
	.card:hover {
		border-color: color-mix(in srgb, var(--card-accent) 50%, var(--border));
	}

	.card-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
	}
	.title-wrap {
		flex: 1;
		min-width: 0;
	}
	.modality-row {
		gap: 6px;
	}
	.title {
		display: block;
		font-size: 14px;
		font-weight: 700;
		color: var(--text);
		word-break: break-word;
	}
	.card:hover .title {
		color: var(--card-accent, var(--primary-strong));
	}
	.title .org {
		color: var(--text-subtle);
		font-weight: 400;
	}
	.title .sep {
		color: var(--border-strong);
		margin: 0 1px;
		font-weight: 400;
	}
	/* Release date as a byline rather than a stat — it identifies the model
	   more than it specs it, and moving it here frees its grid slot for
	   Openness while keeping `.card-stats` a tidy 2×2. */
	.title-date {
		display: block;
		margin-top: 2px;
		font-size: 11px;
		color: var(--text-subtle);
		font-variant-numeric: tabular-nums;
	}
	/* The compact meter carries its own score label here (cards have no hover
	   breakdown), so pull the label down to match sibling `dd` typography. */
	.openness-stat {
		display: flex;
		align-items: center;
	}
	.openness-stat :global(.score) {
		font-size: 13px;
	}
	.openness-stat :global(.score strong) {
		font-size: 14px;
		font-weight: 700;
	}
	.openness-stat :global(.meter) {
		gap: 7px;
	}
	@media (max-width: 640px) {
		.card-stats {
			gap: 6px 12px;
		}
		.card-stats dt {
			font-size: 9px;
		}
		.card-stats dd {
			font-size: 13px;
		}
		.card {
			min-height: 0;
		}
	}

	.type-chip {
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.02em;
		padding: 3px 8px;
		border-radius: 999px;
		white-space: nowrap;
		text-transform: lowercase;
		background: var(--card-tint, var(--surface-muted));
		color: var(--card-accent, var(--text-muted));
		border: 1px solid color-mix(in srgb, var(--card-accent, var(--border)) 35%, transparent);
	}

	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	.language-badge {
		max-width: 100%;
	}
	.language-badge span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* Outline-only on the card (overrides the global filled defaults). */
	.badge.open,
	.badge.soft {
		background: transparent;
	}
	.badge.open {
		color: var(--tint-green-fg);
	}
</style>
