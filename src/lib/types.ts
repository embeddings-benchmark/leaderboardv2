export type BenchmarkAggregation =
	| 'mean_task'
	| 'mean_task_type'
	| 'task_types'
	| 'public_private'
	| 'mean_subset'
	| 'custom_groups';

// One labeled group within a custom-grouping dimension. Mirrors the backend's
// CustomGroup — `description` is optional prose surfaced as the column
// tooltip; falls back to a generic sentence when absent.
export interface CustomGroup {
	label: string;
	description?: string | null;
	// Whole-task membership only — lets the frontend recompute
	// scoresByCustomGroup under the sidebar filters, same as scoresByTaskType.
	// Empty when the group is entirely subset-/split-scoped (see tasksComplete).
	tasks: string[];
	// False when the group has a subset-/split-scoped entry too, so `tasks`
	// doesn't fully represent its membership — filters.svelte.ts must freeze
	// (not recompute or drop) its score. Defaults to true when absent.
	tasksComplete?: boolean;
}

// A named custom dimension a benchmark declares (e.g. "Memory Type" ->
// Episodic/Dialogue/Semantic/Procedural), driving one super-header + one
// mean column per group on SummaryTable. Mirrors the backend's
// CustomGrouping. Appears on `Benchmark` (full static declaration) and on
// `BenchmarkSummary` (data-driven — only groups with computed scores).
export interface CustomGrouping {
	name: string;
	groups: CustomGroup[];
}

export interface Benchmark {
	name: string;
	displayName: string;
	icon?: string;
	description: string;
	reference?: string;
	citation?: string;
	languages: string[];
	taskTypes: string[];
	// Simplified task groups (Borda-compatible buckets) this benchmark
	// touches — one of "retrieval", "classification", "pair-classification",
	// "clustering", "semantic-similarity". Drives the "Task group" facet
	// on /benchmarks. Empty when the backend hasn't populated it.
	simplifiedTaskTypes?: string[];
	tasks: string[];
	domains: string[];
	modalities: string[];
	// `false` = hidden from the curated menu; /benchmarks shows them anyway.
	displayOnLeaderboard?: boolean;
	// Names of newer benchmarks that supersede this one.
	newVersion?: string[] | null;
	// Aggregation columns this benchmark's summary table should render. Mirrors
	// `Benchmark.aggregations` upstream — frontend uses it to hide irrelevant
	// columns (ViDoRe has no per-type breakdown; RTEB has only Mean (Task)).
	aggregations: BenchmarkAggregation[];
	// Full static declaration of every custom-grouping dimension this
	// benchmark defines (with descriptions). Optional — absent on an older
	// API response or a benchmark with no custom groupings.
	customGroupings?: CustomGrouping[];
	// Whether the Zero-shot column is meaningful on this benchmark. Off for
	// ViDoRe / RTEB where task names aren't tracked in model training-data
	// annotations so every row would otherwise render as a misleading 100%.
	showZeroShot?: boolean;
	// Distinct models with at least one score on this benchmark. Surfaced on
	// the catalogue / home benchmark cards so the user can size up coverage
	// without opening each benchmark. Set by the backend from the cached
	// per-benchmark frames; `0` means unknown (cache not populated) or empty.
	numModels?: number;
	// Explicit subset of language codes for the per-language leaderboard
	// view. Mirrors `Benchmark.language_view` upstream. `'all'` means
	// "every language present"; `null`/missing means the benchmark didn't
	// opt into a per-language view and the Per-language tab should be
	// hidden entirely on this benchmark's detail page.
	languageView?: string[] | 'all' | null;
}

export type SimplifiedTaskType =
	| 'retrieval'
	| 'clustering'
	| 'classification'
	| 'semantic-similarity'
	| 'pair-classification'
	| string;

