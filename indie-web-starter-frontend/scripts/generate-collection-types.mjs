#!/usr/bin/env node

import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DEFAULT_ENDPOINT = 'http://localhost:8788/api/collections';
const endpoint = process.env.COLLECTIONS_API_URL || process.argv[2] || DEFAULT_ENDPOINT;
const outputPath = resolve(process.cwd(), 'src/types/collections.generated.d.ts');
const runtimeOutputPath = resolve(process.cwd(), 'src/types/collection-field-kinds.generated.ts');
const collectionTemplatesDir = resolve(process.cwd(), 'src/templates/collections');
const collectionArchiveTemplatesDir = resolve(process.cwd(), 'src/templates/collections-archive');
const EXCLUDED_COLLECTIONS = new Set(['webmentions', 'trusted-webmention-domains', 'following-sources', 'outbound-webmentions']);

const toPascalCase = (value) =>
	value
		.replace(/[^a-zA-Z0-9]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join('');

const toInterfaceName = (collectionName) => `${toPascalCase(collectionName)}CollectionData`;
const toFieldKindsInterfaceName = (collectionName) => `${toPascalCase(collectionName)}CollectionFieldKinds`;
const toTemplateExportName = (collectionName) => `${toPascalCase(collectionName)}Template`;
const toArchiveTemplateExportName = (collectionName) => `${toPascalCase(collectionName)}ArchiveTemplate`;

const quote = (value) => JSON.stringify(String(value));

const isMultipleMediaField = (field = {}) => {
	const fieldType = String(field.type || '').toLowerCase();
	const fieldFormat = String(field.format || '').toLowerCase();
	return Boolean(field.multiple) && (fieldType === 'media' || (fieldType === 'string' && fieldFormat === 'media'));
};

const getFieldKind = (field = {}) => {
	const fieldType = String(field.type || '').toLowerCase();
	const fieldFormat = String(field.format || '').toLowerCase();
	if (isMultipleMediaField(field)) return 'media-array';
	if (fieldType === 'array' && field.items && typeof field.items === 'object') {
		const itemKind = getFieldKind(field.items);
		if (itemKind === 'media') return 'media-array';
		if (itemKind === 'object') return 'object-array';
	}
	if (fieldType === 'string' && fieldFormat === 'richtext') return 'richtext';
	if (fieldType === 'string' && fieldFormat === 'media') return 'media';
	if (fieldType === 'string' && fieldFormat === 'date') return 'date';
	return fieldType || 'unknown';
};

const mapObjectSchemaToTs = (field = {}) => {
	const properties = field?.properties && typeof field.properties === 'object' ? field.properties : {};
	const requiredFields = new Set(Array.isArray(field.required) ? field.required.map(String) : []);
	const entries = Object.entries(properties);

	if (entries.length === 0) return 'Record<string, unknown>';

	const lines = entries.map(([propertyName, propertySchema]) => {
		const isRequired = requiredFields.has(propertyName) || Boolean(propertySchema?.required);
		const optionalToken = isRequired ? '' : '?';
		const propertyType = mapSchemaTypeToTs(propertySchema);
		return `\t${quote(propertyName)}${optionalToken}: ${propertyType};`;
	});

	return `{\n${lines.join('\n')}\n}`;
};

const mapSchemaTypeToTs = (field = {}) => {
	if (Array.isArray(field.enum) && field.enum.length > 0) {
		return field.enum.map((entry) => quote(entry)).join(' | ');
	}

	const fieldKind = getFieldKind(field);
	switch (fieldKind) {
		case 'string':
		case 'slug':
		case 'textarea':
		case 'media':
		case 'reference':
		case 'datetime':
		case 'date':
		case 'select':
			return 'string';
		case 'media-array':
			return 'string[]';
		case 'richtext':
			return 'RichText';
		case 'number':
		case 'integer':
			return 'number';
		case 'boolean':
			return 'boolean';
		case 'array':
		case 'object-array':
			if (field.items && typeof field.items === 'object') {
				return `${mapSchemaTypeToTs(field.items)}[]`;
			}
			return 'unknown[]';
		case 'object':
			return mapObjectSchemaToTs(field);
		default:
			return 'unknown';
	}
};

const normalizeCollections = (payload) => {
	if (Array.isArray(payload?.collections)) return payload.collections;
	if (Array.isArray(payload?.data)) return payload.data;
	return [];
};

const filterCollectionsForFrontend = (collections) =>
	collections.filter((collection) => {
		const name = String(collection?.name ?? '').trim();
		return !EXCLUDED_COLLECTIONS.has(name);
	});

const buildTypeFile = (collections) => {
	const sortedCollections = [...collections].sort((a, b) => String(a.name).localeCompare(String(b.name)));
	const body = [
		'/* eslint-disable */',
		'// AUTO-GENERATED FILE. DO NOT EDIT.',
		`// Generated from ${endpoint}`,
		'',
		'export type RichText = string & { readonly __fieldType: "richtext" };',
		'',
		'export type CollectionDefinition = {',
		"\tid: string;",
		"\tname: string;",
		"\tdisplay_name?: string;",
		"\tdescription?: string;",
		"\tschema?: {",
		"\t\ttype?: string;",
		"\t\tproperties?: Record<string, unknown>;",
		"\t\trequired?: string[];",
		'\t};',
		'};',
		'',
		`export const COLLECTION_COUNT = ${sortedCollections.length};`,
		'',
	];

	for (const collection of sortedCollections) {
		const schema = collection?.schema && typeof collection.schema === 'object' ? collection.schema : {};
		const properties = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {};
		const schemaRequired = new Set(Array.isArray(schema.required) ? schema.required.map(String) : []);
		const interfaceName = toInterfaceName(collection.name);
		const fieldKindsInterfaceName = toFieldKindsInterfaceName(collection.name);
		const fieldLines = [];
		const fieldKindLines = [];

		for (const [fieldName, fieldSchema] of Object.entries(properties)) {
			const isRequired = schemaRequired.has(fieldName) || Boolean(fieldSchema?.required);
			const optionalToken = isRequired ? '' : '?';
			const fieldType = mapSchemaTypeToTs(fieldSchema);
			const fieldKind = getFieldKind(fieldSchema);
			fieldLines.push(`\t${quote(fieldName)}${optionalToken}: ${fieldType};`);
			fieldKindLines.push(`\t${quote(fieldName)}: ${quote(fieldKind)};`);
		}

		body.push(`export interface ${interfaceName} {`);
		if (fieldLines.length === 0) {
			body.push('\t[key: string]: unknown;');
		} else {
			body.push(...fieldLines);
		}
		body.push('}');
		body.push('');

		body.push(`export interface ${fieldKindsInterfaceName} {`);
		if (fieldKindLines.length === 0) {
			body.push('\t[key: string]: "unknown";');
		} else {
			body.push(...fieldKindLines);
		}
		body.push('}');
		body.push('');
	}

	const collectionNames = sortedCollections.map((collection) => quote(collection.name));
	body.push(`export type CollectionName = ${collectionNames.length > 0 ? collectionNames.join(' | ') : 'never'};`);
	body.push('');
	body.push('export interface CollectionDataMap {');
	for (const collection of sortedCollections) {
		body.push(`\t${quote(collection.name)}: ${toInterfaceName(collection.name)};`);
	}
	body.push('}');
	body.push('');
	body.push('export type CollectionData<K extends CollectionName = CollectionName> = CollectionDataMap[K];');
	body.push('');
	body.push('export interface CollectionFieldKindsMap {');
	for (const collection of sortedCollections) {
		body.push(`\t${quote(collection.name)}: ${toFieldKindsInterfaceName(collection.name)};`);
	}
	body.push('}');
	body.push('');
	body.push(
		'export type CollectionFieldKind<C extends CollectionName, F extends keyof CollectionFieldKindsMap[C]> = CollectionFieldKindsMap[C][F];'
	);
	body.push('');

	return `${body.join('\n')}\n`;
};

const buildRuntimeFieldKindsFile = (collections) => {
	const sortedCollections = [...collections].sort((a, b) => String(a.name).localeCompare(String(b.name)));
	const fieldKindsMap = {};
	const requiredFieldsMap = {};
	const schemaPropertiesMap = {};

	for (const collection of sortedCollections) {
		const schema = collection?.schema && typeof collection.schema === 'object' ? collection.schema : {};
		const properties = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {};
		const schemaRequired = Array.isArray(schema.required) ? schema.required.map(String) : [];
		const fieldKinds = {};
		for (const [fieldName, fieldSchema] of Object.entries(properties)) {
			fieldKinds[fieldName] = getFieldKind(fieldSchema);
		}
		fieldKindsMap[collection.name] = fieldKinds;
		requiredFieldsMap[collection.name] = schemaRequired;
		schemaPropertiesMap[collection.name] = properties;
	}

	const body = [
		'/* eslint-disable */',
		'// AUTO-GENERATED FILE. DO NOT EDIT.',
		`// Generated from ${endpoint}`,
		'',
		'export const collectionFieldKindsMap = ' + JSON.stringify(fieldKindsMap, null, 2) + ' as const;',
		'',
		'export const collectionRequiredFieldsMap = ' + JSON.stringify(requiredFieldsMap, null, 2) + ' as const;',
		'',
		'export const collectionSchemaPropertiesMap = ' + JSON.stringify(schemaPropertiesMap, null, 2) + ' as const;',
		'',
	];

	return `${body.join('\n')}\n`;
};

const fileExists = async (filePath) => {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
};

const buildCollectionTemplateStub = (collectionName) => {
	const exportName = toTemplateExportName(collectionName);
	return `export const ${exportName} = /* html */ \`
<main class="mx-auto max-w-3xl p-4">
  <article class="h-entry space-y-4 rounded border border-gray-300 bg-white p-4">
    <p class="text-xs uppercase tracking-wide text-gray-600">
      ${collectionName}
    </p>
    <h1 class="p-name text-2xl font-semibold text-gray-900">
      {{data.title}}{{^data.title}}{{title}}{{/data.title}}
    </h1>
    <p class="text-sm text-gray-600">
      <a class="u-url hover:underline" href="/${collectionName}/{{slug}}">/${collectionName}/{{slug}}</a>
    </p>
    <p class="h-card text-sm text-gray-600">
      <a class="p-name u-url hover:underline" href="{{siteAuthorUrl}}">{{siteAuthorName}}</a>
    </p>

    <section class="space-y-3">
      {{#fields}}
      <article class="rounded border border-gray-200 bg-gray-50 p-3">
        <h2 class="text-sm font-medium text-gray-800">{{label}}</h2>
        {{#isRichText}}
        <div class="prose prose-sm max-w-none">{{{htmlValue}}}</div>
        {{/isRichText}}
        {{^isRichText}}
        <pre class="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">{{textValue}}</pre>
        {{/isRichText}}
      </article>
      {{/fields}}
    </section>

    <section class="space-y-3 rounded border border-gray-200 bg-gray-50 p-3">
      <h2 class="text-sm font-medium text-gray-800">Interactions</h2>
      <p class="text-sm text-gray-700">
        Likes: {{webmentionCounts.likes}} · Reposts: {{webmentionCounts.reposts}} · Replies: {{webmentionCounts.replies}} · Mentions: {{webmentionCounts.mentions}}
      </p>
      {{#webmentions}}
      {{#isReply}}
      <article class="rounded border border-gray-200 bg-white p-3 text-sm">
        <div class="flex items-center gap-3">
          {{#authorPhoto}}<img src="{{authorPhoto}}" alt="{{displayAuthor}}" class="h-8 w-8 rounded-full object-cover" loading="lazy" referrerpolicy="no-referrer" />{{/authorPhoto}}
          <div>
            <p class="font-medium text-gray-900">{{displayAuthor}}</p>
            <p class="text-xs text-gray-500">{{displayDomain}}</p>
          </div>
        </div>
        <p class="text-gray-600">{{displayDate}}</p>
        {{#contentText}}<p class="mt-1 text-gray-800">{{contentText}}</p>{{/contentText}}
        <a href="{{sourceUrl}}" class="mt-2 inline-block text-gray-700 underline">Source</a>
      </article>
      {{/isReply}}
      {{#isMention}}
      <article class="rounded border border-gray-200 bg-white p-3 text-sm">
        <div class="flex items-center gap-3">
          {{#authorPhoto}}<img src="{{authorPhoto}}" alt="{{displayAuthor}}" class="h-8 w-8 rounded-full object-cover" loading="lazy" referrerpolicy="no-referrer" />{{/authorPhoto}}
          <div>
            <p class="font-medium text-gray-900">{{displayAuthor}}</p>
            <p class="text-xs text-gray-500">{{displayDomain}}</p>
          </div>
        </div>
        <p class="text-gray-600">{{displayDate}}</p>
        {{#contentText}}<p class="mt-1 text-gray-800">{{contentText}}</p>{{/contentText}}
        <a href="{{sourceUrl}}" class="mt-2 inline-block text-gray-700 underline">Source</a>
      </article>
      {{/isMention}}
      {{/webmentions}}
    </section>
  </article>
</main>
\`;
`;
};

const buildCollectionArchiveTemplateStub = (collectionName) => {
	const exportName = toArchiveTemplateExportName(collectionName);
	return `export const ${exportName} = /* html */ \`
<main class="mx-auto max-w-3xl p-4">
  <section class="space-y-2 rounded border border-gray-300 bg-white p-4">
    <p class="text-xs uppercase tracking-wide text-gray-600">
      ${collectionName} archive
    </p>
    <h1 class="text-2xl font-semibold text-gray-900">
      {{collection}}
    </h1>
    <p class="text-sm text-gray-600">
      {{totalItems}} total item(s) · page {{currentPage}} of {{totalPages}}
    </p>
  </section>

  <section class="mt-4 space-y-3">
    {{#items}}
    <article class="rounded border border-gray-200 bg-gray-50 p-3">
      <a href="/{{collection}}/{{slug}}" class="text-gray-900 hover:underline">
        <h2 class="text-lg font-medium">{{title}}</h2>
      </a>
      <p class="mt-1 text-sm text-gray-600">{{status}} · {{updatedAt}}</p>
    </article>
    {{/items}}
  </section>

  <nav class="mt-4 flex items-center justify-between border-t border-gray-200 pt-3 text-sm">
    <div>
      {{#hasPreviousPage}}
      <a href="{{previousPageUrl}}" class="rounded border border-gray-300 bg-white px-3 py-1 text-gray-700 hover:bg-gray-50">Previous</a>
      {{/hasPreviousPage}}
    </div>
    <p class="text-gray-600">Page {{currentPage}} / {{totalPages}}</p>
    <div>
      {{#hasNextPage}}
      <a href="{{nextPageUrl}}" class="rounded border border-gray-300 bg-white px-3 py-1 text-gray-700 hover:bg-gray-50">Next</a>
      {{/hasNextPage}}
    </div>
  </nav>
</main>
\`;
`;
};

const ensureTemplateStubs = async (collections) => {
	await mkdir(collectionTemplatesDir, { recursive: true });
	await mkdir(collectionArchiveTemplatesDir, { recursive: true });

	for (const collection of collections) {
		const collectionFilePath = resolve(collectionTemplatesDir, `${collection.name}.ts`);
		if (!(await fileExists(collectionFilePath))) {
			await writeFile(collectionFilePath, buildCollectionTemplateStub(collection.name), 'utf8');
			console.log(`Created collection template stub: ${collectionFilePath}`);
		}

		const archiveFilePath = resolve(collectionArchiveTemplatesDir, `${collection.name}.ts`);
		if (!(await fileExists(archiveFilePath))) {
			await writeFile(archiveFilePath, buildCollectionArchiveTemplateStub(collection.name), 'utf8');
			console.log(`Created collection archive template stub: ${archiveFilePath}`);
		}
	}
};

const main = async () => {
	const response = await fetch(endpoint);
	if (!response.ok) {
		throw new Error(`Failed to fetch collections from ${endpoint}: ${response.status} ${response.statusText}`);
	}

	const payload = await response.json();
	const collections = normalizeCollections(payload);
	const filteredCollections = filterCollectionsForFrontend(collections);
	if (filteredCollections.length === 0) {
		throw new Error(
			`No collections found in payload from ${endpoint}. Expected { collections: [...] } or { data: [...] }.`
		);
	}

	const content = buildTypeFile(filteredCollections);
	const runtimeContent = buildRuntimeFieldKindsFile(filteredCollections);
	await mkdir(dirname(outputPath), { recursive: true });
	await writeFile(outputPath, content, 'utf8');
	await writeFile(runtimeOutputPath, runtimeContent, 'utf8');
	await ensureTemplateStubs(filteredCollections);
	console.log(`Generated ${filteredCollections.length} collection type(s) at ${outputPath}`);
	console.log(`Generated runtime field kinds at ${runtimeOutputPath}`);
};

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
