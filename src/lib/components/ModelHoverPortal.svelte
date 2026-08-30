<script lang="ts" module>
	import type { SummaryRow } from '$lib/types';
	import { fmtZeroShot, fmtParamsCompact, missingModalities, sortModalities } from '$lib/format';

	function fmtInt(n: number): string {
		if (!n) return '—';
		return n.toLocaleString();
	}

	// Shared hover-row set for SummaryTable, PerTaskTab, PerLanguageTab.
	// Org goes in the title (`<org> / <displayName>`), not a separate row.
	// Memoised by row identity: a hover storm over the same 5–10 cells
	// reuses the same array instead of reallocating 6 objects per cell.
	const _rowsCache = new WeakMap<SummaryRow, { k: string; v: string }[]>();
	export function rowsForModel(row: SummaryRow): { k: string; v: string }[] {
		const cached = _rowsCache.get(row);
		if (cached) return cached;
		const m = row.model;
		const out = [
			{ k: 'Type', v: m.modelType },
			{ k: 'Active params', v: fmtParamsCompact(row.activeParamsB, ' ') },
			{ k: 'Zero-shot', v: fmtZeroShot(row.zeroShotPct) },
			{ k: 'Embedding dim', v: row.embeddingDim ? fmtInt(row.embeddingDim) : '—' },
			{ k: 'Max tokens', v: row.maxTokens ? fmtInt(row.maxTokens) : '—' },
			{ k: 'Released', v: m.releaseDate ?? '—' }
		];
		_rowsCache.set(row, out);
		return out;
	}

	// Modalities the model can encode, sorted for consistent display.
	// Defaults to `["text"]` — mirrors `ModelMeta.modalities`'s own
	// documented default (see types.ts) so an omitted field still reads as
	// "text-only" rather than an empty row.
	const _modalitiesCache = new WeakMap<SummaryRow, string[]>();
	export function modalitiesForModel(row: SummaryRow): string[] {
		const cached = _modalitiesCache.get(row);
		if (cached) return cached;
		const out = sortModalities(row.model.modalities?.length ? row.model.modalities : ['text']);
		_modalitiesCache.set(row, out);
		return out;
	}
</script>

<script lang="ts">
	import HoverPortal from './HoverPortal.svelte';
	import ModalityIcon from './ModalityIcon.svelte';

	type TipState = {
		visible: boolean;
		title: string;
		modelType: string;
		rows: { k: string; v: string }[];
		modalities: string[];
		missingModalities: string[];
		x: number;
		y: number;
	};
	let tip = $state<TipState>({
		visible: false,
		title: '',
		modelType: '',
		rows: [],
		modalities: [],
		missingModalities: [],
		x: 0,
		y: 0
	});

	// `requiredModalities` — the benchmark/task's modalities, when the
	// caller has one (see `SummaryTable` etc.'s `benchmarkModalities`
	// prop) — drives the mismatch note below the Modalities row. Omit for
	// contexts with no single well-defined modality set (e.g. the model
	// catalogue).
	export function showFor(target: HTMLElement, row: SummaryRow, requiredModalities?: string[]) {
		const r = target.getBoundingClientRect();
		tip = {
			visible: true,
			title: `${row.model.org} / ${row.model.displayName}`,
			modelType: row.model.modelType,
			rows: rowsForModel(row),
			modalities: modalitiesForModel(row),
			missingModalities: missingModalities(row.model.modalities, requiredModalities),
			x: r.left + r.width / 2,
			y: r.bottom
		};
	}
	export function hide() {
		tip = { ...tip, visible: false };
	}
</script>

<HoverPortal visible={tip.visible} title={tip.title} modelType={tip.modelType} x={tip.x} y={tip.y}>
	<dl>
		{#each tip.rows as r (r.k)}
			<div>
				<dt>{r.k}</dt>
				<dd class:type-value={r.k === 'Type'}>{r.v}</dd>
			</div>
		{/each}
		<div>
			<dt>Modalities</dt>
			<dd class="modalities-value">
				{#each tip.modalities as mod (mod)}
					<span class="badge modality-tint" data-modality={mod}>
						<ModalityIcon modality={mod} size={11} />
						<span>{mod}</span>
					</span>
				{/each}
			</dd>
		</div>
	</dl>
	{#if tip.missingModalities.length > 0}
		<p class="modality-note">
			⚠ Doesn't support {tip.missingModalities.join(', ')} — this benchmark's corpus includes it, so the
			score may not reflect genuine {tip.missingModalities.join('/')} understanding.
		</p>
	{/if}
</HoverPortal>

<style>
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 4px 14px;
		margin: 0;
	}
	dl > div {
		display: contents;
	}
	dt {
		font-size: 10px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--tip-label);
		font-weight: 600;
		align-self: center;
	}
	dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
		font-weight: 500;
		color: var(--tip-fg);
	}
	/* Per-model-type tint on the Type row's value. Uses the shared
	   `--type-tint` custom property (set on `[data-model-type]` in
	   leaderboard-table.css) so the value matches the title tint
	   without a per-type rule list. */
	.type-value {
		color: var(--type-tint, inherit);
		font-weight: 700;
	}
	.modality-note {
		margin: 8px 0 0;
		padding-top: 8px;
		border-top: 1px solid var(--border);
		font-size: 11px;
		line-height: 1.4;
		color: var(--tint-amber-fg);
	}
</style>
