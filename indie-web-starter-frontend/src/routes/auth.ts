import type { Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { render } from '../render';
import { resolveBaseCollections } from '../services/required-collections';
import type { AuthUser } from '../utils/auth';
import { AuthApiError, authGetCurrentUser, authLogin } from '../utils/auth';
import { collectionFieldKindsMap, collectionRequiredFieldsMap } from '../types/collection-field-kinds.generated';
import { sonicGetCollectionsCached } from '../utils/sonic';

const AUTH_COOKIE_NAME = 'auth_token';
const API_BASE_URL = process.env.API_URL ?? 'http://localhost:8788';
const REQUEST_TIMEOUT_MS = Number(process.env.SONIC_TIMEOUT_MS ?? '8000');

type ContentStatus = 'draft' | 'published' | 'archived';

type DashboardContentItem = {
	id: string;
	collectionId: string;
	title: string;
	slug: string;
	status: ContentStatus;
	createdAt: string;
	updatedAt: string;
	data: Record<string, unknown>;
};

type ContentEditorViewModel = {
	mode: 'create' | 'edit';
	itemId?: string;
	collectionId: string;
	title: string;
	slug: string;
	status: ContentStatus;
	dataJson: string;
	fieldDefinitions?: EditorFieldDefinition[];
	formError?: string;
	formSuccess?: string;
};

type HtmlStatusCode = 200 | 400 | 404 | 500;

type FieldKind = 'text' | 'number' | 'boolean' | 'richtext' | 'media' | 'json';

type EditorFieldDefinition = {
	name: string;
	label: string;
	kind: FieldKind;
	required: boolean;
	valueText: string;
	valueNumber: string;
	valueJson: string;
	isTrue: boolean;
	isFalse: boolean;
	isText: boolean;
	isNumber: boolean;
	isBoolean: boolean;
	isRichtext: boolean;
	isMedia: boolean;
	isJson: boolean;
	inputId: string;
};

type DashboardCollectionOption = {
	id: string;
	name: string;
	displayName: string;
	schemaProperties?: Record<string, unknown>;
	required?: string[];
};

class ContentApiError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = 'ContentApiError';
		this.status = status;
	}
}

const loginTemplate = /* html */ `
<section class="border border-gray-300 p-4">
  <h1 class="text-2xl font-semibold">Sign In</h1>
  <p class="mt-2 text-sm text-gray-700">Use your account to continue.</p>

  {{#authError}}
  <p class="mt-3 border border-red-300 bg-red-50 p-2 text-sm text-red-700">{{authError}}</p>
  {{/authError}}

  <form method="post" action="/login{{#redirectTarget}}?redirect={{redirectTarget}}{{/redirectTarget}}" class="mt-4 space-y-3">
    <label class="block text-sm">
      <span class="mb-1 block">Email</span>
      <input name="email" type="email" required value="{{email}}" class="w-full border border-gray-300 px-3 py-2" />
    </label>

    <label class="block text-sm">
      <span class="mb-1 block">Password</span>
      <input name="password" type="password" required class="w-full border border-gray-300 px-3 py-2" />
    </label>

    <button type="submit" class="border border-gray-300 bg-gray-100 px-4 py-2 text-sm">Login</button>
  </form>
</section>
`;

const dashboardTemplate = /* html */ `
<section class="border border-gray-300 p-4">
  <h1 class="text-2xl font-semibold">Dashboard</h1>
  <p class="mt-2 text-sm text-gray-700">You are signed in.</p>

  <dl class="mt-4 grid gap-2 sm:grid-cols-2 text-sm">
    <div class="border border-gray-200 p-2"><dt>Email</dt><dd>{{user.email}}</dd></div>
    <div class="border border-gray-200 p-2"><dt>Role</dt><dd>{{user.role}}</dd></div>
    <div class="border border-gray-200 p-2"><dt>Username</dt><dd>{{user.username}}</dd></div>
    <div class="border border-gray-200 p-2"><dt>Name</dt><dd>{{user.firstName}} {{user.lastName}}</dd></div>
  </dl>
</section>

<section class="mt-6 border border-gray-300 p-4">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h2 class="text-xl font-semibold">Content</h2>
    <a class="border border-gray-300 bg-gray-100 px-3 py-1 text-sm" href="/dashboard/content/new">New Content</a>
  </div>

  {{#contentError}}
  <p class="mt-3 border border-red-300 bg-red-50 p-2 text-sm text-red-700">{{contentError}}</p>
  {{/contentError}}

  {{#hasContentItems}}
  <div class="mt-4 overflow-x-auto">
    <table class="min-w-full border border-gray-200 text-sm">
      <thead class="bg-gray-50">
        <tr>
          <th class="border border-gray-200 px-2 py-2 text-left">Title</th>
          <th class="border border-gray-200 px-2 py-2 text-left">Collection</th>
          <th class="border border-gray-200 px-2 py-2 text-left">Status</th>
          <th class="border border-gray-200 px-2 py-2 text-left">Slug</th>
          <th class="border border-gray-200 px-2 py-2 text-left">Updated</th>
          <th class="border border-gray-200 px-2 py-2 text-left">Actions</th>
        </tr>
      </thead>
      <tbody>
        {{#items}}
        <tr>
          <td class="border border-gray-200 px-2 py-2">{{title}}</td>
          <td class="border border-gray-200 px-2 py-2">{{collectionId}}</td>
          <td class="border border-gray-200 px-2 py-2">{{status}}</td>
          <td class="border border-gray-200 px-2 py-2">{{slug}}</td>
          <td class="border border-gray-200 px-2 py-2">{{updatedAt}}</td>
          <td class="border border-gray-200 px-2 py-2">
            <a class="underline" href="/dashboard/content/{{id}}">View / Edit</a>
          </td>
        </tr>
        {{/items}}
      </tbody>
    </table>
  </div>
  {{/hasContentItems}}

  {{^hasContentItems}}
  <p class="mt-3 text-sm text-gray-700">No content found.</p>
  {{/hasContentItems}}
</section>
`;