export interface TaskMeta {
	name: string;
	type: string;
	simplifiedType: SimplifiedTaskType;
	languages: string[];
	domains: string[];
	modalities: string[];
	description: string;
	reference?: string | null;
	citation?: string | null;
	// Whether the dataset is openly published. Used to recompute Mean (Public)
	// / Mean (Private) when filters narrow the task set on benchmarks that
	// declare the public_private aggregation.
	isPublic?: boolean;
	// Extended dataset metadata for the task detail card.
	sourceDataset?: string | null;
	license?: string | null;
	dateFrom?: string | null;
	dateTo?: string | null;
	annotationsCreators?: string | null;
	dialect?: string[] | null;
	sampleCreation?: string | null;
	// Primary metric the task is scored on (e.g. ``ndcg_at_10``,
	// ``cosine_spearman``). Surfaced on the /tasks card, the task detail
	// page, and the PerTaskTab column tooltip.
	mainScore?: string | null;
	// Count of distinct models that have at least one score on this task.
	numModels?: number;
}

export interface MenuEntry {
	name: string;
	description?: string;
	open?: boolean;
	children: Array<MenuEntry | Benchmark>;
}

export function isBenchmark(item: MenuEntry | Benchmark): item is Benchmark {
	return 'displayName' in item;
}

/**
 * Flatten the nested menu tree to its leaf benchmarks, preserving menu order.
 * Cached by root array identity — the menu is fetched once and held in
 * `responseCache`, so subsequent walks (compare, /tasks, /benchmarks,
 * /tasks/[name]) share one traversal instead of re-walking per page.
 */
const _flattenCache = new WeakMap<readonly MenuEntry[], Benchmark[]>();
export function flattenMenu(entries: readonly MenuEntry[]): Benchmark[] {
	const cached = _flattenCache.get(entries);
	if (cached) return cached;
	const out: Benchmark[] = [];
	const walk = (m: MenuEntry) => {
		for (const c of m.children) {
			if (isBenchmark(c)) out.push(c);
			else walk(c);
		}
	};
	for (const m of entries) walk(m);
	_flattenCache.set(entries, out);
	return out;
}

export type ModelType = 'dense' | 'cross-encoder' | 'late-interaction' | 'sparse' | 'router';

export interface ModelMeta {
	name: string;
	displayName: string;
	org: string;
	url?: string;
	zeroShotPct: number;
	// Nullable: backend emits `null` for proprietary models that don't
	// publish param counts.
	activeParamsB: number | null;
	totalParamsB: number | null;
	// Nullable: backend returns `null` for models whose ModelMeta doesn't
	// pin these down (mostly proprietary entries with no published spec).
	embeddingDim: number | null;
	maxTokens: number | null;
	releaseDate?: string;
	modelType: ModelType;
	instructionTuned: boolean;
	openWeights: boolean;
	// Openness ("OSAI index"-style): a per-dimension breakdown of how open the
	// model is, plus a 0–6 summary score. Both optional — older cached payloads
	// or a not-yet-updated API omit them, and the UI must degrade gracefully.
	// Dimension keys: "open weights", "open license", "open training code",
	// "open training data", "paper", "model card" (model card is always true).
	openness?: Record<string, boolean> | null;
	opennessScore?: number | null;
	sentenceTransformersCompatible: boolean;
	// Modalities the model can encode (e.g. ["text"], ["text", "image"]).
	// Defaults to ["text"] when the upstream ModelMeta omits the field.
	modalities?: string[];
	// Display labels (e.g. "English", "Mandarin Chinese") for the
	// languages this model targets. Empty when the upstream meta
	// declares no language scope. Used by the /models filter sidebar.
	languages?: string[];
	citation?: string | null;
	// Extended metadata, all optional. Surfaced on the model detail card.
	memoryUsageMb?: number | null;
	license?: string | null;
	publicTrainingCode?: string | null;
	publicTrainingData?: string | null;
	adaptedFrom?: string | null;
	supersededBy?: string | null;
	extraRequirementsGroups?: string[] | null;
	trainingDatasets?: string[] | null;
}

