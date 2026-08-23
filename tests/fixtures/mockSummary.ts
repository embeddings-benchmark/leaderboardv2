import type {
	BenchmarkSummary,
	CustomGrouping,
	ModelMeta,
	ModelType,
	SummaryRow,
	TaskMeta
} from '../../src/lib/types';
import { BENCHMARK_INDEX } from './mockBenchmarks';

interface MockModel {
	name: string;
	displayName: string;
	org: string;
	url: string;
	zeroShotPct: number;
	activeParamsB: number;
	totalParamsB: number;
	embeddingDim: number;
	maxTokens: number;
	baseScore: number;
	releaseDate: string;
	modelType: ModelType;
	instructionTuned: boolean;
	openWeights: boolean;
	sentenceTransformersCompatible: boolean;
}

const MOCK_MODELS: MockModel[] = [
	{
		name: 'gemini-embedding-001',
		displayName: 'gemini-embedding-001',
		org: 'Google',
		url: 'https://ai.google.dev/gemini-api/docs/embeddings',
		zeroShotPct: -1,
		activeParamsB: 0,
		totalParamsB: 0,
		embeddingDim: 3072,
		maxTokens: 2048,
		baseScore: 0.682,
		releaseDate: '2025-03-12',
		modelType: 'dense',
		instructionTuned: true,
		openWeights: false,
		sentenceTransformersCompatible: false
	},
	{
		name: 'qwen3-embedding-8b',
		displayName: 'Qwen3-Embedding-8B',
		org: 'Qwen',
		url: 'https://huggingface.co/Qwen/Qwen3-Embedding-8B',
		zeroShotPct: 95,
		activeParamsB: 7.6,
		totalParamsB: 7.6,
		embeddingDim: 4096,
		maxTokens: 32768,
		baseScore: 0.674,
		releaseDate: '2025-06-05',
		modelType: 'dense',
		instructionTuned: true,
		openWeights: true,
		sentenceTransformersCompatible: true
	},
	{
		name: 'qwen3-embedding-4b',
		displayName: 'Qwen3-Embedding-4B',
		org: 'Qwen',
		url: 'https://huggingface.co/Qwen/Qwen3-Embedding-4B',
		zeroShotPct: 95,
		activeParamsB: 4.0,
		totalParamsB: 4.0,
		embeddingDim: 2560,
		maxTokens: 32768,
		baseScore: 0.663,
		releaseDate: '2025-06-05',
		modelType: 'dense',
		instructionTuned: true,
		openWeights: true,
		sentenceTransformersCompatible: true
	},
	{
		name: 'Linq-Embed-Mistral',
		displayName: 'Linq-Embed-Mistral',
		org: 'Linq-AI-Research',
		url: 'https://huggingface.co/Linq-AI-Research/Linq-Embed-Mistral',
		zeroShotPct: 88,
		activeParamsB: 7.1,
		totalParamsB: 7.1,
		embeddingDim: 4096,
		maxTokens: 32768,
		baseScore: 0.638,
		releaseDate: '2024-05-29',
		modelType: 'dense',
		instructionTuned: true,
		openWeights: true,
		sentenceTransformersCompatible: true
	},
	{
		name: 'voyage-3-large',
		displayName: 'voyage-3-large',
		org: 'Voyage AI',
		url: 'https://docs.voyageai.com/docs/embeddings',
		zeroShotPct: -1,
		activeParamsB: 0,
		totalParamsB: 0,
		embeddingDim: 1024,
		maxTokens: 32000,
		baseScore: 0.625,
		releaseDate: '2025-01-21',
		modelType: 'dense',
		instructionTuned: true,
		openWeights: false,
		sentenceTransformersCompatible: false
	},
	{
		name: 'qwen3-embedding-0.6b',
		displayName: 'Qwen3-Embedding-0.6B',
		org: 'Qwen',
		url: 'https://huggingface.co/Qwen/Qwen3-Embedding-0.6B',
		zeroShotPct: 95,
		activeParamsB: 0.6,
		totalParamsB: 0.6,
		embeddingDim: 1024,
		maxTokens: 32768,
		baseScore: 0.612,
		releaseDate: '2025-06-05',
		modelType: 'dense',
		instructionTuned: true,
		openWeights: true,
		sentenceTransformersCompatible: true
	},
	{
		name: 'NV-Embed-v2',
		displayName: 'NV-Embed-v2',
		org: 'NVIDIA',
		url: 'https://huggingface.co/nvidia/NV-Embed-v2',
		zeroShotPct: 82,
		activeParamsB: 7.85,
		totalParamsB: 7.85,
		embeddingDim: 4096,
		maxTokens: 32768,
		baseScore: 0.604,
		releaseDate: '2024-09-09',
		modelType: 'dense',
		instructionTuned: true,
		openWeights: true,
		sentenceTransformersCompatible: true
	},
	{
		name: 'bge-multilingual-gemma2',
		displayName: 'bge-multilingual-gemma2',
		org: 'BAAI',
		url: 'https://huggingface.co/BAAI/bge-multilingual-gemma2',
		zeroShotPct: 90,
		activeParamsB: 9.24,
		totalParamsB: 9.24,
		embeddingDim: 3584,
		maxTokens: 8192,
		baseScore: 0.598,
		releaseDate: '2024-07-25',
		modelType: 'dense',
		instructionTuned: true,
		openWeights: true,
		sentenceTransformersCompatible: true
	},
	{
		name: 'text-embedding-3-large',
		displayName: 'text-embedding-3-large',
		org: 'OpenAI',
		url: 'https://platform.openai.com/docs/guides/embeddings',
		zeroShotPct: -1,
		activeParamsB: 0,
		totalParamsB: 0,
		embeddingDim: 3072,
		maxTokens: 8191,
		baseScore: 0.589,
		releaseDate: '2024-01-25',
		modelType: 'dense',
		instructionTuned: false,
		openWeights: false,
		sentenceTransformersCompatible: false
	},
	{
		name: 'multilingual-e5-large-instruct',
		displayName: 'multilingual-e5-large-instruct',
		org: 'intfloat',
		url: 'https://huggingface.co/intfloat/multilingual-e5-large-instruct',
		zeroShotPct: 100,
		activeParamsB: 0.56,
		totalParamsB: 0.56,
		embeddingDim: 1024,
		maxTokens: 514,
		baseScore: 0.581,
		releaseDate: '2024-02-08',
		modelType: 'dense',
		instructionTuned: true,
		openWeights: true,
		sentenceTransformersCompatible: true
	},
	{
		name: 'jina-colbert-v2',
		displayName: 'jina-colbert-v2',
		org: 'jinaai',
		url: 'https://huggingface.co/jinaai/jina-colbert-v2',
		zeroShotPct: 100,
		activeParamsB: 0.56,
		totalParamsB: 0.56,
		embeddingDim: 128,
		maxTokens: 8192,
		baseScore: 0.554,
		releaseDate: '2024-08-30',
		modelType: 'late-interaction',
		instructionTuned: false,
		openWeights: true,
		sentenceTransformersCompatible: false
	},
	{
		name: 'mxbai-rerank-large-v2',
		displayName: 'mxbai-rerank-large-v2',
		org: 'mixedbread-ai',
		url: 'https://huggingface.co/mixedbread-ai/mxbai-rerank-large-v2',
		zeroShotPct: 100,
		activeParamsB: 1.5,
		totalParamsB: 1.5,
		embeddingDim: 0,
		maxTokens: 8192,
		baseScore: 0.541,
		releaseDate: '2025-03-04',
		modelType: 'cross-encoder',
		instructionTuned: false,
		openWeights: true,
		sentenceTransformersCompatible: false
	},
	{
		name: 'splade-v3',
		displayName: 'splade-v3',
		org: 'naver',
		url: 'https://huggingface.co/naver/splade-v3',
		zeroShotPct: 100,
		activeParamsB: 0.11,
		totalParamsB: 0.11,
		embeddingDim: 30522,
		maxTokens: 256,
		baseScore: 0.498,
		releaseDate: '2024-03-18',
		modelType: 'sparse',
		instructionTuned: false,
		openWeights: true,
		sentenceTransformersCompatible: false
	}
];