const contentEditorTemplate = /* html */ `
<section class="border border-gray-300 p-4">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h1 class="text-2xl font-semibold">{{pageTitle}}</h1>
    <a class="underline text-sm" href="/dashboard">Back to dashboard</a>
  </div>
  <p class="mt-2 text-sm text-gray-700">Create, edit, and publish content data.</p>

  {{#formError}}
  <p class="mt-3 border border-red-300 bg-red-50 p-2 text-sm text-red-700">{{formError}}</p>
  {{/formError}}

  {{#formSuccess}}
  <p class="mt-3 border border-green-300 bg-green-50 p-2 text-sm text-green-700">{{formSuccess}}</p>
  {{/formSuccess}}

  {{#isCreateMode}}
  <label class="mt-4 block text-sm">
    <span class="mb-1 block">Collection</span>
    <select
      name="collectionId"
      required
      data-collection-selector
      data-collection-route="/dashboard/content/new"
      class="w-full border border-gray-300 px-3 py-2"
    >
      <option value="">Select collection</option>
      {{#collectionOptions}}
      <option value="{{id}}" {{#isSelected}}selected{{/isSelected}}>{{displayName}} ({{name}})</option>
      {{/collectionOptions}}
    </select>
  </label>
  {{/isCreateMode}}

  <form method="post" action="{{formAction}}" class="mt-4 space-y-3">
    {{#isCreateMode}}
    <input type="hidden" name="collectionId" value="{{collectionId}}" />
    {{/isCreateMode}}

    {{^isCreateMode}}
    <label class="block text-sm">
      <span class="mb-1 block">Collection ID</span>
      <input value="{{collectionId}}" disabled class="w-full border border-gray-300 bg-gray-50 px-3 py-2 text-gray-700" />
    </label>
    <input type="hidden" name="collectionId" value="{{collectionId}}" />
    {{/isCreateMode}}

    <label class="block text-sm">
      <span class="mb-1 block">Title</span>
      <input name="title" required value="{{contentTitle}}" class="w-full border border-gray-300 px-3 py-2" />
    </label>

    <label class="block text-sm">
      <span class="mb-1 block">Slug</span>
      <input name="slug" required value="{{slug}}" class="w-full border border-gray-300 px-3 py-2" />
    </label>

    <label class="block text-sm">
      <span class="mb-1 block">Status</span>
      <select name="status" required class="w-full border border-gray-300 px-3 py-2">
        {{#statusOptions}}
        <option value="{{value}}" {{#isSelected}}selected{{/isSelected}}>{{value}}</option>
        {{/statusOptions}}
      </select>
    </label>

    {{#hasEditorFields}}
    <section class="space-y-4 border border-gray-200 p-3">
      <h2 class="text-base font-semibold">Fields</h2>
      {{#fieldDefinitions}}
      <div class="space-y-2">
        <label class="block text-sm">
          <span class="mb-1 block">{{label}}{{#required}} *{{/required}}</span>
          <input type="hidden" name="fieldType:{{name}}" value="{{kind}}" />
          {{#isText}}
          <input name="field:{{name}}" value="{{valueText}}" class="w-full border border-gray-300 px-3 py-2" />
          {{/isText}}
          {{#isNumber}}
          <input type="number" name="field:{{name}}" value="{{valueNumber}}" class="w-full border border-gray-300 px-3 py-2" />
          {{/isNumber}}
          {{#isBoolean}}
          <select name="field:{{name}}" class="w-full border border-gray-300 px-3 py-2">
            <option value="true" {{#isTrue}}selected{{/isTrue}}>true</option>
            <option value="false" {{#isFalse}}selected{{/isFalse}}>false</option>
          </select>
          {{/isBoolean}}
          {{#isJson}}
          <textarea name="field:{{name}}" rows="6" class="w-full border border-gray-300 px-3 py-2 font-mono text-sm">{{valueJson}}</textarea>
          {{/isJson}}
          {{#isMedia}}
          <div class="space-y-2">
            <input id="{{inputId}}" name="field:{{name}}" value="{{valueText}}" class="w-full border border-gray-300 px-3 py-2" placeholder="https://..." />
            <div class="flex flex-wrap items-center gap-2">
              <input type="file" data-media-file data-target="{{inputId}}" class="text-sm" />
              <button
                type="button"
                class="border border-gray-300 bg-gray-100 px-3 py-1 text-sm"
                data-media-upload-button
                data-target="{{inputId}}"
                data-folder="{{collectionFolder}}"
              >
                Upload
              </button>
              <span class="text-xs text-gray-600" data-media-status data-target="{{inputId}}"></span>
            </div>
          </div>
          {{/isMedia}}
          {{#isRichtext}}
          <div class="space-y-2">
            <textarea
              id="{{inputId}}"
              name="field:{{name}}"
              rows="12"
              class="w-full border border-gray-300 px-3 py-2 font-mono text-sm"
              data-richtext-field
            >{{valueText}}</textarea>
          </div>
          {{/isRichtext}}
        </label>
      </div>
      {{/fieldDefinitions}}
    </section>
    {{/hasEditorFields}}

    {{^hasEditorFields}}
    <label class="block text-sm">
      <span class="mb-1 block">Data (JSON)</span>
      <textarea name="dataJson" rows="12" class="w-full border border-gray-300 px-3 py-2 font-mono text-sm">{{dataJson}}</textarea>
    </label>
    {{/hasEditorFields}}

    <button type="submit" class="border border-gray-300 bg-gray-100 px-4 py-2 text-sm">{{submitLabel}}</button>
  </form>
</section>

<style>
  .EasyMDEContainer .editor-toolbar {
    border: 1px solid #d1d5db;
    background: #f9fafb;
  }

  .EasyMDEContainer .editor-toolbar button {
    color: #111827 !important;
    border: 1px solid transparent;
  }

  .EasyMDEContainer .editor-toolbar button:hover,
  .EasyMDEContainer .editor-toolbar button.active {
    background: #e5e7eb !important;
    border-color: #d1d5db !important;
  }

  .EasyMDEContainer .editor-toolbar i.separator {
    border-left-color: #d1d5db !important;
    border-right-color: #d1d5db !important;
  }

  .EasyMDEContainer .CodeMirror {
    border: 1px solid #d1d5db;
    border-top: 0;
  }
</style>

<script>
(() => {
  const ensureEasyMdeLoaded = () => {
    const cssId = 'easy-mde-css';
    const scriptId = 'easy-mde-js';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/easymde/dist/easymde.min.css';
      document.head.appendChild(link);
    }
    if (window.EasyMDE) return Promise.resolve(window.EasyMDE);
    if (document.getElementById(scriptId)) {
      return new Promise((resolve, reject) => {
        const existing = document.getElementById(scriptId);
        existing.addEventListener('load', () => resolve(window.EasyMDE));
        existing.addEventListener('error', reject);
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://cdn.jsdelivr.net/npm/easymde/dist/easymde.min.js';
      script.async = true;
      script.onload = () => resolve(window.EasyMDE);
      script.onerror = reject;
      document.body.appendChild(script);
    });
  };

  const selector = document.querySelector('[data-collection-selector]');
  if (selector instanceof HTMLSelectElement) {
    selector.addEventListener('change', () => {
      const selected = selector.value.trim();
      const route = selector.dataset.collectionRoute || '/dashboard/content/new';
      window.location.assign(selected ? route + '?collectionId=' + encodeURIComponent(selected) : route);
    });
  }

  const richtextAreas = Array.from(document.querySelectorAll('[data-richtext-field]')).filter((item) => item instanceof HTMLTextAreaElement);
  if (richtextAreas.length > 0) {
    ensureEasyMdeLoaded()
      .then((EasyMDE) => {
        if (!EasyMDE) return;
        const instances = richtextAreas.map((textarea) => new EasyMDE({
          element: textarea,
          autoDownloadFontAwesome: true,
          spellChecker: false,
          forceSync: true,
          status: false,
          minHeight: '240px',
          previewRender: (plainText) => {
            try {
              return EasyMDE.prototype.markdown(plainText);
            } catch {
              return plainText;
            }
          }
        }));
        const form = document.querySelector('form[action]');
        if (form instanceof HTMLFormElement) {
          form.addEventListener('submit', () => {
            instances.forEach((instance) => instance.codemirror.save());
          });
        }
      })
      .catch(() => {
        // Fallback keeps plain textarea behavior if CDN fails.
      });
  }

  document.querySelectorAll('[data-media-upload-button]').forEach((button) => {
    button.addEventListener('click', async () => {
      const targetId = button.getAttribute('data-target') || '';
      const folder = button.getAttribute('data-folder') || 'uploads';
      const target = document.getElementById(targetId);
      const fileInput = document.querySelector('[data-media-file][data-target="' + targetId + '"]');
      const status = document.querySelector('[data-media-status][data-target="' + targetId + '"]');
      if (!(target instanceof HTMLInputElement) || !(fileInput instanceof HTMLInputElement) || !fileInput.files || fileInput.files.length === 0) {
        if (status instanceof HTMLElement) status.textContent = 'Select a file first.';
        return;
      }

      const body = new FormData();
      body.set('file', fileInput.files[0]);
      body.set('folder', folder);

      if (status instanceof HTMLElement) status.textContent = 'Uploading...';
      try {
        const response = await fetch('/dashboard/media/upload', {
          method: 'POST',
          credentials: 'same-origin',
          body
        });
        const payload = await response.json().catch(() => ({}));
        const fileObject = payload && typeof payload === 'object' ? payload.file : null;
        const uploadedValue =
          fileObject && typeof fileObject === 'object'
            ? (typeof fileObject.apiUrl === 'string' ? fileObject.apiUrl : (typeof fileObject.publicUrl === 'string' ? fileObject.publicUrl : ''))
            : '';
        if (!response.ok || !uploadedValue) {
          throw new Error(typeof payload.error === 'string' ? payload.error : 'Upload failed');
        }
        target.value = uploadedValue;
        if (status instanceof HTMLElement) status.textContent = 'Uploaded.';
      } catch (error) {
        if (status instanceof HTMLElement) status.textContent = error instanceof Error ? error.message : 'Upload failed.';
      }
    });
  });
})();
</script>
`;