export interface SummaryRow {
	rank: number;
	model: ModelMeta;
	zeroShotPct: number;
	// Nullable: see ModelMeta — proprietary models leave param counts /
	// architectural specs blank.
	activeParamsB: number | null;
	totalParamsB: number | null;
	embeddingDim: number | null;
	maxTokens: number | null;
	// `null` when the model is missing any task / task-type cell. Don't average
	// partial coverage — it would silently outrank fully-evaluated peers.
	meanTask: number | null;
	meanTaskType: number | null;
	// Public/Private split means for benchmarks that hold out a private task
	// subset (ViDoRe family). `null` for benchmarks without that split.
	meanPublic?: number | null;
	meanPrivate?: number | null;
	scoresByTaskType: Record<string, number>;
	// Flat per-task mean (averaged across subsets / languages). Drives
	// every existing per-task UI; the language filter overrides via
	// the lazy /per-task endpoint when it lands.
	scoresByTask: Record<string, number>;
	// dimension name -> group label -> score, for benchmarks that declare
	// custom groupings. The *language* filter recomputes this server-side
	// (see aggregators.py's _recompute_lenient_custom_groups) same as
	// scoresByTaskType/meanTask/meanTaskType. The client-side task-type /
	// domain / modality sidebar filters (filters.svelte.ts, no server
	// round-trip) do NOT recompute it — the API never sends per-task group
	// membership, only the aggregated group scores, so there's nothing to
	// re-bucket against a narrowed task set on the client; it stays frozen
	// at the values for the full (or language-filtered) task set.
	scoresByCustomGroup?: Record<string, Record<string, number>>;
	// Tasks (within this benchmark) the model declares in its training
	// datasets — used by PerTaskTab to surface a ⚠️ next to scores that
	// the model isn't zero-shot on.
	trainedOnTasks?: string[];
	// Experiment kwargs that produced this row — present only for variant
	// rows (e.g. `{ colbert: true, use_image_modality: false }`). `null` for
	// the canonical base-model row. Multiple rows can share the same
	// `model.name`, distinguished only by `experiments`. Frontend may badge
	// or filter these as ablations without affecting the rest of the schema.
	experiments?: Record<string, unknown> | null;
}

export interface BenchmarkSummary {
	benchmarkName: string;
	taskTypes: string[];
	tasks: string[];
	tasksMeta: TaskMeta[];
	rows: SummaryRow[];
	// Mirrors the Benchmark.aggregations declaration so SummaryTable knows
	// which columns to render without inspecting the score data itself.
	aggregations: BenchmarkAggregation[];
	// Data-driven view of the benchmark's custom-grouping dimensions — only
	// groups that actually have computed scores (mirrors `taskTypes`'
	// relationship to the per-task-type summary columns). Optional — absent
	// on an older API response.
	customGroupings?: CustomGrouping[];
	// Mirrors `Benchmark.showZeroShot` — SummaryTable hides the Zero-shot
	// column when False (ViDoRe / RTEB, where the metric is uniformly 100%).
	showZeroShot?: boolean;
}

// `/v1/benchmarks/{name}/per-language` payload — one row per model with
// its mean main_score per language label (e.g. "English" → 0.732).
// Loaded lazily by PerLanguageTab on mount. Keys match the language
// labels emitted on `Benchmark.languages` / `TaskMeta.languages` so
// joins are direct.
export interface BenchmarkPerLanguageRow {
	modelName: string;
	scoresByLanguage: Record<string, number>;
}
export interface BenchmarkPerLanguage {
	benchmarkName: string;
	rows: BenchmarkPerLanguageRow[];
}