function hashSeed(str: string): number {
	let h = 2166136261;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = (h * 16777619) >>> 0;
	}
	return h;
}

function jitter(seed: number, idx: number): number {
	const x = Math.sin(seed + idx * 1313) * 10000;
	return x - Math.floor(x);
}

function clamp(n: number, lo = 0, hi = 1): number {
	return Math.max(lo, Math.min(hi, n));
}

// Openness derived from traits the fixture already carries, so the summary
// table's Openness column has a realistic spread without hand-maintaining a
// dict on all 13 models. Proprietary models can still have a paper and a model
// card; open-weights models additionally earn weights + license, and training
// code / data on a deterministic alternation so scores aren't all identical.
function mockOpenness(model: MockModel, idx: number): Record<string, boolean> {
	const open = model.openWeights;
	return {
		'open weights': open,
		'open license': open,
		'open training code': open && idx % 3 === 0,
		'open training data': open && idx % 4 === 0,
		paper: idx % 2 === 0,
		'model card': true
	};
}

function buildRow(
	model: MockModel,
	taskTypes: string[],
	tasks: string[],
	benchmarkSeed: number,
	idx: number,
	customGroupings: CustomGrouping[] = []
): SummaryRow {
	const openness = mockOpenness(model, idx);
	const meta: ModelMeta = {
		name: model.name,
		displayName: model.displayName,
		org: model.org,
		url: model.url,
		zeroShotPct: model.zeroShotPct,
		activeParamsB: model.activeParamsB,
		totalParamsB: model.totalParamsB,
		embeddingDim: model.embeddingDim,
		maxTokens: model.maxTokens,
		releaseDate: model.releaseDate,
		modelType: model.modelType,
		instructionTuned: model.instructionTuned,
		openWeights: model.openWeights,
		sentenceTransformersCompatible: model.sentenceTransformersCompatible,
		openness,
		opennessScore: Object.values(openness).filter(Boolean).length
	};

	const scoresByTaskType: Record<string, number> = {};
	let total = 0;
	for (let i = 0; i < taskTypes.length; i++) {
		const noise = (jitter(benchmarkSeed + idx, i) - 0.5) * 0.18;
		const s = clamp(model.baseScore + noise, 0, 0.99);
		scoresByTaskType[taskTypes[i]] = s;
		total += s;
	}
	const meanTaskType = total / Math.max(taskTypes.length, 1);
	// meanTask drifts slightly from meanTaskType.
	const meanTask = clamp(meanTaskType + (jitter(benchmarkSeed, idx) - 0.5) * 0.02);

	// Per-task scores: anchor each task to its task type's score, then jitter.
	const scoresByTask: Record<string, number> = {};
	for (let i = 0; i < tasks.length; i++) {
		const baseTT = taskTypes[i % Math.max(taskTypes.length, 1)] ?? '';
		const base = scoresByTaskType[baseTT] ?? model.baseScore;
		const noise = (jitter(benchmarkSeed + idx * 31, i + 7) - 0.5) * 0.12;
		scoresByTask[tasks[i]] = clamp(base + noise, 0, 0.99);
	}

	// One jittered mean per (dimension, group) pair, anchored to meanTask so
	// values stay in a plausible range — same policy as scoresByTaskType.
	let scoresByCustomGroup: Record<string, Record<string, number>> | undefined;
	if (customGroupings.length > 0) {
		scoresByCustomGroup = {};
		for (const dim of customGroupings) {
			const byLabel: Record<string, number> = {};
			for (let i = 0; i < dim.groups.length; i++) {
				const noise = (jitter(benchmarkSeed + idx * 53, i + 17) - 0.5) * 0.15;
				byLabel[dim.groups[i].label] = clamp(meanTask + noise, 0, 0.99);
			}
			scoresByCustomGroup[dim.name] = byLabel;
		}
	}

	return {
		rank: 0,
		model: meta,
		zeroShotPct: model.zeroShotPct,
		activeParamsB: model.activeParamsB,
		totalParamsB: model.totalParamsB,
		embeddingDim: model.embeddingDim,
		maxTokens: model.maxTokens,
		meanTask,
		meanTaskType,
		scoresByTaskType,
		scoresByTask,
		scoresByCustomGroup
	};
}

