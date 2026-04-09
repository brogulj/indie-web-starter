import type { CollectionDataMap, CollectionName } from '../types/collections.generated';
import { buildBackendUrl, fetchBackend, type BackendRequestOptions } from './backend';

type CollectionStatus = 'draft' | 'published' | 'archived';

type CollectionFilterOperator = 'equals' | 'not_equals' | 'contains' | 'starts_with' | 'ends_with' | 'greater_than' | 'less_than';

export type CollectionFilter = {
	field: string;
	operator: CollectionFilterOperator;
	value: string | number | boolean;
};

type CollectionWhere = {
	and: CollectionFilter[];
};

type CollectionDataFor<K extends string> = K extends CollectionName ? CollectionDataMap[K] : Record<string, unknown>;
type SonicCollectionData<K extends string> = CollectionDataFor<K> & Record<string, unknown>;

type InternalContentFetchOptions = {
	skipReferenceHydration?: boolean;
	relationshipLookupCache?: Map<string, SonicCollectionContentItem<string> | null>;
};

export type SonicCollectionContentItem<K extends string = string> = {
	id: string;
	title: string;
	slug: string;
	status: CollectionStatus;
	collectionId: string;
	createdAt: string;
	updatedAt: string;
	data: SonicCollectionData<K>;
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
				collection?: string;
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

const buildSonicUrl = (path: string, params?: URLSearchParams, options?: BackendRequestOptions): string => {
	const url = new URL(buildBackendUrl(path, options));
	if (params) {
		url.search = params.toString();
	}
	return url.toString();
};

const fetchJson = async <T>(url: string, options?: BackendRequestOptions): Promise<T> => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const response = await fetchBackend(url, { signal: controller.signal }, options);
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

const toRelationshipDataFieldName = (fieldName: string): string => `${fieldName}Data`;

const resolveCollectionDefinition = async (
	collection: string,
	options?: BackendRequestOptions
): Promise<SonicCollection | undefined> => {
	const collections = await sonicGetCollectionsCached(options);
	return collections.find((item) => item.id === collection || item.name === collection);
};

const getReferenceFields = (
	collectionDef: SonicCollection | undefined
): Array<{ fieldName: string; targetCollection: string }> => {
	if (!collectionDef?.schema?.properties) return [];
	return Object.entries(collectionDef.schema.properties)
		.filter(([, field]) => String(field.type ?? '').toLowerCase() === 'reference' && typeof field.collection === 'string')
		.map(([fieldName, field]) => ({ fieldName, targetCollection: String(field.collection) }));
};

const resolveRelationshipByIdThenSlug = async (
	targetCollection: string,
	referenceValue: string,
	options: BackendRequestOptions | undefined,
	internal: InternalContentFetchOptions
): Promise<SonicCollectionContentItem<string> | null> => {
	const cache = internal.relationshipLookupCache ?? new Map<string, SonicCollectionContentItem<string> | null>();
	internal.relationshipLookupCache = cache;

	const cacheKey = `${targetCollection}:${referenceValue}`;
	if (cache.has(cacheKey)) {
		return cache.get(cacheKey) ?? null;
	}

	const lookupOptions: InternalContentFetchOptions = {
		skipReferenceHydration: true,
		relationshipLookupCache: cache,
	};

	const byId = await sonicGetContent(
		targetCollection,
		[{ field: 'id', operator: 'equals', value: referenceValue }],
		options,
		lookupOptions
	);
	if (byId[0]) {
		cache.set(cacheKey, byId[0] as SonicCollectionContentItem<string>);
		return byId[0] as SonicCollectionContentItem<string>;
	}

	const bySlug = await sonicGetContent(
		targetCollection,
		[{ field: 'slug', operator: 'equals', value: referenceValue }],
		options,
		lookupOptions
	);
	const resolved = (bySlug[0] as SonicCollectionContentItem<string> | undefined) ?? null;
	cache.set(cacheKey, resolved);
	return resolved;
};

const hydrateReferenceFields = async <K extends string>(
	collection: K,
	items: SonicCollectionContentItem<K>[],
	options?: BackendRequestOptions,
	internal: InternalContentFetchOptions = {}
): Promise<SonicCollectionContentItem<K>[]> => {
	if (internal.skipReferenceHydration || items.length === 0) return items;

	const collectionDef = await resolveCollectionDefinition(collection, options);
	const referenceFields = getReferenceFields(collectionDef);
	if (referenceFields.length === 0) return items;

	const relationshipLookupCache = internal.relationshipLookupCache ?? new Map<string, SonicCollectionContentItem<string> | null>();
	const hydrationOptions: InternalContentFetchOptions = {
		skipReferenceHydration: true,
		relationshipLookupCache,
	};

	const hydratedItems: SonicCollectionContentItem<K>[] = [];
	for (const item of items) {
		const data = { ...item.data } as SonicCollectionData<K>;
		for (const { fieldName, targetCollection } of referenceFields) {
			const dataFieldName = toRelationshipDataFieldName(fieldName);
			const rawValue = data[fieldName];
			if (typeof rawValue !== 'string' || rawValue.trim() === '') {
				data[dataFieldName] = null;
				continue;
			}

			data[dataFieldName] = await resolveRelationshipByIdThenSlug(
				targetCollection,
				rawValue,
				options,
				hydrationOptions
			);
		}

		hydratedItems.push({ ...item, data });
	}

	return hydratedItems;
};

const resolveCollectionApiIdentifiers = async (collection: string, options?: BackendRequestOptions): Promise<string[]> => {
	const collections = await sonicGetCollectionsCached(options);
	const match = collections.find((item) => item.id === collection || item.name === collection);
	const candidates = [collection];
	if (match?.id && match.id !== collection) {
		candidates.push(match.id);
	}
	return candidates;
};

export const sonicGetContentBySlug = async <K extends string>(
	collection: K,
	slug: string,
	filters: CollectionFilter[] = [],
	options?: BackendRequestOptions,
	internal: InternalContentFetchOptions = {}
): Promise<SonicCollectionContentItem<K> | null> => {
	const where: CollectionWhere = {
		and: [{ field: 'slug', operator: 'equals', value: slug }, { field: 'status', operator: 'not_equals', value: 'draft' }, ...filters],
	};

	const params = new URLSearchParams();
	params.set('where', JSON.stringify(where));
	const collectionIdentifiers = await resolveCollectionApiIdentifiers(collection, options);
	let firstSuccessfulItems: SonicCollectionContentItem<K>[] | null = null;

	for (const collectionIdentifier of collectionIdentifiers) {
		const url = buildSonicUrl(`/api/collections/${collectionIdentifier}/content`, params, options);
		try {
			const content = await fetchJson<GetCollectionContentResponse<K>>(url, options);
			const items = await hydrateReferenceFields(collection, normalizeContentResponse(content), options, internal);
			if (items.length > 0) return items[0];
			if (!firstSuccessfulItems) firstSuccessfulItems = items;
		} catch (error) {
			if (error instanceof SonicApiError && error.status === 404) continue;
			throw error;
		}
	}

	return firstSuccessfulItems?.[0] ?? null;
};

export const sonicGetContent = async <K extends string>(
	collection: K,
	filters: CollectionFilter[] = [],
	options?: BackendRequestOptions,
	internal: InternalContentFetchOptions = {}
): Promise<SonicCollectionContentItem<K>[]> => {
	const params = new URLSearchParams();
	if (filters.length > 0) {
		params.set('where', JSON.stringify({ and: filters }));
	}

	const collectionIdentifiers = await resolveCollectionApiIdentifiers(collection, options);
	let firstSuccessfulItems: SonicCollectionContentItem<K>[] | null = null;

	for (const collectionIdentifier of collectionIdentifiers) {
		const url = buildSonicUrl(`/api/collections/${collectionIdentifier}/content`, params, options);
		try {
			const content = await fetchJson<GetCollectionContentResponse<K>>(url, options);
			const items = await hydrateReferenceFields(collection, normalizeContentResponse(content), options, internal);
			if (items.length > 0) return items;
			if (!firstSuccessfulItems) firstSuccessfulItems = items;
		} catch (error) {
			if (error instanceof SonicApiError && error.status === 404) continue;
			throw error;
		}
	}

	return firstSuccessfulItems ?? [];
};

export const sonicGetCollections = async (options?: BackendRequestOptions): Promise<SonicCollection[]> => {
	const url = buildSonicUrl('/api/collections', undefined, options);
	const response = await fetchJson<GetCollectionsResponse>(url, options);
	return normalizeCollectionsResponse(response);
};

export const sonicGetCollectionsCached = async (options?: BackendRequestOptions): Promise<SonicCollection[]> => {
	if (options?.backendService) {
		return sonicGetCollections(options);
	}
	if (!collectionsCache) {
		collectionsCache = sonicGetCollections(options).catch((error) => {
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

const getCollectionRichTextFields = async (collection: string, options?: BackendRequestOptions): Promise<string[]> => {
	const collections = await sonicGetCollectionsCached(options);
	const collectionDef = collections.find((item) => item.name === collection);
	if (!collectionDef?.schema?.properties) return [];
	return Object.entries(collectionDef.schema.properties)
		.filter(([, field]) => isRichTextField(field))
		.map(([fieldName]) => fieldName);
};

export const sonicRenderRichTextFields = async <K extends string>(
	collection: K,
	data: CollectionDataFor<K>,
	renderMarkdown: (value: string) => string,
	options?: BackendRequestOptions
): Promise<CollectionDataFor<K> & Record<string, unknown>> => {
	const richTextFields = await getCollectionRichTextFields(collection, options);
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