// Slim per-size-bucket response from `/benchmarks/{name}/leaders` —
// used by the home page so we don't have to pull a full /scores
// payload (several MB on multilingual benchmarks) just to render
// 4 mini-leaderboard rows.
export interface LeaderModel {
	// Canonical `org/name` HuggingFace identifier. Consumers split on
	// `/` (via `splitModelName` in `$lib/format`) when they need
	// display-only segments.
	name: string;
	modelType: ModelType;
}
export interface LeaderRow {
	rank: number;
	model: LeaderModel;
	meanTask: number | null;
	totalParamsB: number | null;
}
export interface BucketLeader {
	min: number;
	/** `null` means "open-ended" (>= min). */
	max: number | null;
	leader: LeaderRow | null;
}
export interface BenchmarkLeaders {
	benchmarkName: string;
	buckets: BucketLeader[];
}

export interface TaskScoreRow {
	rank: number;
	model: ModelMeta;
	// `null` when the model wasn't evaluated on every subset of this task —
	// rendering a partial-coverage mean would falsely outrank fully-scored
	// peers, so the API leaves it blank. Each subset's contribution is the
	// max across the splits the model ran, so this stays comparable between
	// models that ran only ``test`` and models that ran both ``validation``
	// and ``test``.
	score: number | null;
	// Nested map: subset → split → score. Missing inner keys mean the
	// model wasn't evaluated on that (subset, split) cell. The frontend
	// can pivot either axis off this one payload.
	subsetScores: Record<string, Record<string, number>>;
	benchmarks: string[];
	// Three-state per-task training-overlap signal from the backend:
	//   true  → task is in `model.trainingDatasets` (matches PerTaskTab's ⚠️)
	//   false → model declared its training data and this task isn't in it
	//   null  → model didn't declare `trainingDatasets` (rendered as NA)
	trainedOn: boolean | null;
}

export interface TaskScores {
	task: TaskMeta;
	benchmarks: string[];
	subsets: string[];
	// Distinct splits observed across every model's scores. Most tasks
	// only have ``["test"]``; tasks declaring multiple ``eval_splits``
	// (e.g. MassiveIntentClassification) surface both.
	splits: string[];
	rows: TaskScoreRow[];
}

export interface ModelScoreRow {
	benchmarkName: string;
	benchmarkDisplayName: string;
	rank: number;
	totalModels: number;
	meanTask: number | null;
	meanTaskType: number | null;
	zeroShotPct: number;
	taskTypes: string[];
	scoresByTaskType: Record<string, number>;
}

export interface ModelScores {
	model: ModelMeta;
	rows: ModelScoreRow[];
}

// --- /v1/tasks/{name}/descriptive_statistics ----------------------------
// Snake_case is intentional: the backend ships these via TypedDicts (not
// pydantic models with camelCase aliases), so the wire shape mirrors the
// Python attribute names verbatim. See `mteb/types/statistics.py` for the
// authoritative shapes.
//
// Per-task shapes are discriminated by `TaskMeta.type` from `/tasks/{name}`,
// but the frontend renderer reads them structurally — it iterates the
// object's keys and surfaces any present `*_statistics` block — so new
// task-type stats classes added on the backend are forward-compatible
// without a frontend change.

export interface TextStatistics {
	total_text_length: number;
	min_text_length: number;
	average_text_length: number;
	max_text_length: number;
	unique_texts: number;
}

export interface ImageStatistics {
	min_image_width: number;
	average_image_width: number;
	max_image_width: number;
	min_image_height: number;
	average_image_height: number;
	max_image_height: number;
	unique_images: number;
}

export interface AudioStatistics {
	total_duration_seconds: number;
	min_duration_seconds: number;
	average_duration_seconds: number;
	max_duration_seconds: number;
	unique_audios: number;
	average_sampling_rate: number;
	// Backend keys these by int (sampling rate Hz); JSON forces string keys.
	sampling_rates: Record<string, number>;
}

