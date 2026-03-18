import { collectionArchiveRequiredData } from '../templates/collections-archive';
import { collectionRequiredData } from '../templates/collections';
import { pageRequiredData } from '../templates/pages';
import { parseRequiredDataConfig, type RequiredCollectionConfig } from '../types/required-data';
import { sonicGetContent, type SonicCollectionContentItem } from '../utils/sonic';

export type CollectionContentMap = Record<string, SonicCollectionContentItem[]>;

const toCamelCase = (value: string): string => value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());

export const getCollectionSortValue = (item: SonicCollectionContentItem, sortKey: string): string | number => {
	const normalizedSortKey = toCamelCase(sortKey);
	const rootValue = (item as Record<string, unknown>)[normalizedSortKey];
	if (typeof rootValue === 'string' || typeof rootValue === 'number') return rootValue;

	const dataValue = (item.data as Record<string, unknown>)[sortKey] ?? (item.data as Record<string, unknown>)[normalizedSortKey];
	if (typeof dataValue === 'string' || typeof dataValue === 'number') return dataValue;
	return '';
};

export const applyCollectionSortAndLimit = (
	items: SonicCollectionContentItem[],
	config: RequiredCollectionConfig
): SonicCollectionContentItem[] => {
	let output = items;

	if (typeof config.sort === 'string' && config.sort.trim()) {
		const isDesc = config.sort.startsWith('-');
		const sortKey = isDesc ? config.sort.slice(1) : config.sort;
		output = [...output].sort((left, right) => {
			const leftValue = getCollectionSortValue(left, sortKey);
			const rightValue = getCollectionSortValue(right, sortKey);
			if (leftValue === rightValue) return 0;
			if (typeof leftValue === 'number' && typeof rightValue === 'number') {
				return isDesc ? rightValue - leftValue : leftValue - rightValue;
			}
			return isDesc
				? String(rightValue).localeCompare(String(leftValue))
				: String(leftValue).localeCompare(String(rightValue));
		});
	}

	if (typeof config.limit === 'number' && Number.isFinite(config.limit) && config.limit > 0) {
		output = output.slice(0, config.limit);
	}

	return output;
};

const resolveRequiredCollections = async (config: unknown, scope: string): Promise<CollectionContentMap> => {
	const { collections = [] } = parseRequiredDataConfig(config);
	if (collections.length === 0) return {};

	const resolvedEntries = await Promise.all(
		collections.map(async (collectionConfig) => {
			try {
				const items = await sonicGetContent(
					collectionConfig.name,
					Array.isArray(collectionConfig.filters) ? collectionConfig.filters : []
				);
				return [collectionConfig.name, applyCollectionSortAndLimit(items, collectionConfig)] as const;
			} catch (error) {
				console.error(`Failed to load required collection "${collectionConfig.name}" for "${scope}"`, error);
				return [collectionConfig.name, []] as const;
			}
		})
	);

	return Object.fromEntries(resolvedEntries);
};

export const resolvePageCollections = async (page: string): Promise<CollectionContentMap> => {
	return resolveRequiredCollections(pageRequiredData[page], `page:${page}`);
};

export const resolveCollectionArchiveCollections = async (collection: string): Promise<CollectionContentMap> => {
	return resolveRequiredCollections(collectionArchiveRequiredData[collection], `collection-archive:${collection}`);
};

export const resolveCollectionItemCollections = async (collection: string): Promise<CollectionContentMap> => {
	return resolveRequiredCollections(collectionRequiredData[collection], `collection-item:${collection}`);
};