const isSafeRedirectPath = (value: string | undefined): value is string => {
	if (!value) return false;
	if (!value.startsWith('/')) return false;
	return !value.startsWith('//');
};

const getRedirectTarget = (c: Context): string | undefined => {
	const redirectTarget = c.req.query('redirect');
	return isSafeRedirectPath(redirectTarget) ? redirectTarget : undefined;
};

const getToken = (c: Context): string | undefined => {
	return getCookie(c, AUTH_COOKIE_NAME);
};

const shouldUseSecureCookie = (url: string): boolean => {
	try {
		const parsed = new URL(url);
		if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
			return false;
		}
		return parsed.protocol === 'https:';
	} catch {
		return false;
	}
};

const setTokenCookie = (c: Context, token: string): void => {
	setCookie(c, AUTH_COOKIE_NAME, token, {
		httpOnly: true,
		secure: shouldUseSecureCookie(c.req.url),
		sameSite: 'Lax',
		path: '/',
		maxAge: 60 * 60 * 24,
	});
};

const clearTokenCookie = (c: Context): void => {
	deleteCookie(c, AUTH_COOKIE_NAME, {
		path: '/',
	});
};

const buildApiUrl = (path: string, query?: URLSearchParams): string => {
	const url = new URL(path, API_BASE_URL);
	if (query) {
		url.search = query.toString();
	}
	return url.toString();
};