export interface VideoStatistics {
	total_duration_seconds: number | null;
	total_frames: number | null;
	min_width: number | null;
	average_width: number | null;
	max_width: number | null;
	min_height: number | null;
	average_height: number | null;
	max_height: number | null;
	min_duration_seconds: number | null;
	average_duration_seconds: number | null;
	max_duration_seconds: number | null;
	unique_videos: number;
	average_fps: number | null;
	fps: Record<string, number>;
	min_resolution: [number, number] | null;
	average_resolution: [number, number] | null;
	max_resolution: [number, number] | null;
	resolutions: Record<string, number>;
}

export interface ScoreStatistics {
	min_score: number;
	avg_score: number;
	max_score: number;
}

export interface LabelStatistics {
	min_labels_per_text: number;
	average_label_per_text: number;
	max_labels_per_text: number;
	unique_labels: number;
	// Nested: { "<label>": { "count": N } } — the inner dict is a small
	// metadata bag so the backend can grow it without bumping the schema.
	labels: Record<string, Record<string, number>>;
}

export interface RelevantDocsStatistics {
	num_relevant_docs: number;
	min_relevant_docs_per_query: number;
	average_relevant_docs_per_query: number;
	max_relevant_docs_per_query: number;
	unique_relevant_docs: number;
}

export interface TopRankedStatistics {
	num_top_ranked: number;
	min_top_ranked_per_query: number;
	average_top_ranked_per_query: number;
	max_top_ranked_per_query: number;
}

// --- Per-task split-level shapes (mirror mteb/types/statistics.py) ---------

export interface AnySTSDescriptiveStatistics {
	num_samples: number;
	number_of_characters: number | null;
	unique_pairs: number | null;
	text1_statistics: TextStatistics | null;
	text2_statistics: TextStatistics | null;
	image1_statistics: ImageStatistics | null;
	image2_statistics: ImageStatistics | null;
	audio1_statistics: AudioStatistics | null;
	audio2_statistics: AudioStatistics | null;
	video1_statistics: VideoStatistics | null;
	video2_statistics: VideoStatistics | null;
	label_statistics: ScoreStatistics;
}

export interface BitextDescriptiveStatistics {
	num_samples: number;
	number_of_characters: number;
	unique_pairs: number;
	sentence1_statistics: TextStatistics;
	sentence2_statistics: TextStatistics;
}

export interface ClassificationDescriptiveStatistics {
	num_samples: number;
	samples_in_train: number | null;
	text_statistics: TextStatistics | null;
	image_statistics: ImageStatistics | null;
	audio_statistics: AudioStatistics | null;
	video_statistics: VideoStatistics | null;
	label_statistics: LabelStatistics;
}

export interface RegressionDescriptiveStatistics {
	num_samples: number;
	samples_in_train: number | null;
	text_statistics: TextStatistics | null;
	image_statistics: ImageStatistics | null;
	audio_statistics: AudioStatistics | null;
	video_statistics: VideoStatistics | null;
	values_statistics: ScoreStatistics;
}

export interface ClusteringDescriptiveStatistics {
	num_samples: number;
	text_statistics: TextStatistics | null;
	image_statistics: ImageStatistics | null;
	audio_statistics: AudioStatistics | null;
	video_statistics: VideoStatistics | null;
	label_statistics: LabelStatistics;
}

export interface ClusteringFastDescriptiveStatistics {
	num_samples: number;
	text_statistics: TextStatistics | null;
	image_statistics: ImageStatistics | null;
	audio_statistics: AudioStatistics | null;
	video_statistics: VideoStatistics | null;
	labels_statistics: LabelStatistics;
}

export interface PairClassificationDescriptiveStatistics {
	num_samples: number;
	number_of_characters: number | null;
	unique_pairs: number | null;
	text1_statistics: TextStatistics | null;
	image1_statistics: ImageStatistics | null;
	audio1_statistics: AudioStatistics | null;
	video1_statistics: VideoStatistics | null;
	text2_statistics: TextStatistics | null;
	image2_statistics: ImageStatistics | null;
	audio2_statistics: AudioStatistics | null;
	video2_statistics: VideoStatistics | null;
	labels_statistics: LabelStatistics;
}

