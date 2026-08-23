import type { Benchmark, MenuEntry } from '../../src/lib/types';

export const COMMON_DOMAINS = [
	'Academic',
	'Blog',
	'Constructed',
	'Encyclopaedic',
	'Entertainment',
	'Fiction',
	'Financial',
	'Government',
	'Legal',
	'Medical',
	'News',
	'Non-fiction',
	'Programming',
	'Religious',
	'Reviews',
	'Social',
	'Spoken',
	'Subtitles',
	'Web',
	'Written'
];

// Curated multilingual ISO-639-3 + ISO-15924 sample. Used for the language filter
// list. The displayed "number of languages" stat is decoupled from this list so
// the description can still claim large numbers like 250.
export const MMTEB_LANGUAGES = [
	'eng-Latn',
	'fra-Latn',
	'deu-Latn',
	'spa-Latn',
	'por-Latn',
	'ita-Latn',
	'nld-Latn',
	'pol-Latn',
	'rus-Cyrl',
	'ukr-Cyrl',
	'ces-Latn',
	'swe-Latn',
	'nor-Latn',
	'dan-Latn',
	'fin-Latn',
	'tur-Latn',
	'zho-Hans',
	'zho-Hant',
	'jpn-Jpan',
	'kor-Kore',
	'tha-Thai',
	'vie-Latn',
	'ind-Latn',
	'msa-Latn',
	'tgl-Latn',
	'hin-Deva',
	'ben-Beng',
	'urd-Arab',
	'fas-Arab',
	'ara-Arab',
	'heb-Hebr',
	'ell-Grek',
	'swa-Latn',
	'yor-Latn',
	'hau-Latn',
	'amh-Ethi'
];

function makeBenchmark(partial: Partial<Benchmark> & { name: string }): Benchmark {
	return {
		displayName: partial.displayName ?? partial.name,
		description:
			partial.description ??
			`Mock description for ${partial.name}. The real description will come from the mteb backend.`,
		reference: partial.reference,
		citation: partial.citation,
		languages: partial.languages ?? ['eng-Latn'],
		taskTypes: partial.taskTypes ?? [
			'Classification',
			'Clustering',
			'PairClassification',
			'Reranking',
			'Retrieval',
			'STS',
			'Summarization'
		],
		tasks: partial.tasks ?? [],
		domains: partial.domains ?? ['Web', 'News', 'Academic'],
		modalities: partial.modalities ?? ['text'],
		aggregations: partial.aggregations ?? ['mean_task', 'mean_task_type', 'task_types'],
		// Deterministic placeholder: a seedless mock won't have real counts,
		// but a non-zero value lets the catalogue card render the "X models"
		// stat in offline / Playwright runs.
		numModels: partial.numModels ?? 24,
		...partial
	};
}

const MTEB_MULTILINGUAL_V2 = makeBenchmark({
	name: 'MTEB(Multilingual, v2)',
	displayName: 'MTEB(Multilingual, v2)',
	description:
		'A large-scale multilingual expansion of MTEB known as MMTEB, driven mainly by highly-curated community contributions covering 250+ languages.',
	reference: 'https://arxiv.org/abs/2502.13595',
	languages: MMTEB_LANGUAGES,
	// Mirrors upstream `Benchmark.language_view` so e2e can deep-link
	// into ?tab=perf_language without a live backend.
	languageView: ['English', 'Chinese', 'Hindi', 'Spanish', 'French', 'Arabic', 'Russian', 'German'],
	tasks: Array.from({ length: 132 }, (_, i) => `Task_${i + 1}`),
	domains: COMMON_DOMAINS,
	modalities: ['text'],
	taskTypes: [
		'BitextMining',
		'Classification',
		'Clustering',
		'InstructionReranking',
		'MultilabelClassification',
		'PairClassification',
		'Reranking',
		'Retrieval',
		'STS'
	],
	citation: `@article{enevoldsen2025mmteb,
  title={MMTEB: Massive Multilingual Text Embedding Benchmark},
  author={Enevoldsen, Kenneth and Chung, Isaac and Kerboua, Imene and Kardos, M{\\'a}rton and others},
  journal={arXiv preprint arXiv:2502.13595},
  year={2025}
}`
});