const asObject = (value: unknown): Record<string, unknown> | null => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
};

const parseContentStatus = (value: string): ContentStatus => {
	if (value === 'published' || value === 'archived') return value;
	return 'draft';
};

const toIsoDate = (value: unknown): string => {
	if (typeof value === 'string' && value.length > 0) return value;
	if (typeof value === 'number' && Number.isFinite(value)) {
		const epochMs = value < 1_000_000_000_000 ? value * 1000 : value;
		const date = new Date(epochMs);
		return Number.isNaN(date.getTime()) ? '' : date.toISOString();
	}
	return '';
};

const toContentItem = (value: unknown): DashboardContentItem | null => {
	const obj = asObject(value);
	if (!obj) return null;
	const id = typeof obj.id === 'string' ? obj.id : '';
	if (!id) return null;
	return {
		id,
		collectionId: typeof obj.collectionId === 'string' ? obj.collectionId : '',
		title: typeof obj.title === 'string' ? obj.title : '',
		slug: typeof obj.slug === 'string' ? obj.slug : '',
		status: parseContentStatus(typeof obj.status === 'string' ? obj.status : 'draft'),
		createdAt: toIsoDate(obj.createdAt ?? obj.created_at),
		updatedAt: toIsoDate(obj.updatedAt ?? obj.updated_at),
		data: asObject(obj.data) ?? {},
	};
};

const parseContentListResponse = (payload: unknown): DashboardContentItem[] => {
	const obj = asObject(payload);
	if (!obj) return [];
	const rawData = obj.data;
	if (!Array.isArray(rawData)) return [];
	return rawData.map((item) => toContentItem(item)).filter((item): item is DashboardContentItem => Boolean(item));
};

const parseContentItemResponse = (payload: unknown): DashboardContentItem | null => {
	const obj = asObject(payload);
	if (!obj) return null;
	if ('data' in obj) {
		const nested = asObject(obj.data);
		if (nested && typeof nested.id === 'string') {
			return toContentItem(nested);
		}
	}
	if (typeof obj.id === 'string') {
		return toContentItem(obj);
	}
	return null;
};

const fetchApiJson = async <T>(path: string, init: RequestInit = {}, token?: string): Promise<T> => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const headers = new Headers(init.headers);
		if (!headers.has('content-type') && init.body && typeof init.body === 'string') {
			headers.set('content-type', 'application/json');
		}
		if (token) {
			headers.set('authorization', `Bearer ${token}`);
		}

		const response = await fetch(buildApiUrl(path), {
			...init,
			headers,
			signal: controller.signal,
		});

		if (!response.ok) {
			let message = 'Content request failed';
			try {
				const errorBody = (await response.json()) as { error?: string; message?: string };
				message = errorBody.error ?? errorBody.message ?? message;
			} catch {
				// ignore JSON parse errors for error responses
			}
			throw new ContentApiError(message, response.status);
		}

		return (await response.json()) as T;
	} catch (error) {
		if (error instanceof ContentApiError) throw error;
		if (error instanceof Error && error.name === 'AbortError') {
			throw new ContentApiError(`Content request timed out after ${REQUEST_TIMEOUT_MS}ms`, 504);
		}
		throw new ContentApiError('Content request failed due to a network error', 502);
	} finally {
		clearTimeout(timeoutId);
	}
};

const parseApiResponseBody = async (response: Response): Promise<Record<string, unknown>> => {
	try {
		return (await response.json()) as Record<string, unknown>;
	} catch {
		const text = await response.text().catch(() => '');
		return text ? { error: text } : {};
	}
};

const toAlternateLocalApiBaseUrl = (): string | null => {
	try {
		const current = new URL(API_BASE_URL);
		if (current.hostname !== 'localhost' && current.hostname !== '127.0.0.1') return null;
		if (current.port === '8787') return null;
		current.port = '8787';
		return current.toString();
	} catch {
		return null;
	}
};