export interface ZeroShotClassificationDescriptiveStatistics {
	num_samples: number;
	text_statistics: TextStatistics | null;
	image_statistics: ImageStatistics | null;
	audio_statistics: AudioStatistics | null;
	video_statistics: VideoStatistics | null;
	label_statistics: LabelStatistics;
	candidates_labels_text_statistics: TextStatistics;
}

export interface RetrievalDescriptiveStatistics {
	num_samples: number;
	num_queries: number;
	num_documents: number;
	number_of_characters: number;
	documents_text_statistics: TextStatistics | null;
	documents_image_statistics: ImageStatistics | null;
	documents_audio_statistics: AudioStatistics | null;
	documents_video_statistics: VideoStatistics | null;
	queries_text_statistics: TextStatistics | null;
	queries_image_statistics: ImageStatistics | null;
	queries_audio_statistics: AudioStatistics | null;
	queries_video_statistics: VideoStatistics | null;
	relevant_docs_statistics: RelevantDocsStatistics;
	top_ranked_statistics: TopRankedStatistics | null;
}

export interface SummarizationDescriptiveStatistics {
	num_samples: number;
	number_of_characters: number;
	text_statistics: TextStatistics;
	human_summaries_statistics: TextStatistics;
	machine_summaries_statistics: TextStatistics;
	score_statistics: ScoreStatistics;
}

export interface ImageTextPairClassificationDescriptiveStatistics {
	num_samples: number;
	text_statistics: TextStatistics;
	image_statistics: ImageStatistics;
}

// Union of every per-split shape. Discriminating up-front (via
// `TaskMeta.type`) is not enough — at least one task (`AJGT`) ships
// fields the schema doesn't declare (`number_texts_intersect_with_train`),
// and the renderer iterates known `*_statistics` keys structurally rather
// than type-narrowing, so we widen here for the consumer.
export type SplitDescriptiveStatistics =
	| AnySTSDescriptiveStatistics
	| BitextDescriptiveStatistics
	| ClassificationDescriptiveStatistics
	| RegressionDescriptiveStatistics
	| ClusteringDescriptiveStatistics
	| ClusteringFastDescriptiveStatistics
	| PairClassificationDescriptiveStatistics
	| ZeroShotClassificationDescriptiveStatistics
	| RetrievalDescriptiveStatistics
	| SummarizationDescriptiveStatistics
	| ImageTextPairClassificationDescriptiveStatistics;

// Multilingual datasets wrap each split's stats in a per-`hf_subset` map.
// Distinguishable by the presence of `hf_subset_descriptive_stats`.
export interface MultiSubsetDescriptiveStatistics {
	num_samples: number;
	hf_subset_descriptive_stats: Record<string, SplitDescriptiveStatistics>;
}

// Top-level API shape: split name → stats (or multilingual wrapper).
export type TaskDescriptiveStats = Record<
	string,
	SplitDescriptiveStatistics | MultiSubsetDescriptiveStatistics
>;

export function hasSubsets(
	s: SplitDescriptiveStatistics | MultiSubsetDescriptiveStatistics
): s is MultiSubsetDescriptiveStatistics {
	return (
		'hf_subset_descriptive_stats' in s &&
		(s as MultiSubsetDescriptiveStatistics).hf_subset_descriptive_stats != null
	);
}

export interface TaskFilters {
	languages?: string[];
	types?: string[];
	domains?: string[];
	modalities?: string[];
	categories?: string[];
	name?: string;
}

export interface ModelFilters {
	modelTypes?: string[];
	frameworks?: string[];
	openWeights?: boolean;
	instructionTuned?: boolean;
	minParamsB?: number;
	maxParamsB?: number;
	modalities?: string[];
	exclusiveModality?: boolean;
	name?: string;
}
