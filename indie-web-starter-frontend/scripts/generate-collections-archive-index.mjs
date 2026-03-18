#!/usr/bin/env node

import { watch } from 'node:fs';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';

const templatesDir = resolve(process.cwd(), 'src/templates/collections-archive');
const outputPath = resolve(templatesDir, 'index.ts');
const excludedFiles = new Set(['index.ts', 'default.ts']);
const watchMode = process.argv.includes('--watch');
const POLL_INTERVAL_MS = 1000;

const sortBySlug = (a, b) => a.slug.localeCompare(b.slug);
const toPascalCase = (value) =>
	value
		.replace(/[^a-zA-Z0-9]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join('');
const hasRequiredDataExport = (fileContents) => /export const requiredData(?:\s*:[^=]+)?\s*=/.test(fileContents);

let lastSignature = '';

const getSignature = async () => {
	const entries = await readdir(templatesDir, { withFileTypes: true });
	const trackedNames = entries
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.filter((name) => name.endsWith('.ts') && !excludedFiles.has(name))
		.sort((a, b) => a.localeCompare(b));

	const trackedWithMeta = await Promise.all(
		trackedNames.map(async (name) => {
			const filePath = resolve(templatesDir, name);
			const stats = await stat(filePath);
			return `${name}:${stats.mtimeMs}:${stats.size}`;
		})
	);

	return trackedWithMeta.join('|');
};

const generateIndex = async () => {
	const entries = await readdir(templatesDir, { withFileTypes: true });
	const templateEntries = [];

	for (const entry of entries) {
		if (!entry.isFile()) continue;
		if (extname(entry.name) !== '.ts') continue;
		if (excludedFiles.has(entry.name)) continue;

		const filePath = resolve(templatesDir, entry.name);
		const fileContents = await readFile(filePath, 'utf8');
		const defaultExportName = `${toPascalCase(basename(entry.name, '.ts'))}ArchiveTemplate`;
		const exportMatch = fileContents.match(/export const ([A-Za-z0-9_]+ArchiveTemplate)\s*=/);
		const exportName = exportMatch?.[1] ?? defaultExportName;

		templateEntries.push({
			slug: basename(entry.name, '.ts'),
			fileBase: basename(entry.name, '.ts'),
			exportName,
			requiredDataExportName: hasRequiredDataExport(fileContents) ? `${toPascalCase(basename(entry.name, '.ts'))}RequiredData` : null,
		});
	}

	templateEntries.sort(sortBySlug);
	const entriesWithRequiredData = templateEntries.filter((entry) => entry.requiredDataExportName);

	const lines = [
		'// AUTO-GENERATED FILE. DO NOT EDIT.',
		'',
		...templateEntries.map((entry) =>
			entry.requiredDataExportName
				? `import { ${entry.exportName}, requiredData as ${entry.requiredDataExportName} } from './${entry.fileBase}';`
				: `import { ${entry.exportName} } from './${entry.fileBase}';`
		),
		'',
		'export const collectionArchiveTemplates: Record<string, string> = {',
		...templateEntries.map((entry) => `\t'${entry.slug}': ${entry.exportName},`),
		'};',
		'',
		'export const collectionArchiveRequiredData: Record<string, unknown> = {',
		...entriesWithRequiredData.map((entry) => `\t'${entry.slug}': ${entry.requiredDataExportName},`),
		'};',
		'',
	];

	await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
	console.log(`Generated collection archive templates index at ${outputPath}`);
};

const startWatch = () => {
	let timeoutId;

	const refreshIfChanged = async () => {
		try {
			const signature = await getSignature();
			if (signature === lastSignature) return;
			await generateIndex();
			lastSignature = signature;
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
		}
	};

	const scheduleGenerate = () => {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => {
			void refreshIfChanged();
		}, 80);
	};

	watch(templatesDir, { persistent: true }, (_eventType, fileName) => {
		if (!fileName) return scheduleGenerate();
		const name = typeof fileName === 'string' ? fileName : fileName.toString();
		if (excludedFiles.has(name)) return;
		if (!name.endsWith('.ts')) return;
		scheduleGenerate();
	});

	setInterval(() => {
		void refreshIfChanged();
	}, POLL_INTERVAL_MS);

	console.log(`Watching collection archive templates in ${templatesDir}`);
};

generateIndex()
	.then(() => getSignature())
	.then((signature) => {
		lastSignature = signature;
		if (watchMode) startWatch();
	})
	.catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