// Per-task descriptions are produced by mixing a type-specific template with a
// deterministic corpus + size, hashed off the task name so each task reads
// differently while still feeling reasonable for its type.
const TYPE_TEMPLATES: Record<string, string[]> = {
	Classification: [
		'Classify {domain} {modality} samples drawn from {source} into discrete categories.',
		'Multi-class classification of {domain} excerpts collected from {source} ({n} examples).',
		'Predict the topic label for {domain} content sourced from {source}.',
		'Coarse-grained {domain} classification over {n} samples taken from {source}.'
	],
	MultilabelClassification: [
		'Assign one or more labels to each {domain} sample from {source} ({n} entries).',
		'Multi-label tagging of {domain} {modality} content drawn from {source}.',
		'Predict the full label set for each {domain} excerpt sourced from {source}.',
		'Multi-label evaluation over {n} {domain} samples from {source}.'
	],
	Clustering: [
		'Group {n} {domain} documents from {source} into coherent topic clusters.',
		'Discover latent clusters in a corpus of {domain} {modality} drawn from {source}.',
		'Unsupervised clustering of {domain} excerpts collected from {source}.',
		'Cluster {n} {domain} entries by topic using a corpus from {source}.'
	],
	PairClassification: [
		'Decide whether pairs of {domain} sentences from {source} convey the same meaning.',
		'Binary classification of {domain} {modality} pairs sourced from {source}.',
		'Detect paraphrases among {n} {domain} sentence pairs drawn from {source}.',
		'Predict semantic equivalence between {domain} sentence pairs in {source}.'
	],
	Reranking: [
		'Re-rank {n} candidate {domain} documents per query against a corpus from {source}.',
		'Pointwise reranking of {domain} retrieval candidates collected from {source}.',
		'Listwise reranking over top-{n} {domain} candidates drawn from {source}.',
		'Re-order {domain} {modality} candidates for each query taken from {source}.'
	],
	InstructionReranking: [
		'Re-rank {domain} candidates by following a natural-language instruction over content from {source}.',
		'Instruction-conditioned reranking on {n} {domain} candidates drawn from {source}.',
		'Score {domain} candidates against a free-text instruction grounded in {source}.',
		'Instruction-aware reranking of {domain} {modality} candidates from {source}.'
	],
	Retrieval: [
		'Retrieve relevant {domain} documents from {source} given a natural-language query.',
		'Open-domain retrieval over {n} {domain} {modality} passages drawn from {source}.',
		'Dense retrieval evaluation on {domain} content sourced from {source}.',
		'Find the relevant {domain} document for each query against a {source}-based corpus.'
	],
	STS: [
		'Predict the semantic similarity score for {domain} sentence pairs from {source}.',
		'Rate semantic similarity (0-5) on {domain} sentence pairs collected from {source}.',
		'Continuous similarity prediction over {n} {domain} sentence pairs from {source}.',
		'Sentence-similarity benchmark on {domain} content drawn from {source}.'
	],
	BitextMining: [
		'Mine parallel sentence pairs between {lang1} and {lang2} from {source}.',
		'Identify bitext pairs across languages within {domain} content from {source}.',
		'Cross-lingual sentence alignment on {domain} {modality} drawn from {source}.',
		'Recover parallel {domain} sentences from {source} between {lang1} and {lang2}.'
	],
	Summarization: [
		'Produce concise summaries of {domain} documents drawn from {source}.',
		'Abstractive summarization of {n} {domain} {modality} excerpts from {source}.',
		'Generate short summaries for {domain} content collected from {source}.',
		'Compress {domain} documents from {source} into 2-3 sentence summaries.'
	]
};