const uploadMediaViaApi = async (args: {
	token: string;
	file: File;
	folder: string;
	baseUrl: string;
	useMultipleEndpoint?: boolean;
}): Promise<{ response: Response; payload: Record<string, unknown> }> => {
	const uploadFormData = new FormData();
	if (args.useMultipleEndpoint) {
		uploadFormData.append('files', args.file, args.file.name);
	} else {
		uploadFormData.append('file', args.file, args.file.name);
	}
	if (args.folder) {
		uploadFormData.append('folder', args.folder);
	}

	const endpointPath = args.useMultipleEndpoint ? '/api/media/upload-multiple' : '/api/media/upload';
	const response = await fetch(new URL(endpointPath, args.baseUrl).toString(), {
		method: 'POST',
		headers: {
			authorization: `Bearer ${args.token}`,
		},
		body: uploadFormData,
	});
	const payload = await parseApiResponseBody(response);
	return { response, payload };
};

const buildMediaApiUrl = (baseUrl: string, mediaId: string): string => {
	return new URL(`/api/media/${mediaId}`, baseUrl).toString();
};

const buildMediaFileUrl = (baseUrl: string, r2Key: string): string => {
	return new URL(`/files/${r2Key.replace(/^\/+/, '')}`, baseUrl).toString();
};

const normalizeMediaUploadPayload = (payload: Record<string, unknown>, baseUrl: string): Record<string, unknown> => {
	const nextPayload: Record<string, unknown> = { ...payload };

	const file = payload.file;
	if (file && typeof file === 'object' && !Array.isArray(file)) {
		const fileObj = { ...(file as Record<string, unknown>) };
		if (typeof fileObj.r2_key === 'string' && fileObj.r2_key.length > 0) {
			fileObj.apiUrl = buildMediaFileUrl(baseUrl, fileObj.r2_key);
		}
		if (typeof fileObj.id === 'string') {
			fileObj.apiMetaUrl = buildMediaApiUrl(baseUrl, fileObj.id);
		}
		nextPayload.file = fileObj;
	}

	const uploaded = payload.uploaded;
	if (Array.isArray(uploaded)) {
		nextPayload.uploaded = uploaded.map((entry) => {
			if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
			const fileObj = { ...(entry as Record<string, unknown>) };
			if (typeof fileObj.r2_key === 'string' && fileObj.r2_key.length > 0) {
				fileObj.apiUrl = buildMediaFileUrl(baseUrl, fileObj.r2_key);
			}
			if (typeof fileObj.id === 'string') {
				fileObj.apiMetaUrl = buildMediaApiUrl(baseUrl, fileObj.id);
			}
			return fileObj;
		});
	}

	return nextPayload;
};

const loadDashboardContent = async (): Promise<DashboardContentItem[]> => {
	const params = new URLSearchParams();
	params.set('limit', '50');
	params.set('sort', '-updatedAt');
	const payload = await fetchApiJson<unknown>(`/api/content?${params.toString()}`, { method: 'GET' });
	return parseContentListResponse(payload);
};

const loadContentById = async (id: string): Promise<DashboardContentItem | null> => {
	const payload = await fetchApiJson<unknown>(`/api/content/${id}`, { method: 'GET' });
	return parseContentItemResponse(payload);
};

const loadCollectionOptions = async (): Promise<DashboardCollectionOption[]> => {
	const collections = await sonicGetCollectionsCached();
	return collections.map((collection) => ({
		id: collection.id,
		name: collection.name,
		displayName: collection.display_name || collection.name,
		schemaProperties: collection.schema?.properties,
		required: Array.isArray(collection.schema?.required) ? collection.schema?.required : [],
	}));
};

const resolveSelectedCollection = (
	collectionOptions: DashboardCollectionOption[],
	collectionId: string
): DashboardCollectionOption | undefined => {
	return collectionOptions.find((option) => option.id === collectionId || option.name === collectionId);
};

const toFieldLabel = (value: string): string => {
	return value
		.replace(/[_-]+/g, ' ')
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/\b\w/g, (char) => char.toUpperCase());
};

const getFieldKind = (field: unknown): FieldKind => {
	const toNormalized = (value: unknown): string => String(value ?? '').toLowerCase().trim();
	const normalizedCandidates: string[] = [];
	if (typeof field === 'string') {
		normalizedCandidates.push(toNormalized(field));
	} else if (field && typeof field === 'object' && !Array.isArray(field)) {
		const fieldObj = field as Record<string, unknown>;
		normalizedCandidates.push(
			toNormalized(fieldObj.type),
			toNormalized(fieldObj.format),
			toNormalized(fieldObj.field_type),
			toNormalized(fieldObj.fieldType),
			toNormalized(fieldObj.widget),
			toNormalized(fieldObj.input),
		);
	}

	if (normalizedCandidates.some((value) => value === 'richtext' || value === 'markdown' || value === 'md')) return 'richtext';
	if (normalizedCandidates.some((value) => value === 'media' || value === 'image' || value === 'file' || value === 'upload')) return 'media';
	if (normalizedCandidates.some((value) => value === 'boolean' || value === 'bool')) return 'boolean';
	if (normalizedCandidates.some((value) => value === 'number' || value === 'integer' || value === 'int' || value === 'float' || value === 'double')) return 'number';
	if (normalizedCandidates.some((value) => value === 'object' || value === 'array' || value === 'json')) return 'json';
	return 'text';
};

