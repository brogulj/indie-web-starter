export type WebmentionItem = {
	id: string;
	sourceUrl: string;
	sourceDomain: string;
	mentionType: 'like' | 'reply' | 'repost' | 'mention';
	authorName?: string;
	authorUrl?: string;
	authorPhoto?: string;
	contentHtml?: string;
	contentText?: string;
	publishedAt?: string;
};

export type WebmentionSummary = {
	likes: number;
	reposts: number;
	replies: number;
	mentions: number;
};

export type WebmentionPayload = {
	mentions: WebmentionItem[];
	counts: WebmentionSummary;
};

const REQUEST_TIMEOUT_MS = Number(process.env.SONIC_TIMEOUT_MS ?? '8000');

const buildApiUrl = (path: string, params?: URLSearchParams, options?: BackendRequestOptions): string => {
	const url = new URL(buildBackendUrl(path, options));
	if (params) {
		url.search = params.toString();
	}
	return url.toString();
};

export const getApprovedWebmentions = async (targetUrl: string, options?: BackendRequestOptions): Promise<WebmentionPayload> => {
	const params = new URLSearchParams();
	params.set('target', targetUrl);
	const requestUrl = buildApiUrl('/api/webmentions/mentions', params, options);
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const response = await fetchBackend(requestUrl, { signal: controller.signal }, options);
		if (response.status === 404) {
			return {
				mentions: [],
				counts: { likes: 0, reposts: 0, replies: 0, mentions: 0 },
			};
		}
		if (!response.ok) {
			throw new Error(`Webmention request failed with status ${response.status}`);
		}

		const payload = (await response.json()) as Partial<WebmentionPayload>;
		const mentions = Array.isArray(payload.mentions) ? payload.mentions : [];
		const counts = payload.counts ?? { likes: 0, reposts: 0, replies: 0, mentions: 0 };

		return {
			mentions,
			counts: {
				likes: Number(counts.likes ?? 0),
				reposts: Number(counts.reposts ?? 0),
				replies: Number(counts.replies ?? 0),
				mentions: Number(counts.mentions ?? 0),
			},
		};
	} catch (error) {
		console.error('Failed to load approved webmentions', error);
		return {
			mentions: [],
			counts: { likes: 0, reposts: 0, replies: 0, mentions: 0 },
		};
	} finally {
		clearTimeout(timeoutId);
	}
};
import { buildBackendUrl, fetchBackend, type BackendRequestOptions } from './backend';