const SOURCES = [
	'Wikipedia',
	'Reddit',
	'arXiv',
	'Reuters',
	'StackExchange',
	'Common Crawl',
	'GitHub',
	'PubMed',
	'EuroParl',
	'OpenSubtitles',
	'WMT news',
	'TweetEval',
	'Yelp reviews',
	'IMDB reviews',
	'Project Gutenberg',
	'BookCorpus',
	'Quora question pairs',
	'CNN / DailyMail',
	'NewsCrawl',
	'CC-News'
];
const SIZES = ['1K', '5K', '10K', '25K', '50K', '100K', '250K', '1M'];

function taskDescription(
	name: string,
	type: string,
	domain: string,
	modality: string,
	languages: string[]
): string {
	const raw = hashSeed(name);
	// Bit-mix to decorrelate low bits across sequential task names (FNV-1a
	// on "Task_1", "Task_2", ... keeps the bottom bits very predictable).
	let s = raw;
	s ^= s >>> 16;
	s = Math.imul(s, 0x7feb352d) >>> 0;
	s ^= s >>> 15;
	s = Math.imul(s, 0x846ca68b) >>> 0;
	s ^= s >>> 16;
	const seed = s >>> 0;
	const templates = TYPE_TEMPLATES[type] ?? [
		'Evaluate embedding quality on {domain} {modality} drawn from {source} ({n} samples).'
	];
	const tmpl = templates[seed % templates.length];
	const source = SOURCES[(seed >>> 7) % SOURCES.length];
	const size = SIZES[(seed >>> 13) % SIZES.length];
	const lang1 = languages[0] ?? 'English';
	const lang2 = languages[1] ?? languages[0] ?? 'French';
	return tmpl
		.replaceAll('{domain}', domain.toLowerCase())
		.replaceAll('{modality}', modality)
		.replaceAll('{source}', source)
		.replaceAll('{n}', size)
		.replaceAll('{lang1}', lang1)
		.replaceAll('{lang2}', lang2);
}