const MTEB_ENG_V2 = makeBenchmark({
	name: 'MTEB(eng, v2)',
	displayName: 'MTEB(eng, v2)',
	description: 'English-focused MTEB v2 benchmark.',
	reference: 'https://arxiv.org/abs/2210.07316',
	languages: ['eng-Latn'],
	domains: COMMON_DOMAINS,
	tasks: Array.from({ length: 56 }, (_, i) => `EngTask_${i + 1}`),
	citation: `@article{muennighoff2022mteb,
  title={MTEB: Massive Text Embedding Benchmark},
  author={Muennighoff, Niklas and Tazi, Nouamane and Magne, Lo{\\"\\i}c and Reimers, Nils},
  journal={arXiv preprint arXiv:2210.07316},
  year={2022}
}`
});

const HUME_V1 = makeBenchmark({
	name: 'HUME(v1)',
	displayName: 'Human Benchmark',
	description: 'Human-curated benchmark for embedding models.',
	tasks: Array.from({ length: 10 }, (_, i) => `Hume_${i + 1}`)
});

const MIEB_MULTILINGUAL = makeBenchmark({
	name: 'MIEB(Multilingual)',
	description: 'Multilingual Image Embedding Benchmark.',
	modalities: ['image']
});
const MIEB_ENG = makeBenchmark({ name: 'MIEB(eng)', modalities: ['image'] });
const MIEB_LITE = makeBenchmark({ name: 'MIEB(lite)', modalities: ['image'] });
const MIEB_IMG = makeBenchmark({ name: 'MIEB(Img)', modalities: ['image'] });

const MAEB_BETA = makeBenchmark({ name: 'MAEB(beta)', modalities: ['audio'] });
const MAEB_AUDIO_ONLY = makeBenchmark({
	name: 'MAEB(beta, audio-only)',
	modalities: ['audio']
});

const MTEB_CODE = makeBenchmark({ name: 'MTEB(Code, v1)' });
const MTEB_LAW = makeBenchmark({ name: 'MTEB(Law, v1)' });
const MTEB_MEDICAL = makeBenchmark({ name: 'MTEB(Medical, v1)' });
const CHEM_TEB = makeBenchmark({ name: 'ChemTEB' });
const COREB = makeBenchmark({ name: 'CoREB(v1)' });

const MTEB_EUROPE = makeBenchmark({ name: 'MTEB(Europe, v1)' });
const MTEB_INDIC = makeBenchmark({ name: 'MTEB(Indic, v1)' });
const MTEB_SCAND = makeBenchmark({ name: 'MTEB(Scandinavian, v1)' });
const MTEB_CMN = makeBenchmark({ name: 'MTEB(cmn, v1)' });
const MTEB_DEU = makeBenchmark({ name: 'MTEB(deu, v1)' });
const MTEB_FRA = makeBenchmark({ name: 'MTEB(fra, v1)' });

const RTEB_BETA = makeBenchmark({ name: 'RTEB(beta)' });
const RTEB_ENG = makeBenchmark({ name: 'RTEB(eng, beta)' });
const VIDORE_V3 = makeBenchmark({ name: 'ViDoRe(v3)' });
const JINA_VDR = makeBenchmark({ name: 'JinaVDR' });
const VIDORE_V1V2 = makeBenchmark({ name: 'ViDoRe(v1&v2)' });

const RTEB_FIN = makeBenchmark({ name: 'RTEB(fin, beta)' });
const RTEB_LAW = makeBenchmark({ name: 'RTEB(Law, beta)' });
const RTEB_CODE = makeBenchmark({ name: 'RTEB(Code, beta)' });
const COIR = makeBenchmark({ name: 'CoIR' });
const RTEB_HEALTH = makeBenchmark({ name: 'RTEB(Health, beta)' });
const FOLLOW_IR = makeBenchmark({ name: 'FollowIR' });
const LONG_EMBED = makeBenchmark({ name: 'LongEmbed' });
// Custom-groups fixture — mirrors the real backend's LMEB "Memory Type"
// dimension so mock-API-driven tests (unit + Playwright) can exercise the
// SummaryTable super-header / per-group columns without a live mteb API.
const LMEB = makeBenchmark({
	name: 'LMEB',
	displayName: 'Long-Horizon Memory',
	description:
		'Long-horizon memory retrieval quality across episodic, dialogue, semantic, and procedural tasks.',
	taskTypes: ['Retrieval'],
	tasks: Array.from({ length: 22 }, (_, i) => `LmebTask_${i + 1}`),
	aggregations: ['mean_task', 'mean_task_type', 'task_types', 'custom_groups'],
	customGroupings: [
		{
			name: 'Memory Type',
			groups: [
				{
					label: 'Episodic',
					description: 'Recall past events grounded in temporal cues.',
					tasks: ['LmebTask_1', 'LmebTask_2']
				},
				{
					label: 'Dialogue',
					description: 'Maintain context across multi-turn interactions.',
					tasks: [
						'LmebTask_3',
						'LmebTask_4',
						'LmebTask_5',
						'LmebTask_6',
						'LmebTask_7',
						'LmebTask_8'
					]
				},
				{
					label: 'Semantic',
					description: null,
					tasks: [
						'LmebTask_9',
						'LmebTask_10',
						'LmebTask_11',
						'LmebTask_12',
						'LmebTask_13',
						'LmebTask_14',
						'LmebTask_15',
						'LmebTask_16'
					]
				},
				{
					label: 'Procedural',
					description: 'Recall learned skills and structured procedures.',
					tasks: [
						'LmebTask_17',
						'LmebTask_18',
						'LmebTask_19',
						'LmebTask_20',
						'LmebTask_21',
						'LmebTask_22'
					]
				}
			]
		}
	]
});
const BRIGHT = makeBenchmark({ name: 'BRIGHT' });

