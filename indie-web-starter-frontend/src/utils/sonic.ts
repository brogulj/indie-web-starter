import type { CollectionDataMap, CollectionName } from '../types/collections.generated';

type CollectionStatus = 'draft' | 'published' | 'archived';

type CollectionFilterOperator =
	| 'equals'
	| 'not_equals'
	| 'contains'
	| 'starts_with'
	| 'ends_with'
	| 'greater_than'
	| 'less_than';

export type CollectionFilter = {
	field: string;
	operator: CollectionFilterOperator;
	value: string | number | boolean;
};

type CollectionWhere = {
	and: CollectionFilter[];
};

type CollectionDataFor<K extends string> = K extends CollectionName ? CollectionDataMap[K] : Record<string, unknown>;

export type SonicCollectionContentItem<K extends string = string> = {
	id: string;
	title: string;
	slug: string;
	status: CollectionStatus;
	collectionId: string;
	createdAt: string;
	updatedAt: string;
	data: CollectionDataFor<K>;
};

type GetCollectionContentResponse<K extends string> = {
	data: SonicCollectionContentItem<K>[];
};

export type SonicCollection = {
	id: string;
	name: string;
	display_name: string;
	description?: string;
	schema?: {
		type?: string;
		properties?: Record<
			string,
			{
				type?: string;
				format?: string;
				items?: {
					type?: string;
					properties?: Record<string, unknown>;
				};
			}
		>;
		required?: string[];
	};
};

type GetCollectionsResponse = {
	collections?: SonicCollection[];
	data?: SonicCollection[];
};

const API_BASE_URL = process.env.API_URL ?? 'http://localhost:8788';
const REQUEST_TIMEOUT_MS = Number(process.env.SONIC_TIMEOUT_MS ?? '8000');
let collectionsCache: Promise<SonicCollection[]> | null = null;

export class SonicApiError extends Error {
	readonly status: number;
	readonly url: string;

	constructor(message: string, status: number, url: string) {
		super(message);
		this.name = 'SonicApiError';
		this.status = status;
		this.url = url;
	}
}

const buildSonicUrl = (path: string, params?: URLSearchParams): string => {
	const url = new URL(path, API_BASE_URL);
	if (params) {
		url.search = params.toString();
	}
	return url.toString();
};

const fetchJson = async <T>(url: string): Promise<T> => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const response = await fetch(url, { signal: controller.signal });
		if (!response.ok) {
			throw new SonicApiError(`Sonic request failed (${response.status}): ${response.statusText}`, response.status, url);
		}
		return (await response.json()) as T;
	} catch (error) {
		if (error instanceof SonicApiError) throw error;
		if (error instanceof Error && error.name === 'AbortError') {
			throw new SonicApiError(`Sonic request timed out after ${REQUEST_TIMEOUT_MS}ms`, 504, url);
		}
		throw new SonicApiError('Sonic request failed due to a network error', 502, url);
	} finally {
		clearTimeout(timeoutId);
	}
};

const normalizeCollectionsResponse = (response: GetCollectionsResponse): SonicCollection[] => {
	if (Array.isArray(response.collections)) return response.collections;
	if (Array.isArray(response.data)) return response.data;
	return [];
};

const normalizeContentResponse = <K extends string>(response: GetCollectionContentResponse<K>): SonicCollectionContentItem<K>[] => {
	return Array.isArray(response.data) ? response.data : [];
};

export const sonicGetContentBySlug = async <K extends string>(
	collection: K,
	slug: string,
	filters: CollectionFilter[] = []
): Promise<SonicCollectionContentItem<K> | null> => {
	const where: CollectionWhere = {
		and: [
			{ field: 'slug', operator: 'equals', value: slug },
			{ field: 'status', operator: 'not_equals', value: 'draft' },
			...filters,
		],
	};

	const params = new URLSearchParams();
	params.set('where', JSON.stringify(where));
	const url = buildSonicUrl(`/api/collections/${collection}/content`, params);
	const content = await fetchJson<GetCollectionContentResponse<K>>(url);
	return normalizeContentResponse(content)[0] ?? null;
};

export const sonicGetContent = async <K extends string>(
	collection: K,
	filters: CollectionFilter[] = []
): Promise<SonicCollectionContentItem<K>[]> => {
	const params = new URLSearchParams();
	if (filters.length > 0) {
		params.set('where', JSON.stringify({ and: filters }));
	}

	const url = buildSonicUrl(`/api/collections/${collection}/content`, params);
	const content = await fetchJson<GetCollectionContentResponse<K>>(url);
	return normalizeContentResponse(content);
};

export const sonicGetCollections = async (): Promise<SonicCollection[]> => {
	const url = buildSonicUrl('/api/collections');
	const response = await fetchJson<GetCollectionsResponse>(url);
	return normalizeCollectionsResponse(response);
};

export const sonicGetCollectionsCached = async (): Promise<SonicCollection[]> => {
	if (!collectionsCache) {
		collectionsCache = sonicGetCollections().catch((error) => {
			collectionsCache = null;
			throw error;
		});
	}
	return collectionsCache;
};

const isRichTextField = (field: { type?: string; format?: string } | undefined): boolean => {
	if (!field) return false;
	const fieldType = String(field.type ?? '').toLowerCase();
	const fieldFormat = String(field.format ?? '').toLowerCase();
	return fieldType === 'richtext' || (fieldType === 'string' && fieldFormat === 'richtext');
};

const getCollectionRichTextFields = async (collection: string): Promise<string[]> => {
	const collections = await sonicGetCollectionsCached();
	const collectionDef = collections.find((item) => item.name === collection);
	if (!collectionDef?.schema?.properties) return [];
	return Object.entries(collectionDef.schema.properties)
		.filter(([, field]) => isRichTextField(field))
		.map(([fieldName]) => fieldName);
};

export const sonicRenderRichTextFields = async <K extends string>(
	collection: K,
	data: CollectionDataFor<K>,
	renderMarkdown: (value: string) => string
): Promise<CollectionDataFor<K> & Record<string, unknown>> => {
	const richTextFields = await getCollectionRichTextFields(collection);
	if (richTextFields.length === 0) {
		return data as CollectionDataFor<K> & Record<string, unknown>;
	}

	const output = { ...data } as CollectionDataFor<K> & Record<string, unknown>;
	for (const fieldName of richTextFields) {
		const rawValue = output[fieldName];
		if (typeof rawValue === 'string') {
			const htmlFieldName = `${fieldName}Html`;
			output[htmlFieldName] = renderMarkdown(rawValue);
		}
	}

	return output;
};

export const __resetSonicCollectionsCacheForTests = (): void => {
	collectionsCache = null;
};
