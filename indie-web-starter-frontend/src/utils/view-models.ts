import type { SonicCollection, SonicCollectionContentItem } from './sonic';

export type CollectionFieldView = {
	key: string;
	label: string;
	isRichText: boolean;
	textValue: string;
	htmlValue: string;
};

export type CollectionArchiveItemView = {
	collection: string;
	title: string;
	slug: string;
	status: string;
	updatedAt: string;
	excerpt: string;
};

export type CollectionInstructionFieldView = {
	name: string;
	kind: string;
	isRichText: boolean;
	isArray: boolean;
	valueToken: string;
	htmlToken: string;
	arrayLoopExample: string;
	arrayLoopHelp: string;
};

export const toFieldLabel = (key: string): string =>
	key
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ')
		.replace(/^./, (char) => char.toUpperCase());

const stringifyValue = (value: unknown): string => {
	if (value == null) return '-';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	if (Array.isArray(value)) return value.map((entry) => stringifyValue(entry)).join(', ');
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
};

export const buildFieldView = (data: Record<string, unknown>): CollectionFieldView[] => {
	const fields: CollectionFieldView[] = [];

	for (const [key, value] of Object.entries(data)) {
		if (key.endsWith('Html')) continue;

		const htmlKey = `${key}Html`;
		const htmlValue = data[htmlKey];
		const isRichText = typeof htmlValue === 'string';
		fields.push({
			key,
			label: toFieldLabel(key),
			isRichText,
			textValue: stringifyValue(value),
			htmlValue: isRichText ? htmlValue : '',
		});
	}

	return fields;
};

export const buildArchiveItems = (collection: string, items: SonicCollectionContentItem[]): CollectionArchiveItemView[] =>
	items.map((item) => {
		const data = item.data as Record<string, unknown>;
		const excerptValue = data.excerpt;
		return {
			collection,
			title: item.title || item.slug || 'Untitled',
			slug: item.slug,
			status: item.status,
			updatedAt: item.updatedAt,
			excerpt: typeof excerptValue === 'string' ? excerptValue : '',
		};
	});

const isRichTextField = (type?: string, format?: string): boolean => {
	const normalizedType = String(type ?? '').toLowerCase();
	const normalizedFormat = String(format ?? '').toLowerCase();
	return normalizedType === 'richtext' || (normalizedType === 'string' && normalizedFormat === 'richtext');
};

export const buildInstructionFields = (
	properties: NonNullable<NonNullable<SonicCollection['schema']>['properties']>
): CollectionInstructionFieldView[] =>
	Object.entries(properties).map(([name, definition]) => {
		const fieldType = String(definition.type ?? '').toLowerCase();
		const fieldFormat = String(definition.format ?? '').toLowerCase();
		const isArray = fieldType === 'array';
		const itemProperties = definition.items?.properties ?? {};
		const itemKeys = Object.keys(itemProperties);
		const itemExample =
			itemKeys.length > 0 ? itemKeys.map((key) => `&#123;&#123;${key}&#125;&#125;`).join(' · ') : '&#123;&#123;.&#125;&#125;';
		const arrayLoopExample = `&lt;ul&gt;
&#123;&#123;#data.${name}&#125;&#125;
  &lt;li&gt;${itemExample}&lt;/li&gt;
&#123;&#123;/data.${name}&#125;&#125;
&lt;/ul&gt;`;

		return {
			name,
			kind: fieldFormat || fieldType || 'unknown',
			isRichText: isRichTextField(fieldType, fieldFormat),
			isArray,
			valueToken: `&#123;&#123;data.${name}&#125;&#125;`,
			htmlToken: `&#123;&#123;&#123;data.${name}Html&#125;&#125;&#125;`,
			arrayLoopExample,
			arrayLoopHelp:
				itemKeys.length > 0
					? `Inside the loop, each item is an object. Available keys: ${itemKeys.join(', ')}.`
					: 'Inside the loop, use &#123;&#123;.&#125;&#125; to access each primitive item value.',
		};
	});