const BEIR = makeBenchmark({ name: 'BEIR' });
const NANO_BEIR = makeBenchmark({ name: 'NanoBEIR' });

export const BENCHMARK_INDEX: Record<string, Benchmark> = Object.fromEntries(
	[
		MTEB_MULTILINGUAL_V2,
		MTEB_ENG_V2,
		HUME_V1,
		MIEB_MULTILINGUAL,
		MIEB_ENG,
		MIEB_LITE,
		MIEB_IMG,
		MAEB_BETA,
		MAEB_AUDIO_ONLY,
		MTEB_CODE,
		MTEB_LAW,
		MTEB_MEDICAL,
		CHEM_TEB,
		COREB,
		MTEB_EUROPE,
		MTEB_INDIC,
		MTEB_SCAND,
		MTEB_CMN,
		MTEB_DEU,
		MTEB_FRA,
		RTEB_BETA,
		RTEB_ENG,
		VIDORE_V3,
		JINA_VDR,
		VIDORE_V1V2,
		RTEB_FIN,
		RTEB_LAW,
		RTEB_CODE,
		COIR,
		RTEB_HEALTH,
		FOLLOW_IR,
		LONG_EMBED,
		LMEB,
		BRIGHT,
		BEIR,
		NANO_BEIR
	].map((b) => [b.name, b])
);

export const DEFAULT_BENCHMARK_NAME = MTEB_MULTILINGUAL_V2.name;

export const BENCHMARK_MENU: MenuEntry[] = [
	{
		name: 'General Purpose',
		open: true,
		children: [
			MTEB_MULTILINGUAL_V2,
			MTEB_ENG_V2,
			HUME_V1,
			{
				name: 'Image',
				children: [MIEB_MULTILINGUAL, MIEB_ENG, MIEB_LITE, MIEB_IMG]
			},
			{
				name: 'Audio',
				children: [MAEB_BETA, MAEB_AUDIO_ONLY]
			},
			{
				name: 'Domain-Specific',
				children: [MTEB_CODE, MTEB_LAW, MTEB_MEDICAL, CHEM_TEB, COREB]
			},
			{
				name: 'Language-specific',
				children: [MTEB_EUROPE, MTEB_INDIC, MTEB_SCAND, MTEB_CMN, MTEB_DEU, MTEB_FRA]
			},
			{
				name: 'Miscellaneous',
				children: []
			}
		]
	},
	{
		name: 'Retrieval',
		open: true,
		children: [
			RTEB_BETA,
			RTEB_ENG,
			{
				name: 'Image',
				open: true,
				children: [VIDORE_V3, JINA_VDR, { name: 'Other', children: [VIDORE_V1V2] }]
			},
			{
				name: 'Domain-Specific',
				children: [
					RTEB_FIN,
					RTEB_LAW,
					RTEB_CODE,
					COIR,
					RTEB_HEALTH,
					FOLLOW_IR,
					LONG_EMBED,
					LMEB,
					BRIGHT
				]
			},
			{
				name: 'Language-specific',
				children: [BEIR]
			},
			{
				name: 'Miscellaneous',
				children: [NANO_BEIR]
			}
		]
	}
];