function buildTasksMeta(
	tasks: string[],
	taskTypes: string[],
	languages: string[],
	domains: string[],
	modalities: string[]
): TaskMeta[] {
	if (tasks.length === 0) return [];
	const nLangs = Math.max(1, Math.min(3, languages.length));
	return tasks.map((name, i) => {
		const taskLangs: string[] = [];
		for (let j = 0; j < nLangs; j++) {
			taskLangs.push(languages[(i * 7 + j * 13) % languages.length]);
		}
		const domain = domains.length > 0 ? domains[i % domains.length] : 'Web';
		const type = taskTypes[i % Math.max(taskTypes.length, 1)] ?? 'Retrieval';
		const modality = modalities[i % Math.max(modalities.length, 1)] ?? 'text';
		const uniqueLangs = Array.from(new Set(taskLangs));
		return {
			name,
			type,
			// API supplies simplifiedType; the mock fallback just echoes the
			// raw type lowercased so callers never see undefined.
			simplifiedType: type.toLowerCase(),
			languages: uniqueLangs,
			domains: [domain],
			modalities: [modality],
			description: taskDescription(name, type, domain, modality, uniqueLangs)
		};
	});
}

export function buildMockSummary(benchmarkName: string): BenchmarkSummary {
	const benchmark = BENCHMARK_INDEX[benchmarkName];
	const taskTypes = benchmark?.taskTypes ?? ['Classification', 'Retrieval', 'STS'];
	const tasks = benchmark?.tasks ?? [];
	const languages = benchmark?.languages ?? ['eng-Latn'];
	const domains = benchmark?.domains ?? [];
	const modalities = benchmark?.modalities ?? ['text'];
	const seed = hashSeed(benchmarkName);

	const tasksMeta = buildTasksMeta(tasks, taskTypes, languages, domains, modalities);
	const customGroupings = benchmark?.customGroupings ?? [];

	const rows = MOCK_MODELS.map((m, i) => buildRow(m, taskTypes, tasks, seed, i, customGroupings));
	rows.sort((a, b) => (b.meanTask ?? -Infinity) - (a.meanTask ?? -Infinity));
	rows.forEach((r, i) => (r.rank = i + 1));

	return {
		benchmarkName,
		taskTypes,
		tasks,
		tasksMeta,
		rows,
		aggregations: benchmark?.aggregations ?? ['mean_task', 'mean_task_type', 'task_types'],
		customGroupings
	};
}
