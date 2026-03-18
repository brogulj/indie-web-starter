import type { CollectionFilter } from '../utils/sonic';

export type RequiredCollectionConfig = {
	name: string;
	limit?: number;
	sort?: string;
	filters?: CollectionFilter[];
};

export type RequiredDataConfig = {
	collections?: RequiredCollectionConfig[];
};

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const asCollectionFilterArray = (value: unknown): CollectionFilter[] | undefined => {
	if (!Array.isArray(value)) return undefined;

	const filters = value.filter((item): item is CollectionFilter => {
		if (!isObject(item)) return false;
		return typeof item.field === 'string' && typeof item.operator === 'string' && 'value' in item;
	});

	return filters.length > 0 ? filters : undefined;
};

export const parseRequiredDataConfig = (value: unknown): RequiredDataConfig => {
	if (!isObject(value) || !Array.isArray(value.collections)) return {};

	const collections = value.collections
		.filter((item): item is Record<string, unknown> => isObject(item) && typeof item.name === 'string')
		.map((item) => ({
			name: item.name as string,
			limit: typeof item.limit === 'number' ? item.limit : undefined,
			sort: typeof item.sort === 'string' ? item.sort : undefined,
			filters: asCollectionFilterArray(item.filters),
		}));

	return collections.length > 0 ? { collections } : {};
};
