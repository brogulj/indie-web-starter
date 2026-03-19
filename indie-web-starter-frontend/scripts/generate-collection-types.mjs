#!/usr/bin/env node

import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DEFAULT_ENDPOINT = 'http://localhost:8788/api/collections';
const endpoint = process.env.COLLECTIONS_API_URL || process.argv[2] || DEFAULT_ENDPOINT;
const outputPath = resolve(process.cwd(), 'src/types/collections.generated.d.ts');
const runtimeOutputPath = resolve(process.cwd(), 'src/types/collection-field-kinds.generated.ts');
const collectionTemplatesDir = resolve(process.cwd(), 'src/templates/collections');
const collectionArchiveTemplatesDir = resolve(process.cwd(), 'src/templates/collections-archive');

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

const getFieldKind = (field = {}) => {
	const fieldType = String(field.type || '').toLowerCase();
	const fieldFormat = String(field.format || '').toLowerCase();
	if (fieldType === 'string' && fieldFormat === 'richtext') return 'richtext';
	if (fieldType === 'string' && fieldFormat === 'media') return 'media';
	if (fieldType === 'string' && fieldFormat === 'date') return 'date';
	return fieldType || 'unknown';
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
		case 'datetime':
		case 'date':
		case 'select':
			return 'string';
		case 'richtext':
			return 'RichText';
		case 'number':
		case 'integer':
			return 'number';
		case 'boolean':
			return 'boolean';
		case 'array':
			if (field.items && typeof field.items === 'object') {
				return `${mapSchemaTypeToTs(field.items)}[]`;
			}
			return 'unknown[]';
		case 'object':
			return 'Record<string, unknown>';
		default:
			return 'unknown';
	}
};

const normalizeCollections = (payload) => {
	if (Array.isArray(payload?.collections)) return payload.collections;
	if (Array.isArray(payload?.data)) return payload.data;
	return [];
};

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
<main class="mx-auto w-full max-w-5xl px-2 py-4">
  <article class="border-4 border-stone-900 bg-amber-50 p-4 shadow-[8px_8px_0_0_#1c1917] sm:p-6">
    <p class="inline-block border-2 border-stone-900 bg-amber-200 px-2 py-1 font-mono text-xs font-bold uppercase tracking-[0.18em]">
      ${collectionName}
    </p>
    <h1 class="mt-3 font-['Courier_New',ui-monospace,monospace] text-3xl font-black uppercase leading-tight text-stone-900 sm:text-5xl">
      {{data.title}}{{^data.title}}{{title}}{{/data.title}}
    </h1>
    <p class="mt-2 font-mono text-xs uppercase tracking-[0.13em] text-stone-700">
      /${collectionName}/{{slug}}
    </p>

    <section class="mt-5 grid gap-3">
      {{#fields}}
      <article class="border-2 border-stone-900 bg-white p-3">
        <p class="mb-2 font-mono text-xs font-bold uppercase tracking-[0.12em] text-stone-700">{{label}}</p>
        {{#isRichText}}
        <div>{{{htmlValue}}}</div>
        {{/isRichText}}
        {{^isRichText}}
        <pre class="whitespace-pre-wrap break-words font-mono text-sm text-stone-800">{{textValue}}</pre>
        {{/isRichText}}
      </article>
      {{/fields}}
    </section>
  </article>
</main>
\`;
`;
};

const buildCollectionArchiveTemplateStub = (collectionName) => {
	const exportName = toArchiveTemplateExportName(collectionName);
	return `export const ${exportName} = /* html */ \`
<main class="mx-auto w-full max-w-5xl px-2 py-4">
  <section class="border-4 border-stone-900 bg-amber-50 p-4 shadow-[8px_8px_0_0_#1c1917] sm:p-6">
    <p class="inline-block border-2 border-stone-900 bg-rose-200 px-2 py-1 font-mono text-xs font-bold uppercase tracking-[0.18em]">
      ${collectionName} archive
    </p>
    <h1 class="mt-3 font-['Courier_New',ui-monospace,monospace] text-3xl font-black uppercase leading-tight text-stone-900 sm:text-5xl">
      {{collection}}
    </h1>
  </section>

  <section class="mt-4 grid gap-3">
    {{#items}}
    <article class="border-2 border-stone-900 bg-white p-4">
      <a href="/{{collection}}/{{slug}}" class="block">
        <h2 class="font-['Courier_New',ui-monospace,monospace] text-xl font-black uppercase text-stone-900">{{title}}</h2>
      </a>
      <p class="mt-2 font-mono text-xs uppercase tracking-[0.13em] text-stone-700">{{status}} · {{updatedAt}}</p>
    </article>
    {{/items}}
  </section>
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
	if (collections.length === 0) {
		throw new Error(
			`No collections found in payload from ${endpoint}. Expected { collections: [...] } or { data: [...] }.`
		);
	}

	const content = buildTypeFile(collections);
	const runtimeContent = buildRuntimeFieldKindsFile(collections);
	await mkdir(dirname(outputPath), { recursive: true });
	await writeFile(outputPath, content, 'utf8');
	await writeFile(runtimeOutputPath, runtimeContent, 'utf8');
	await ensureTemplateStubs(collections);
	console.log(`Generated ${collections.length} collection type(s) at ${outputPath}`);
	console.log(`Generated runtime field kinds at ${runtimeOutputPath}`);
};

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