const toFieldDefinition = (
	name: string,
	field: unknown,
	required: boolean,
	value: unknown
): EditorFieldDefinition => {
	const kind = getFieldKind(field);
	const inputId = `field-${name.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
	const fallbackText = value == null ? '' : String(value);
	const jsonValue = kind === 'json' ? (value == null ? '' : JSON.stringify(value, null, 2)) : '';
	const boolValue = typeof value === 'boolean' ? value : String(value ?? '').toLowerCase() === 'true';
	return {
		name,
		label: toFieldLabel(name),
		kind,
		required,
		valueText: kind === 'json' ? '' : fallbackText,
		valueNumber: kind === 'number' && typeof value === 'number' ? String(value) : '',
		valueJson: jsonValue,
		isTrue: boolValue,
		isFalse: !boolValue,
		isText: kind === 'text',
		isNumber: kind === 'number',
		isBoolean: kind === 'boolean',
		isRichtext: kind === 'richtext',
		isMedia: kind === 'media',
		isJson: kind === 'json',
		inputId,
	};
};

const buildFieldDefinitions = (
	collection: DashboardCollectionOption | undefined,
	dataObject: Record<string, unknown>
): EditorFieldDefinition[] => {
	if (!collection) return [];

	const generatedKinds = (collectionFieldKindsMap as Record<string, Record<string, string> | undefined>)[collection.name];
	const generatedRequired = (collectionRequiredFieldsMap as Record<string, readonly string[] | undefined>)[collection.name] ?? [];
	if (generatedKinds && Object.keys(generatedKinds).length > 0) {
		const required = new Set(generatedRequired);
		return Object.entries(generatedKinds).map(([name, fieldKind]) =>
			toFieldDefinition(name, fieldKind, required.has(name), dataObject[name])
		);
	}

	if (!collection.schemaProperties) return [];
	const required = new Set(collection.required ?? []);
	return Object.entries(collection.schemaProperties).map(([name, field]) =>
		toFieldDefinition(name, field, required.has(name), dataObject[name])
	);
};

const parseDataFromForm = (formData: FormData): { data: Record<string, unknown>; error?: string } => {
	const fieldEntries = Array.from(formData.entries()).filter(([key]) => key.startsWith('field:'));
	if (fieldEntries.length > 0) {
		const data: Record<string, unknown> = {};
		for (const [rawKey, rawValue] of fieldEntries) {
			const fieldName = rawKey.slice('field:'.length);
			if (!fieldName || rawValue instanceof File) continue;
			const value = String(rawValue);
			const type = String(formData.get(`fieldType:${fieldName}`) ?? 'text');
			if (type === 'boolean') {
				data[fieldName] = value === 'true';
				continue;
			}
			if (type === 'number') {
				if (value.trim() === '') {
					data[fieldName] = null;
				} else {
					const numberValue = Number(value);
					data[fieldName] = Number.isNaN(numberValue) ? value : numberValue;
				}
				continue;
			}
			if (type === 'json') {
				if (value.trim() === '') {
					data[fieldName] = null;
				} else {
					try {
						data[fieldName] = JSON.parse(value);
					} catch {
						return { data, error: `Field "${toFieldLabel(fieldName)}" must be valid JSON.` };
					}
				}
				continue;
			}
			data[fieldName] = value;
		}
		return { data };
	}

	const dataJson = String(formData.get('dataJson') ?? '').trim();
	if (!dataJson) return { data: {} };
	try {
		const parsed = JSON.parse(dataJson);
		return { data: asObject(parsed) ?? {} };
	} catch {
		return { data: {}, error: 'Data must be valid JSON.' };
	}
};

const toEditorViewModel = (item?: DashboardContentItem): ContentEditorViewModel => {
	if (!item) {
		return {
			mode: 'create',
			collectionId: '',
			title: '',
			slug: '',
			status: 'draft',
			dataJson: '{\n  "title": "",\n  "content": ""\n}',
		};
	}
	return {
		mode: 'edit',
		itemId: item.id,
		collectionId: item.collectionId,
		title: item.title,
		slug: item.slug,
		status: item.status,
		dataJson: JSON.stringify(item.data, null, 2),
	};
};

const renderContentEditor = async (
	c: Context,
	user: AuthUser,
	model: ContentEditorViewModel,
	status: HtmlStatusCode = 200
): Promise<Response> => {
	const [baseCollections, collectionOptions] = await Promise.all([resolveBaseCollections(), loadCollectionOptions()]);
	const selectedCollection = resolveSelectedCollection(collectionOptions, model.collectionId);
	const dataObject = asObject((() => {
		try {
			return JSON.parse(model.dataJson);
		} catch {
			return {};
		}
	})()) ?? {};
	const fieldDefinitions = model.fieldDefinitions ?? buildFieldDefinitions(selectedCollection, dataObject);

	const selectedCollectionId = model.collectionId;
	const view = {
		title: model.mode === 'create' ? 'Create Content' : 'Edit Content',
		pageTitle: model.mode === 'create' ? 'Create Content' : `Edit Content ${model.itemId}`,
		formAction: model.mode === 'create' ? '/dashboard/content' : `/dashboard/content/${model.itemId}`,
		submitLabel: model.mode === 'create' ? 'Create Content' : 'Save Changes',
		isCreateMode: model.mode === 'create',
		collectionId: model.collectionId,
		contentTitle: model.title,
		slug: model.slug,
		status: model.status,
		dataJson: model.dataJson,
		fieldDefinitions,
		hasEditorFields: fieldDefinitions.length > 0,
		collectionFolder: selectedCollection?.name ?? 'uploads',
		formError: model.formError,
		formSuccess: model.formSuccess,
		collectionOptions: collectionOptions.map((option) => ({
			...option,
			isSelected: option.id === selectedCollectionId || option.name === selectedCollectionId,
		})),
		statusOptions: (['draft', 'published', 'archived'] as const).map((value) => ({
			value,
			isSelected: value === model.status,
		})),
		isAuthenticated: true,
		authUser: user,
		user,
		collections: baseCollections,
	};
	return c.html(render(contentEditorTemplate, view), status);
};

export type AuthViewData = {
	isAuthenticated: boolean;
	authUser?: AuthUser;
};

export const resolveAuthState = async (c: Context): Promise<AuthViewData> => {
	const cachedState = c.get('isAuthenticated');
	const cachedUser = c.get('authUser');
	if (cachedState && cachedUser) {
		return { isAuthenticated: true, authUser: cachedUser };
	}

	const token = getToken(c);
	if (!token) {
		c.set('isAuthenticated', false);
		return { isAuthenticated: false };
	}

	try {
		const user = await authGetCurrentUser(token);
		c.set('authUser', user);
		c.set('isAuthenticated', true);
		return { isAuthenticated: true, authUser: user };
	} catch (error) {
		if (error instanceof AuthApiError && (error.status === 401 || error.status === 403)) {
			clearTokenCookie(c);
		}
		c.set('isAuthenticated', false);
		return { isAuthenticated: false };
	}
};

export const requireAuth = async (c: Context, next: () => Promise<void>): Promise<Response | void> => {
	const authState = await resolveAuthState(c);
	if (!authState.isAuthenticated) {
		const currentPath = c.req.path;
		return c.redirect(`/login?redirect=${encodeURIComponent(currentPath)}`);
	}
	await next();
};

export const registerAuthRoutes = (app: Hono): void => {
	app.get('/login', async (c) => {
		const authState = await resolveAuthState(c);
		if (authState.isAuthenticated) {
			const redirectTarget = getRedirectTarget(c) ?? '/dashboard';
			return c.redirect(redirectTarget);
		}

		const errorFromQuery = c.req.query('error');
		const redirectTarget = getRedirectTarget(c);
		const baseCollections = await resolveBaseCollections();
		return c.html(
			render(loginTemplate, {
				title: 'Login',
				authError: errorFromQuery,
				redirectTarget,
				email: '',
				collections: baseCollections,
			}),
		);
	});

	app.post('/login', async (c) => {
		const redirectTarget = getRedirectTarget(c) ?? '/dashboard';
		const formData = await c.req.formData();
		const email = String(formData.get('email') ?? '').trim();
		const password = String(formData.get('password') ?? '');

		if (!email || !password) {
			const baseCollections = await resolveBaseCollections();
			return c.html(
				render(loginTemplate, {
					title: 'Login',
					authError: 'Email and password are required.',
					redirectTarget,
					email,
					collections: baseCollections,
				}),
				400,
			);
		}

		try {
			const { token } = await authLogin(email, password);
			setTokenCookie(c, token);
			return c.redirect(redirectTarget);
		} catch (error) {
			const authError = error instanceof AuthApiError ? error.message : 'Login failed';
			const baseCollections = await resolveBaseCollections();
			return c.html(
				render(loginTemplate, {
					title: 'Login',
					authError,
					redirectTarget,
					email,
					collections: baseCollections,
				}),
				401,
			);
		}
	});

	app.get('/logout', (c) => {
		clearTokenCookie(c);
		return c.redirect('/login');
	});

	app.post('/logout', (c) => {
		clearTokenCookie(c);
		return c.redirect('/login');
	});

	app.get('/dashboard', requireAuth, (c) => {
		const user = c.get('authUser') as AuthUser;
		return Promise.all([resolveBaseCollections(), loadDashboardContent().catch(() => [])]).then(([baseCollections, items]) =>
			c.html(
				render(dashboardTemplate, {
					title: 'Dashboard',
					isAuthenticated: true,
					authUser: user,
					user,
					items,
					hasContentItems: items.length > 0,
					contentError: undefined,
					collections: baseCollections,
				}),
			)
		);
	});

	app.get('/dashboard/content/new', requireAuth, async (c) => {
		const user = c.get('authUser') as AuthUser;
		const model = toEditorViewModel();
		model.collectionId = String(c.req.query('collectionId') ?? '').trim();
		return renderContentEditor(c, user, model);
	});

	app.post('/dashboard/media/upload', async (c) => {
		const token = getToken(c);
		if (!token) {
			return c.json({ error: 'Unauthorized' }, 401);
		}

		const formData = await c.req.formData();
		const fileValue = formData.get('file') ?? formData.get('files');
		const file = fileValue instanceof File ? fileValue : null;
		const folder = String(formData.get('folder') ?? 'uploads').trim() || 'uploads';
		if (!file) {
			return c.json({ error: 'No file provided' }, 400);
		}

		const baseCandidates = [API_BASE_URL];
		const alternateLocal = toAlternateLocalApiBaseUrl();
		if (alternateLocal) baseCandidates.push(alternateLocal);

		let lastPayload: Record<string, unknown> = { error: 'Media upload failed' };
		let lastStatus: number = 500;

		for (const baseUrl of baseCandidates) {
			try {
				const single = await uploadMediaViaApi({ token, file, folder, baseUrl });
				if (single.response.ok) {
					return c.json(normalizeMediaUploadPayload(single.payload, baseUrl), 200);
				}
				lastPayload = single.payload;
				lastStatus = single.response.status;

				if (single.response.status === 404 || single.response.status === 405) {
					const multiple = await uploadMediaViaApi({ token, file, folder, baseUrl, useMultipleEndpoint: true });
					if (multiple.response.ok) {
						const normalizedMultiple = normalizeMediaUploadPayload(multiple.payload, baseUrl);
						const uploadedFiles = Array.isArray(normalizedMultiple.uploaded) ? normalizedMultiple.uploaded : [];
						const files = Array.isArray(normalizedMultiple.files) ? normalizedMultiple.files : uploadedFiles;
						const first = (files[0] && typeof files[0] === 'object' ? files[0] : null) as Record<string, unknown> | null;
						return c.json(first ? { ...normalizedMultiple, success: true, file: first, files } : normalizedMultiple, 200);
					}
					lastPayload = multiple.payload;
					lastStatus = multiple.response.status;
				}
			} catch {
				lastPayload = { error: `Upload request failed for ${baseUrl}` };
				lastStatus = 502;
			}
		}

		const errorMessage =
			typeof lastPayload.error === 'string' ? lastPayload.error : 'Media upload failed';
		return c.json(
			{
				error: errorMessage,
				details: lastPayload.details,
			},
			lastStatus as 400 | 401 | 403 | 404 | 405 | 413 | 500 | 502,
		);
	});

	app.post('/dashboard/content', requireAuth, async (c) => {
		const user = c.get('authUser') as AuthUser;
		const token = getToken(c);
		if (!token) {
			return c.redirect('/login?redirect=%2Fdashboard%2Fcontent%2Fnew');
		}

		const formData = await c.req.formData();
		const collectionId = String(formData.get('collectionId') ?? '').trim();
		const title = String(formData.get('title') ?? '').trim();
		const slug = String(formData.get('slug') ?? '').trim();
		const status = parseContentStatus(String(formData.get('status') ?? 'draft'));
		const dataJson = String(formData.get('dataJson') ?? '').trim();

		const model: ContentEditorViewModel = {
			mode: 'create',
			collectionId,
			title,
			slug,
			status,
			dataJson,
		};

		if (!collectionId || !title || !slug) {
			return renderContentEditor(c, user, {
				...model,
				formError: 'Collection, title, and slug are required.',
			}, 400);
		}

		const parsedData = parseDataFromForm(formData);
		const modelWithParsedData: ContentEditorViewModel = {
			...model,
			dataJson: JSON.stringify(parsedData.data, null, 2),
		};
		if (parsedData.error) {
			return renderContentEditor(c, user, {
				...modelWithParsedData,
				formError: parsedData.error,
			}, 400);
		}
		const data = parsedData.data;

		try {
			const createdPayload = await fetchApiJson<unknown>(
				'/api/content',
				{
					method: 'POST',
					body: JSON.stringify({
						collectionId,
						title,
						slug,
						status,
						data,
					}),
				},
				token
			);
			const created = parseContentItemResponse(createdPayload);
			if (created?.id) {
				return c.redirect(`/dashboard/content/${created.id}?saved=1`);
			}
			return c.redirect('/dashboard?saved=1');
		} catch (error) {
			const message = error instanceof ContentApiError ? error.message : 'Failed to create content.';
			return renderContentEditor(c, user, {
				...modelWithParsedData,
				formError: message,
			}, 400);
		}
	});

	app.get('/dashboard/content/:id', requireAuth, async (c) => {
		const user = c.get('authUser') as AuthUser;
		const id = c.req.param('id');
		if (!id) {
			return c.html('Content not found', 404);
		}
		try {
			const item = await loadContentById(id);
			if (!item) {
				return c.html('Content not found', 404);
			}
			const formSuccess = c.req.query('saved') === '1' ? 'Content saved.' : undefined;
			return renderContentEditor(c, user, { ...toEditorViewModel(item), formSuccess });
		} catch (error) {
			const message = error instanceof ContentApiError ? error.message : 'Failed to load content item.';
			return c.html(message, 500);
		}
	});

	app.post('/dashboard/content/:id', requireAuth, async (c) => {
		const user = c.get('authUser') as AuthUser;
		const token = getToken(c);
		if (!token) {
			return c.redirect(`/login?redirect=${encodeURIComponent(c.req.path)}`);
		}

		const id = c.req.param('id');
		const formData = await c.req.formData();
		const title = String(formData.get('title') ?? '').trim();
		const slug = String(formData.get('slug') ?? '').trim();
		const status = parseContentStatus(String(formData.get('status') ?? 'draft'));
		const dataJson = String(formData.get('dataJson') ?? '').trim();
		const collectionId = String(formData.get('collectionId') ?? '').trim();

		const model: ContentEditorViewModel = {
			mode: 'edit',
			itemId: id,
			collectionId,
			title,
			slug,
			status,
			dataJson,
		};

		if (!title || !slug) {
			return renderContentEditor(c, user, { ...model, formError: 'Title and slug are required.' }, 400);
		}

		const parsedData = parseDataFromForm(formData);
		const modelWithParsedData: ContentEditorViewModel = {
			...model,
			dataJson: JSON.stringify(parsedData.data, null, 2),
		};
		if (parsedData.error) {
			return renderContentEditor(c, user, { ...modelWithParsedData, formError: parsedData.error }, 400);
		}
		const data = parsedData.data;

		try {
			await fetchApiJson<unknown>(
				`/api/content/${id}`,
				{
					method: 'PUT',
					body: JSON.stringify({
						title,
						slug,
						status,
						data,
					}),
				},
				token
			);
			return c.redirect(`/dashboard/content/${id}?saved=1`);
		} catch (error) {
			const message = error instanceof ContentApiError ? error.message : 'Failed to update content.';
			return renderContentEditor(c, user, { ...modelWithParsedData, formError: message }, 400);
		}
	});
};
