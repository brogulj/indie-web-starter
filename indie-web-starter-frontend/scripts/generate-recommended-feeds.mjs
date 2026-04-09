#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_OWNER = 'plenaryapp';
const REPO_NAME = 'awesome-rss-feeds';
const REPO_BRANCH = 'master';
const SOURCE_REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'src/services/recommended-feeds.generated.ts');

const toSafeId = (value) =>
	String(value || '')
		.toLowerCase()
		.trim()
		.replace(/\.opml$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '') || 'item';

const normalizeDisplayName = (value) =>
	String(value || '')
		.replace(/\.opml$/i, '')
		.replace(/\s+/g, ' ')
		.trim();

const parseXmlAttributes = (input) => {
	const attributes = {};
	for (const match of String(input || '').matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
		attributes[match[1]] = match[2];
	}
	return attributes;
};

const normalizeUrl = (value) => {
	try {
		const parsed = new URL(String(value || '').trim());
		parsed.hash = '';
		parsed.hostname = parsed.hostname.toLowerCase();
		return parsed.toString();
	} catch {
		return String(value || '').trim();
	}
};

const resolveSiteUrl = (htmlUrl, feedUrl) => {
	if (htmlUrl) return normalizeUrl(htmlUrl);
	try {
		const parsed = new URL(feedUrl);
		return `${parsed.protocol}//${parsed.hostname}/`;
	} catch {
		return feedUrl;
	}
};

const resolveDomain = (siteUrl, feedUrl) => {
	for (const candidate of [siteUrl, feedUrl]) {
		try {
			return new URL(candidate).hostname.toLowerCase();
		} catch {
			continue;
		}
	}
	return '';
};

const parseOpmlFeedEntries = (opml) => {
	const feeds = [];
	const seen = new Set();
	for (const match of String(opml || '').matchAll(/<outline\b([^>]*)\/?>/gi)) {
		const attributes = parseXmlAttributes(match[1] || '');
		const feedUrlRaw = String(attributes.xmlUrl || '').trim();
		if (!feedUrlRaw) continue;
		const feedUrl = normalizeUrl(feedUrlRaw);
		if (!feedUrl || seen.has(feedUrl)) continue;
		seen.add(feedUrl);
		const siteUrl = resolveSiteUrl(String(attributes.htmlUrl || '').trim(), feedUrl);
		const title = String(attributes.title || attributes.text || siteUrl || feedUrl).trim() || 'Untitled feed';
		const domain = resolveDomain(siteUrl, feedUrl);
		feeds.push({
			title,
			feedUrl,
			siteUrl,
			domain,
		});
	}
	return feeds;
};

const fetchJson = async (url) => {
	const response = await fetch(url, {
		headers: {
			accept: 'application/vnd.github+json',
			'user-agent': 'indie-web-starter-feed-generator',
		},
	});
	if (!response.ok) {
		throw new Error(`Failed to fetch JSON ${url} (HTTP ${response.status})`);
	}
	return await response.json();
};

const fetchText = async (url) => {
	const response = await fetch(url, {
		headers: {
			accept: 'text/plain',
			'user-agent': 'indie-web-starter-feed-generator',
		},
	});
	if (!response.ok) {
		throw new Error(`Failed to fetch text ${url} (HTTP ${response.status})`);
	}
	return await response.text();
};

const listOpmlFiles = async (dir) => {
	const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURIComponent(dir)}?ref=${encodeURIComponent(REPO_BRANCH)}`;
	const payload = await fetchJson(url);
	if (!Array.isArray(payload)) {
		throw new Error(`Unexpected directory payload for ${dir}`);
	}
	return payload
		.filter((entry) => entry && entry.type === 'file' && typeof entry.name === 'string' && /\.opml$/i.test(entry.name))
		.map((entry) => ({
			name: entry.name,
			downloadUrl: entry.download_url,
		}))
		.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
};

const fetchGroups = async (kind, dir) => {
	const files = await listOpmlFiles(dir);
	const groups = [];
	for (const file of files) {
		if (!file.downloadUrl) continue;
		const opml = await fetchText(file.downloadUrl);
		const feeds = parseOpmlFeedEntries(opml);
		groups.push({
			id: toSafeId(file.name),
			name: normalizeDisplayName(file.name),
			kind,
			feeds,
		});
	}
	return groups;
};

const generate = async () => {
	const categories = await fetchGroups('category', 'recommended/with_category');
	const countries = await fetchGroups('country', 'countries/with_category');
	const snapshot = {
		metadata: {
			generatedAt: new Date().toISOString(),
			sourceRepoUrl: SOURCE_REPO_URL,
		},
		categories,
		countries,
	};

	const fileContent = `import type { RecommendedFeedsSnapshot } from './recommended-feeds';

export const recommendedFeedsSnapshot: RecommendedFeedsSnapshot = ${JSON.stringify(snapshot, null, 2)};
`;

	await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
	await writeFile(OUTPUT_PATH, fileContent, 'utf8');

	const categoryCount = categories.length;
	const countryCount = countries.length;
	const feedCount = [...categories, ...countries].reduce((sum, group) => sum + group.feeds.length, 0);
	console.log(`Generated recommended feeds snapshot: ${categoryCount} categories, ${countryCount} countries, ${feedCount} feeds.`);
};

generate().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
