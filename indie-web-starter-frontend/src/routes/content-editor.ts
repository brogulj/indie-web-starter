import type { Context, Hono } from 'hono';
import { render } from '../render';
import { resolveBaseCollections } from '../services/required-collections';
import { dashboardFlashTemplate, dashboardLocalNavTemplate, dashboardPageHeaderTemplate } from '../templates/dashboard-shell';
import {
	collectionFieldKindsMap,
	collectionRequiredFieldsMap,
	collectionSchemaPropertiesMap,
} from '../types/collection-field-kinds.generated';
import type { AuthUser } from '../utils/auth';
import { buildBackendUrl, fetchBackend, resolveBackendRequestOptions, type BackendRequestOptions } from '../utils/backend';
import { sonicGetCollectionsCached } from '../utils/sonic';
import { getToken, requireAuth } from './auth';

const API_BASE_URL = process.env.API_URL ?? 'http://localhost:8788';
const MEDIA_API_BASE_URL = process.env.MEDIA_API_URL ?? API_BASE_URL;
const REQUEST_TIMEOUT_MS = Number(process.env.SONIC_TIMEOUT_MS ?? '8000');
const HIDDEN_CREATE_COLLECTIONS = new Set(['webmentions', 'trusted-webmention-domains', 'following-sources', 'outbound-webmentions']);

type ContentStatus = 'draft' | 'published' | 'archived';

type DashboardContentItem = {
	id: string;
	collectionId: string;
	title: string;
	slug: string;
	status: ContentStatus;
	updatedAt: string;
	data: Record<string, unknown>;
};

type DashboardCollectionOption = {
	id: string;
	name: string;
	displayName: string;
	schemaProperties?: Record<string, unknown>;
	required?: string[];
};

type EditorViewModel = {
	mode: 'create' | 'edit';
	itemId?: string;
	collectionId: string;
	collectionRouteParam: string;
	title: string;
	slug: string;
	status: ContentStatus;
	dataJson: string;
	fieldDefinitions?: EditorFieldDefinition[];
	formError?: string;
	formSuccess?: string;
};

type CollectionListFilters = {
	searchQuery: string;
	status: 'all' | ContentStatus;
};

type FieldKind =
	| 'text'
	| 'textarea'
	| 'slug'
	| 'date'
	| 'datetime'
	| 'select'
	| 'reference'
	| 'number'
	| 'boolean'
	| 'richtext'
	| 'media'
	| 'media-array'
	| 'object-array'
	| 'json';

type EditorFieldDefinition = {
	name: string;
	label: string;
	kind: FieldKind;
	required: boolean;
	valueText: string;
	valueDate: string;
	valueDateTime: string;
	valueSelect: string;
	valueNumber: string;
	valueJson: string;
	selectOptions: Array<{ value: string; isSelected: boolean }>;
	referenceOptions: Array<{ value: string; label: string; isSelected: boolean }>;
	isTrue: boolean;
	isFalse: boolean;
	isText: boolean;
	isTextarea: boolean;
	isSlug: boolean;
	isDate: boolean;
	isDatetime: boolean;
	isSelect: boolean;
	isReference: boolean;
	isNumber: boolean;
	isBoolean: boolean;
	isRichtext: boolean;
	isMedia: boolean;
	isMediaArray: boolean;
	isObjectArray: boolean;
	isJson: boolean;
	inputId: string;
	objectArrayFieldsHint: string;
	objectArraySchemaJson: string;
};

class ContentApiError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = 'ContentApiError';
		this.status = status;
	}
}

const editorTemplate = /* html */ `
<section class="rounded-lg border border-gray-200 bg-white p-4">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h1 class="text-2xl font-semibold">{{pageTitle}}</h1>
    <a class="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50" href="/dashboard">Back to dashboard</a>
  </div>
  <p class="mt-2 text-sm text-gray-700">Create, edit, and publish content data.</p>

  {{#formError}}
  <p class="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{{formError}}</p>
  {{/formError}}

  {{#formSuccess}}
  <p class="mt-3 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">{{formSuccess}}</p>
  {{/formSuccess}}

  <form method="post" action="{{formAction}}" class="mt-4 space-y-4">
    <input type="hidden" name="collectionId" value="{{collectionId}}" />
    <label class="block text-sm">
      <span class="mb-1 block font-medium text-gray-700">Collection</span>
      <input value="{{collectionTitle}}" disabled class="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-gray-700" />
    </label>

    <label class="block text-sm">
      <span class="mb-1 block font-medium text-gray-700">Title</span>
      <input name="title" required value="{{contentTitle}}" class="w-full rounded-md border border-gray-300 bg-white px-3 py-2" />
    </label>

    <label class="block text-sm">
      <span class="mb-1 block font-medium text-gray-700">Slug</span>
      <input
        name="slug"
        required
        value="{{slug}}"
        class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono"
        pattern="[a-z0-9\\-]+"
        spellcheck="false"
        inputmode="text"
        autocomplete="off"
        data-slug-input
      />
    </label>

    <label class="block text-sm">
      <span class="mb-1 block font-medium text-gray-700">Status</span>
      <select name="status" required class="w-full rounded-md border border-gray-300 bg-white px-3 py-2">
        {{#statusOptions}}
        <option value="{{value}}" {{#isSelected}}selected{{/isSelected}}>{{value}}</option>
        {{/statusOptions}}
      </select>
    </label>

    {{#hasEditorFields}}
    <section class="mt-4">
      <h2 class="text-base font-semibold">Fields</h2>
      <div class="mt-2 grid gap-2">
      {{#fieldDefinitions}}
      <div>
        <label class="block text-sm">
          <span class="mb-1 block font-medium text-gray-700">{{label}}{{#required}} *{{/required}}</span>
          <input type="hidden" name="fieldType:{{name}}" value="{{kind}}" />
          {{#isText}}
          <input name="field:{{name}}" value="{{valueText}}" class="w-full rounded-md border border-gray-300 bg-white px-3 py-2" />
          {{/isText}}
          {{#isTextarea}}
          <textarea name="field:{{name}}" rows="4" class="w-full rounded-md border border-gray-300 bg-white px-3 py-2">{{valueText}}</textarea>
          {{/isTextarea}}
          {{#isSlug}}
          <input
            name="field:{{name}}"
            value="{{valueText}}"
            class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono"
            spellcheck="false"
            pattern="[a-z0-9\\-]*"
            inputmode="text"
            autocomplete="off"
            data-slug-input
          />
          <p class="mt-1 text-xs text-gray-600">Use lowercase letters, numbers, and hyphens.</p>
          {{/isSlug}}
          {{#isDate}}
          <input type="date" name="field:{{name}}" value="{{valueDate}}" class="w-full rounded-md border border-gray-300 bg-white px-3 py-2" />
          {{/isDate}}
          {{#isDatetime}}
          <input type="datetime-local" name="field:{{name}}" value="{{valueDateTime}}" class="w-full rounded-md border border-gray-300 bg-white px-3 py-2" />
          {{/isDatetime}}
          {{#isSelect}}
          <select name="field:{{name}}" class="w-full rounded-md border border-gray-300 bg-white px-3 py-2">
            {{#selectOptions}}
            <option value="{{value}}" {{#isSelected}}selected{{/isSelected}}>{{value}}</option>
            {{/selectOptions}}
          </select>
          {{/isSelect}}
          {{#isReference}}
          <select name="field:{{name}}" class="w-full rounded-md border border-gray-300 bg-white px-3 py-2" {{#required}}required{{/required}}>
            <option value=""></option>
            {{#referenceOptions}}
            <option value="{{value}}" {{#isSelected}}selected{{/isSelected}}>{{label}}</option>
            {{/referenceOptions}}
          </select>
          {{/isReference}}
          {{#isNumber}}
          <input type="number" name="field:{{name}}" value="{{valueNumber}}" class="w-full rounded-md border border-gray-300 bg-white px-3 py-2" />
          {{/isNumber}}
          {{#isBoolean}}
          <select name="field:{{name}}" class="w-full rounded-md border border-gray-300 bg-white px-3 py-2">
            <option value="true" {{#isTrue}}selected{{/isTrue}}>true</option>
            <option value="false" {{#isFalse}}selected{{/isFalse}}>false</option>
          </select>
          {{/isBoolean}}
          {{#isJson}}
          <textarea name="field:{{name}}" rows="6" class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm">{{valueJson}}</textarea>
          {{/isJson}}
          {{#isObjectArray}}
          <div
            class="space-y-2 rounded-md border border-gray-200 bg-white p-3"
            data-object-array-editor
            data-schema="{{objectArraySchemaJson}}"
            data-target-input="{{inputId}}"
            data-folder="{{collectionFolder}}"
          >
            <textarea
              id="{{inputId}}"
              name="field:{{name}}"
              class="hidden"
              data-object-array-storage
            >{{valueJson}}</textarea>
            <div class="space-y-3" data-object-array-rows></div>
            <div class="flex items-center justify-between">
              <p class="text-xs text-gray-600">Fields: {{objectArrayFieldsHint}}</p>
              <button
                type="button"
                class="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 transition hover:bg-gray-100"
                data-object-array-add
              >
                Add Item
              </button>
            </div>
          </div>
          {{/isObjectArray}}
          {{#isMedia}}
          <div class="space-y-3 rounded-md border border-gray-200 bg-white p-3">
            {{#isMediaArray}}
            <textarea
              id="{{inputId}}"
              name="field:{{name}}"
              rows="4"
              class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm"
              placeholder="https://... (one URL per line)"
              {{#required}}required{{/required}}
              data-media-url
              data-media-multiple="true"
            >{{valueText}}</textarea>
            <p class="mt-1 text-xs text-gray-600">Use one image URL per line.</p>
            {{/isMediaArray}}
            {{^isMediaArray}}
            <input
              id="{{inputId}}"
              name="field:{{name}}"
              value="{{valueText}}"
              class="w-full rounded-md border border-gray-300 bg-white px-3 py-2"
              placeholder="https://..."
              {{#required}}required{{/required}}
              data-media-url
            />
            {{/isMediaArray}}
            <div class="flex flex-wrap items-center gap-2">
              <input type="file" data-media-file data-target="{{inputId}}" data-folder="{{collectionFolder}}" data-media-multiple="{{#isMediaArray}}true{{/isMediaArray}}{{^isMediaArray}}false{{/isMediaArray}}" accept=".jpg,.jpeg,.png,.gif,.webp,.svg,image/jpeg,image/png,image/gif,image/webp,image/svg+xml" {{#isMediaArray}}multiple{{/isMediaArray}} class="block text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-gray-300 file:bg-gray-50 file:px-3 file:py-1.5 file:text-sm" />
              <span class="text-xs text-gray-600" data-media-status data-target="{{inputId}}">{{#isMediaArray}}No images selected.{{/isMediaArray}}{{^isMediaArray}}No image selected.{{/isMediaArray}}</span>
            </div>
            <div class="hidden overflow-hidden rounded border border-gray-200 bg-white p-2" data-media-preview-wrap data-target="{{inputId}}" data-media-preview-multiple="{{#isMediaArray}}true{{/isMediaArray}}{{^isMediaArray}}false{{/isMediaArray}}">
              {{^isMediaArray}}
              <img data-media-preview data-target="{{inputId}}" alt="Image preview" class="media-preview-img" />
              {{/isMediaArray}}
              {{#isMediaArray}}
              <div data-media-preview-grid data-target="{{inputId}}" class="grid gap-2 sm:grid-cols-2"></div>
              {{/isMediaArray}}
            </div>
          </div>
          {{/isMedia}}
          {{#isRichtext}}
          <div class="space-y-2">
            <textarea
              id="{{inputId}}"
              name="field:{{name}}"
              rows="12"
              class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm"
              data-richtext-field
              data-folder="{{collectionFolder}}"
            >{{valueText}}</textarea>
          </div>
          {{/isRichtext}}
        </label>
      </div>
      {{/fieldDefinitions}}
      </div>
    </section>
    {{/hasEditorFields}}

    {{^hasEditorFields}}
    <label class="block text-sm">
      <span class="mb-1 block font-medium text-gray-700">Data (JSON)</span>
      <textarea name="dataJson" rows="12" class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm">{{dataJson}}</textarea>
    </label>
    {{/hasEditorFields}}

    <div class="pt-1">
      <button type="submit" class="ml-auto rounded-md border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-black">{{submitLabel}}</button>
    </div>
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

  .media-preview-img {
    display: block;
    max-height: 220px;
    width: 100%;
    object-fit: contain;
    background: #f9fafb;
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

  const richtextAreas = Array.from(document.querySelectorAll('[data-richtext-field]')).filter((item) => item instanceof HTMLTextAreaElement);
  if (richtextAreas.length > 0) {
    const uploadImageForEditor = async (editor, folder) => {
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = '.jpg,.jpeg,.png,.gif,.webp,.svg,image/jpeg,image/png,image/gif,image/webp,image/svg+xml';
      picker.click();

      const file = await new Promise((resolve) => {
        picker.addEventListener('change', () => {
          resolve(picker.files && picker.files[0] ? picker.files[0] : null);
        }, { once: true });
      });
      if (!(file instanceof File)) return;

      const body = new FormData();
      body.set('file', file);
      body.set('folder', folder || 'uploads');

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
        const errorMessage =
          payload && typeof payload === 'object' && typeof payload.error === 'string'
            ? payload.error
            : 'Image upload failed';
        window.alert(errorMessage);
        return;
      }

      const alt = file.name.replace(/\.[^.]+$/, '').trim() || 'image';
      const cm = editor.codemirror;
      cm.replaceSelection('![' + alt + '](' + uploadedValue + ')');
      cm.focus();
    };

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
          toolbar: [
            'bold',
            'italic',
            'heading',
            '|',
            'quote',
            'unordered-list',
            'ordered-list',
            '|',
            'link',
            {
              name: 'image',
              action: (editor) => uploadImageForEditor(editor, textarea.dataset.folder || 'uploads'),
              className: 'fa fa-image',
              title: 'Insert image',
            },
            'preview',
            'side-by-side',
            'fullscreen',
            '|',
            'guide'
          ],
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

  const isLikelyImageUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return false;
    const lowerRaw = raw.toLowerCase();
    if (lowerRaw.startsWith('data:image/')) return true;
    try {
      const parsed = new URL(raw, window.location.origin);
      const pathname = parsed.pathname.toLowerCase();
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.bmp', '.ico'];
      return imageExtensions.some((ext) => pathname.endsWith(ext)) || parsed.searchParams.has('format');
    } catch {
      return false;
    }
  };

  const NEWLINE = String.fromCharCode(10);
  const CARRIAGE_RETURN = String.fromCharCode(13);
  const normalizeSlugValue = (value) =>
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '');

  const parseMediaUrls = (value) =>
    String(value || '')
      .replaceAll(CARRIAGE_RETURN, '')
      .split(',')
      .flatMap((entry) => String(entry || '').split(NEWLINE))
      .map((entry) => entry.trim())
      .filter(Boolean);

  const setMediaFieldValue = (target, values, isMultiple) => {
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;
    if (isMultiple) {
      target.value = values.join(NEWLINE);
      return;
    }
    target.value = values[0] || '';
  };

  const updateMediaPreview = (targetId, value) => {
    const previewWrap = document.querySelector('[data-media-preview-wrap][data-target="' + targetId + '"]');
    const preview = document.querySelector('[data-media-preview][data-target="' + targetId + '"]');
    const previewGrid = document.querySelector('[data-media-preview-grid][data-target="' + targetId + '"]');
    const status = document.querySelector('[data-media-status][data-target="' + targetId + '"]');
    if (!(previewWrap instanceof HTMLElement)) return;
    const isMultiple = previewWrap.getAttribute('data-media-preview-multiple') === 'true';
    const urls = parseMediaUrls(value).filter((entry) => isLikelyImageUrl(entry));
    if (urls.length === 0) {
      if (preview instanceof HTMLImageElement) preview.removeAttribute('src');
      if (previewGrid instanceof HTMLElement) previewGrid.innerHTML = '';
      previewWrap.classList.add('hidden');
      if (status instanceof HTMLElement && status.textContent === 'Preview ready.') {
        status.textContent = isMultiple ? 'No images selected.' : 'No image selected.';
      }
      return;
    }
    if (isMultiple && previewGrid instanceof HTMLElement) {
      previewGrid.innerHTML = '';
      urls.forEach((url) => {
        const image = document.createElement('img');
        image.src = url;
        image.alt = 'Image preview';
        image.className = 'media-preview-img rounded border border-gray-200';
        previewGrid.appendChild(image);
      });
    } else if (preview instanceof HTMLImageElement) {
      preview.src = urls[0];
    }
    previewWrap.classList.remove('hidden');
    if (status instanceof HTMLElement) status.textContent = 'Preview ready.';
  };

  document.querySelectorAll('[data-media-url]').forEach((input) => {
    if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) return;
    const targetId = input.id || input.getAttribute('data-target') || '';
    if (!targetId) return;
    updateMediaPreview(targetId, input.value);
    input.addEventListener('input', () => updateMediaPreview(targetId, input.value));
  });

  document.querySelectorAll('[data-media-file]').forEach((fileInput) => {
    if (!(fileInput instanceof HTMLInputElement)) return;
    const targetId = fileInput.getAttribute('data-target') || '';
    const target = document.getElementById(targetId);
    const isMultiple = fileInput.getAttribute('data-media-multiple') === 'true';
    const folder = fileInput.getAttribute('data-folder') || 'uploads';
    const status = document.querySelector('[data-media-status][data-target="' + targetId + '"]');
    if (!(status instanceof HTMLElement)) return;

    fileInput.addEventListener('change', async () => {
      if (
        (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) ||
        !fileInput.files ||
        fileInput.files.length === 0
      ) {
        status.textContent = isMultiple ? 'No images selected.' : 'No image selected.';
        return;
      }

      const selectedFiles = Array.from(fileInput.files);
      const allowedMime = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']);
      for (const selectedFile of selectedFiles) {
        const lowerName = String(selectedFile.name || '').toLowerCase();
        const hasAllowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].some((ext) => lowerName.endsWith(ext));
        if (!allowedMime.has(selectedFile.type) && !hasAllowedExt) {
          status.textContent = 'Unsupported image type. Use JPG, PNG, GIF, WebP, or SVG.';
          fileInput.value = '';
          return;
        }
      }

      status.textContent = 'Uploading...';
      try {
        const uploadedValues = [];
        for (const selectedFile of selectedFiles) {
          const body = new FormData();
          body.set('file', selectedFile);
          body.set('folder', folder);

          const response = await fetch('/dashboard/media/upload', {
            method: 'POST',
            credentials: 'same-origin',
            body
          });
          const responseClone = response.clone();
          const payload = await response.json().catch(async () => {
            const text = await responseClone.text().catch(() => '');
            return text ? { error: text } : {};
          });
          const fileObject = payload && typeof payload === 'object' ? payload.file : null;
          const uploadedValue =
            fileObject && typeof fileObject === 'object'
              ? (typeof fileObject.apiUrl === 'string' ? fileObject.apiUrl : (typeof fileObject.publicUrl === 'string' ? fileObject.publicUrl : ''))
              : '';
          if (!response.ok || !uploadedValue) {
            const details =
              payload && typeof payload === 'object'
                ? (typeof payload.details === 'string'
                  ? payload.details
                  : payload.details
                    ? JSON.stringify(payload.details)
                    : '')
                : '';
            const attempts =
              payload && typeof payload === 'object' && Array.isArray(payload.attempts)
                ? JSON.stringify(payload.attempts)
                : '';
            const message =
              payload && typeof payload === 'object' && typeof payload.error === 'string'
                ? payload.error
                : payload && typeof payload === 'object' && typeof payload.message === 'string'
                  ? payload.message
                  : 'Upload failed';
            const diagnostic = [details, attempts].filter(Boolean).join(' | ');
            throw new Error(diagnostic ? message + ': ' + diagnostic : message);
          }
          uploadedValues.push(uploadedValue);
        }

        const existingValues = isMultiple ? parseMediaUrls(target.value) : [];
        const finalValues = isMultiple ? [...existingValues, ...uploadedValues] : [uploadedValues[uploadedValues.length - 1]];
        setMediaFieldValue(target, finalValues, isMultiple);
        fileInput.value = '';
        status.textContent = uploadedValues.length > 1 ? 'Uploaded ' + uploadedValues.length + ' images.' : 'Uploaded.';
        updateMediaPreview(targetId, target.value);
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Upload failed.';
      }
    });
  });

  document.querySelectorAll('[data-slug-input]').forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const isAllowedSnippet = (value) => /^[a-z0-9-]*$/.test(String(value || '').toLowerCase());
    const sanitize = () => {
      const normalized = normalizeSlugValue(input.value);
      if (input.value !== normalized) input.value = normalized;
    };
    input.addEventListener('beforeinput', (event) => {
      if (event.isComposing) return;
      const inputEvent = event;
      if (typeof inputEvent.data !== 'string' || inputEvent.data.length === 0) return;
      if (!isAllowedSnippet(inputEvent.data)) {
        event.preventDefault();
      }
    });
    input.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = String(event.key || '');
      if (key.length !== 1) return;
      if (!/[a-z0-9-]/.test(key)) {
        event.preventDefault();
      }
    });
    input.addEventListener('paste', (event) => {
      event.preventDefault();
      const pasted = event.clipboardData ? event.clipboardData.getData('text') : '';
      const sanitized = normalizeSlugValue(pasted);
      if (!sanitized) return;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.setRangeText(sanitized, start, end, 'end');
      sanitize();
    });
    input.addEventListener('drop', (event) => {
      event.preventDefault();
    });
    sanitize();
    input.addEventListener('input', sanitize);
    input.addEventListener('blur', sanitize);
  });

  const parseObjectArraySchema = (raw) => {
    if (typeof raw !== 'string' || !raw.trim()) return {};
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return parsed;
    } catch {
      return {};
    }
  };

  const parseObjectArrayValue = (raw) => {
    if (typeof raw !== 'string' || !raw.trim()) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
        .map((entry) => ({ ...entry }));
    } catch {
      return [];
    }
  };

  const toObjectArrayStorageValue = (items) => {
    if (!Array.isArray(items) || items.length === 0) return '[]';
    return JSON.stringify(items, null, 2);
  };

  const normalizeValueForField = (definition, value) => {
    const fieldType = String(definition && definition.type ? definition.type : '').toLowerCase();
    const fieldFormat = String(definition && definition.format ? definition.format : '').toLowerCase();
    if (fieldType === 'number' || fieldType === 'integer') {
      if (value === '' || value == null) return null;
      const asNumber = Number(value);
      return Number.isNaN(asNumber) ? null : asNumber;
    }
    if (fieldType === 'boolean') {
      if (typeof value === 'boolean') return value;
      return String(value || '').toLowerCase() === 'true';
    }
    if ((fieldType === 'string' && fieldFormat === 'media') || fieldType === 'media') {
      return String(value || '').trim();
    }
    if (fieldType === 'string' || fieldType === 'textarea' || fieldType === 'slug' || fieldType === 'datetime' || fieldType === 'date') {
      return String(value || '');
    }
    return value == null ? '' : value;
  };

  document.querySelectorAll('[data-object-array-editor]').forEach((editorNode) => {
    if (!(editorNode instanceof HTMLElement)) return;
    const storage = editorNode.querySelector('[data-object-array-storage]');
    const rowsHost = editorNode.querySelector('[data-object-array-rows]');
    const addButton = editorNode.querySelector('[data-object-array-add]');
    if (!(storage instanceof HTMLTextAreaElement) || !(rowsHost instanceof HTMLElement) || !(addButton instanceof HTMLButtonElement)) return;

    const schema = parseObjectArraySchema(editorNode.getAttribute('data-schema') || '{}');
    const fieldEntries = Object.entries(schema);
    const uploadFolder = editorNode.getAttribute('data-folder') || 'uploads';
    let items = parseObjectArrayValue(storage.value);

    const syncStorage = () => {
      storage.value = toObjectArrayStorageValue(items);
    };

    const createInputForField = (fieldName, fieldDefinition, itemIndex) => {
      const definition = fieldDefinition && typeof fieldDefinition === 'object' ? fieldDefinition : {};
      const fieldType = String(definition.type || '').toLowerCase();
      const enumValues = Array.isArray(definition.enum) ? definition.enum.map((entry) => String(entry)) : [];
      const currentValue = items[itemIndex] && typeof items[itemIndex] === 'object' ? items[itemIndex][fieldName] : '';
      const normalizedCurrentValue = currentValue == null ? '' : String(currentValue);

      const wrap = document.createElement('label');
      wrap.className = 'block text-sm';

      const label = document.createElement('span');
      label.className = 'mb-1 block text-xs text-gray-700';
      label.textContent = String(definition.title || fieldName);
      wrap.appendChild(label);

      const commitValue = (nextValue) => {
        const normalized = normalizeValueForField(definition, nextValue);
        if (!items[itemIndex] || typeof items[itemIndex] !== 'object') items[itemIndex] = {};
        items[itemIndex][fieldName] = normalized;
        syncStorage();
      };

      if (enumValues.length > 0) {
        const select = document.createElement('select');
        select.className = 'w-full border border-gray-300 bg-white px-2 py-1';
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '';
        select.appendChild(emptyOption);
        enumValues.forEach((optionValue) => {
          const option = document.createElement('option');
          option.value = optionValue;
          option.textContent = optionValue;
          if (optionValue === normalizedCurrentValue) option.selected = true;
          select.appendChild(option);
        });
        select.addEventListener('change', () => commitValue(select.value));
        wrap.appendChild(select);
        return wrap;
      }

      if (fieldType === 'boolean') {
        const select = document.createElement('select');
        select.className = 'w-full border border-gray-300 bg-white px-2 py-1';
        [
          { value: '', label: '' },
          { value: 'true', label: 'true' },
          { value: 'false', label: 'false' },
        ].forEach((optionDef) => {
          const option = document.createElement('option');
          option.value = optionDef.value;
          option.textContent = optionDef.label;
          if (optionDef.value === normalizedCurrentValue) option.selected = true;
          select.appendChild(option);
        });
        select.addEventListener('change', () => commitValue(select.value));
        wrap.appendChild(select);
        return wrap;
      }

      const isMediaField =
        fieldType === 'media' || (fieldType === 'string' && String(definition.format || '').toLowerCase() === 'media');
      if (isMediaField) {
        const mediaContainer = document.createElement('div');
        mediaContainer.className = 'space-y-2 rounded border border-gray-200 bg-gray-50 p-2';

        const mediaInput = document.createElement('input');
        mediaInput.type = 'text';
        mediaInput.className = 'w-full border border-gray-300 bg-white px-2 py-1';
        mediaInput.value = normalizedCurrentValue;
        mediaInput.placeholder = 'https://...';
        mediaContainer.appendChild(mediaInput);

        const controls = document.createElement('div');
        controls.className = 'flex flex-wrap items-center gap-2';
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.jpg,.jpeg,.png,.gif,.webp,.svg,image/jpeg,image/png,image/gif,image/webp,image/svg+xml';
        fileInput.className =
          'block text-sm file:mr-2 file:cursor-pointer file:border file:border-gray-300 file:bg-white file:px-2 file:py-1 file:text-xs';
        const status = document.createElement('span');
        status.className = 'text-xs text-gray-600';
        status.textContent = 'No image selected.';
        controls.appendChild(fileInput);
        controls.appendChild(status);
        mediaContainer.appendChild(controls);

        const previewWrap = document.createElement('div');
        previewWrap.className = 'hidden overflow-hidden rounded border border-gray-200 bg-white p-2';
        const previewImage = document.createElement('img');
        previewImage.alt = 'Image preview';
        previewImage.className = 'media-preview-img';
        previewWrap.appendChild(previewImage);
        mediaContainer.appendChild(previewWrap);

        const setPreview = (url) => {
          const trimmed = String(url || '').trim();
          if (!trimmed || !isLikelyImageUrl(trimmed)) {
            previewImage.removeAttribute('src');
            previewWrap.classList.add('hidden');
            if (status.textContent === 'Preview ready.') status.textContent = 'No image selected.';
            return;
          }
          previewImage.src = trimmed;
          previewWrap.classList.remove('hidden');
          status.textContent = 'Preview ready.';
        };

        setPreview(mediaInput.value);
        mediaInput.addEventListener('input', () => {
          commitValue(mediaInput.value);
          setPreview(mediaInput.value);
        });

        fileInput.addEventListener('change', async () => {
          const selectedFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
          if (!(selectedFile instanceof File)) {
            status.textContent = 'No image selected.';
            return;
          }

          const lowerName = String(selectedFile.name || '').toLowerCase();
          const allowedMime = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']);
          const hasAllowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].some((ext) => lowerName.endsWith(ext));
          if (!allowedMime.has(selectedFile.type) && !hasAllowedExt) {
            status.textContent = 'Unsupported image type. Use JPG, PNG, GIF, WebP, or SVG.';
            fileInput.value = '';
            return;
          }

          status.textContent = 'Uploading...';
          try {
            const body = new FormData();
            body.set('file', selectedFile);
            body.set('folder', uploadFolder);

            const response = await fetch('/dashboard/media/upload', {
              method: 'POST',
              credentials: 'same-origin',
              body,
            });
            const responseClone = response.clone();
            const payload = await response.json().catch(async () => {
              const text = await responseClone.text().catch(() => '');
              return text ? { error: text } : {};
            });
            const fileObject = payload && typeof payload === 'object' ? payload.file : null;
            const uploadedValue =
              fileObject && typeof fileObject === 'object'
                ? (typeof fileObject.apiUrl === 'string'
                    ? fileObject.apiUrl
                    : typeof fileObject.publicUrl === 'string'
                      ? fileObject.publicUrl
                      : '')
                : '';
            if (!response.ok || !uploadedValue) {
              const message =
                payload && typeof payload === 'object' && typeof payload.error === 'string'
                  ? payload.error
                  : payload && typeof payload === 'object' && typeof payload.message === 'string'
                    ? payload.message
                    : 'Upload failed';
              throw new Error(message);
            }

            mediaInput.value = uploadedValue;
            fileInput.value = '';
            commitValue(uploadedValue);
            setPreview(uploadedValue);
            status.textContent = 'Uploaded.';
          } catch (error) {
            status.textContent = error instanceof Error ? error.message : 'Upload failed.';
          }
        });

        wrap.appendChild(mediaContainer);
        return wrap;
      }

      const input = document.createElement('input');
      input.className = 'w-full border border-gray-300 bg-white px-2 py-1';
      input.value = normalizedCurrentValue;
      if (fieldType === 'number' || fieldType === 'integer') {
        input.type = 'number';
      } else {
        input.type = 'text';
      }
      if (fieldType === 'media' || (fieldType === 'string' && String(definition.format || '').toLowerCase() === 'media')) {
        input.placeholder = 'https://...';
      }
      input.addEventListener('input', () => commitValue(input.value));
      wrap.appendChild(input);
      return wrap;
    };

    const renderRows = () => {
      rowsHost.innerHTML = '';
      if (!Array.isArray(items) || items.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'text-xs text-gray-600';
        empty.textContent = 'No items yet.';
        rowsHost.appendChild(empty);
        syncStorage();
        return;
      }

      items.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'space-y-2 rounded border border-gray-200 bg-white p-3';

        const rowHeader = document.createElement('div');
        rowHeader.className = 'flex items-center justify-between gap-2';
        const rowTitle = document.createElement('p');
        rowTitle.className = 'text-sm font-medium text-gray-800';
        rowTitle.textContent = 'Item ' + String(index + 1);
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-100';
        removeButton.textContent = 'Remove';
        removeButton.addEventListener('click', () => {
          items.splice(index, 1);
          renderRows();
        });
        rowHeader.appendChild(rowTitle);
        rowHeader.appendChild(removeButton);
        row.appendChild(rowHeader);

        const grid = document.createElement('div');
        grid.className = 'grid gap-2 md:grid-cols-2';

        fieldEntries.forEach(([fieldName, fieldDefinition]) => {
          grid.appendChild(createInputForField(fieldName, fieldDefinition, index));
        });

        row.appendChild(grid);
        rowsHost.appendChild(row);
      });

      syncStorage();
    };

    addButton.addEventListener('click', () => {
      const nextItem = {};
      fieldEntries.forEach(([fieldName, fieldDefinition]) => {
        const definition = fieldDefinition && typeof fieldDefinition === 'object' ? fieldDefinition : {};
        const fieldType = String(definition.type || '').toLowerCase();
        if (fieldType === 'number' || fieldType === 'integer') {
          nextItem[fieldName] = null;
        } else if (fieldType === 'boolean') {
          nextItem[fieldName] = false;
        } else {
          nextItem[fieldName] = '';
        }
      });
      items.push(nextItem);
      renderRows();
    });

    renderRows();
  });
})();
</script>
`;

const collectionPickerTemplate = /* html */ `
<section class="rounded-lg border border-gray-200 bg-white p-4">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h1 class="text-2xl font-semibold">Create Content</h1>
    <a class="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50" href="/dashboard">Back to dashboard</a>
  </div>
  <p class="mt-2 text-sm text-gray-700">Choose a collection to create content.</p>

  <label class="mt-4 block text-sm">
    <span class="mb-1 block font-medium text-gray-700">Collection</span>
    <select data-collection-selector class="w-full rounded-md border border-gray-300 bg-white px-3 py-2">
      <option value="">Select collection</option>
      {{#collectionOptions}}
      <option value="{{id}}">{{displayName}} ({{name}})</option>
      {{/collectionOptions}}
    </select>
  </label>
</section>

<script>
(() => {
  const selector = document.querySelector('[data-collection-selector]');
  if (!(selector instanceof HTMLSelectElement)) return;
  selector.addEventListener('change', () => {
    const selected = selector.value.trim();
    if (!selected) return;
    window.location.assign('/dashboard/' + encodeURIComponent(selected) + '/new');
  });
})();
</script>
`;

const collectionListTemplate = /* html */ `
<section class="space-y-6">
  ${dashboardLocalNavTemplate}
  ${dashboardPageHeaderTemplate}
  ${dashboardFlashTemplate}

  <section class="rounded-lg border border-gray-200 bg-white p-4">
    <div class="sticky top-2 z-10 grid gap-3 rounded-md border border-gray-200 bg-gray-50 p-3 md:grid-cols-[1fr_200px_auto]" data-collection-filters>
      <label class="block">
        <span class="mb-1 block text-xs uppercase tracking-wide text-gray-600">Search</span>
        <input
          type="search"
          placeholder="Search title or slug"
          class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          value="{{collectionListFilters.searchQuery}}"
          data-collection-search
        />
      </label>

      <label class="block">
        <span class="mb-1 block text-xs uppercase tracking-wide text-gray-600">Status</span>
        <select class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" data-status-filter>
          <option value="all" {{#statusFilterAll}}selected{{/statusFilterAll}}>All statuses</option>
          <option value="draft" {{#statusFilterDraft}}selected{{/statusFilterDraft}}>Draft</option>
          <option value="published" {{#statusFilterPublished}}selected{{/statusFilterPublished}}>Published</option>
          <option value="archived" {{#statusFilterArchived}}selected{{/statusFilterArchived}}>Archived</option>
        </select>
      </label>

      <a class="inline-flex items-center rounded-md border border-gray-900 bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-black" href="/dashboard/{{collectionPath}}/new">New Content</a>
    </div>

    {{#hasItems}}
    <div class="mt-4 overflow-x-auto">
      <table class="min-w-full border border-gray-200 text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="border border-gray-200 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-600">Title</th>
            <th class="border border-gray-200 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-600">Status</th>
            <th class="border border-gray-200 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-600">Updated</th>
            <th class="hidden border border-gray-200 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-600 md:table-cell">Slug</th>
            <th class="border border-gray-200 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-600">Actions</th>
          </tr>
        </thead>
        <tbody data-collection-rows>
          {{#items}}
          <tr
            data-collection-row
            data-search="{{searchText}}"
            data-status="{{statusLower}}"
          >
            <td class="border border-gray-200 px-2 py-2 align-top">
              <p class="font-medium text-gray-900">{{displayTitle}}</p>
              <p class="text-xs text-gray-600 md:hidden">{{slug}}</p>
            </td>
            <td class="border border-gray-200 px-2 py-2 align-top"><span class="inline-flex rounded-full border border-gray-300 bg-white px-2 py-0.5 text-xs">{{status}}</span></td>
            <td class="border border-gray-200 px-2 py-2 align-top">{{updatedAtDisplay}}</td>
            <td class="hidden border border-gray-200 px-2 py-2 align-top md:table-cell">{{slug}}</td>
            <td class="border border-gray-200 px-2 py-2 align-top">
              <a class="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 transition hover:bg-gray-50" href="/dashboard/{{collectionPath}}/{{id}}">View / Edit</a>
            </td>
          </tr>
          {{/items}}
        </tbody>
      </table>
    </div>
    <p class="mt-3 hidden text-sm text-gray-600" data-filter-empty>No matching items for this filter.</p>
    {{/hasItems}}

    {{^hasItems}}
    <p class="mt-3 text-sm text-gray-600">No content found in this collection.</p>
    {{/hasItems}}
  </section>
</section>

<script>
(() => {
  const rows = Array.from(document.querySelectorAll('[data-collection-row]'));
  if (rows.length === 0) return;
  const searchInput = document.querySelector('[data-collection-search]');
  const statusFilter = document.querySelector('[data-status-filter]');
  const emptyState = document.querySelector('[data-filter-empty]');

  if (!(searchInput instanceof HTMLInputElement)) return;
  if (!(statusFilter instanceof HTMLSelectElement)) return;

  const applyFilters = () => {
    const query = searchInput.value.trim().toLowerCase();
    const status = statusFilter.value.trim().toLowerCase();
    let visibleCount = 0;

    for (const row of rows) {
      if (!(row instanceof HTMLElement)) continue;
      const haystack = String(row.getAttribute('data-search') || '').toLowerCase();
      const rowStatus = String(row.getAttribute('data-status') || '').toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      const matchesStatus = status === 'all' || rowStatus === status;
      const isVisible = matchesQuery && matchesStatus;
      row.classList.toggle('hidden', !isVisible);
      if (isVisible) visibleCount += 1;
    }

    if (emptyState instanceof HTMLElement) {
      emptyState.classList.toggle('hidden', visibleCount > 0);
    }
  };

  searchInput.addEventListener('input', applyFilters);
  statusFilter.addEventListener('change', applyFilters);
})();
</script>
`;

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

const toDateLabel = (value: string): string => {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return 'Unknown';
	return parsed.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
};

const buildApiUrl = (path: string, options?: BackendRequestOptions): string =>
	buildBackendUrl(path, { apiBaseUrl: options?.apiBaseUrl ?? API_BASE_URL });

const parseContentItem = (value: unknown): DashboardContentItem | null => {
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
		updatedAt: toIsoDate(obj.updatedAt ?? obj.updated_at),
		data: asObject(obj.data) ?? {},
	};
};

const parseContentItemResponse = (payload: unknown): DashboardContentItem | null => {
	const obj = asObject(payload);
	if (!obj) return null;
	if ('data' in obj) {
		const nested = asObject(obj.data);
		if (nested && typeof nested.id === 'string') return parseContentItem(nested);
	}
	if (typeof obj.id === 'string') return parseContentItem(obj);
	return null;
};

const parseContentListResponse = (payload: unknown): DashboardContentItem[] => {
	const obj = asObject(payload);
	if (!obj) return [];
	const rawData = obj.data;
	if (!Array.isArray(rawData)) return [];
	return rawData.map((item) => parseContentItem(item)).filter((item): item is DashboardContentItem => Boolean(item));
};

const fetchApiJson = async <T>(path: string, init: RequestInit = {}, token?: string, options?: BackendRequestOptions): Promise<T> => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const headers = new Headers(init.headers);
		if (!headers.has('content-type') && init.body && typeof init.body === 'string') {
			headers.set('content-type', 'application/json');
		}
		if (token) headers.set('authorization', `Bearer ${token}`);

		const response = await fetchBackend(buildApiUrl(path, options), { ...init, headers, signal: controller.signal }, options);
		if (!response.ok) {
			let message = 'Content request failed';
			try {
				const errorBody = (await response.json()) as { error?: string; message?: string };
				message = errorBody.error ?? errorBody.message ?? message;
			} catch {
				// ignore body parsing errors
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

const loadCollectionOptions = async (options?: BackendRequestOptions): Promise<DashboardCollectionOption[]> => {
	const collections = await sonicGetCollectionsCached(options);
	return collections
		.filter(
			(collection) =>
				!HIDDEN_CREATE_COLLECTIONS.has(
					String(collection.name || '')
						.trim()
						.toLowerCase()
				)
		)
		.map((collection) => ({
			id: collection.id,
			name: collection.name,
			displayName: collection.display_name || collection.name,
			schemaProperties: collection.schema?.properties,
			required: Array.isArray(collection.schema?.required) ? collection.schema?.required : [],
		}));
};

const loadCollectionOptionsSafe = async (options?: BackendRequestOptions): Promise<DashboardCollectionOption[]> => {
	try {
		return await loadCollectionOptions(options);
	} catch {
		return [];
	}
};

const resolveCollectionByRoute = (routeValue: string): { routeParam: string; collectionId: string } => {
	const routeParam = routeValue.trim();
	if (!routeParam) return { routeParam: '', collectionId: '' };
	return { routeParam, collectionId: routeParam };
};

const normalizeSlug = (value: string): string =>
	String(value || '')
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9-]+/g, '');

const resolveSelectedCollection = (
	collectionOptions: DashboardCollectionOption[],
	collectionValue: string
): DashboardCollectionOption | undefined => {
	return collectionOptions.find((option) => option.id === collectionValue || option.name === collectionValue);
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
	const toNormalized = (value: unknown): string =>
		String(value ?? '')
			.toLowerCase()
			.trim();
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
			toNormalized(fieldObj.input)
		);
	}

	if (normalizedCandidates.some((value) => value === 'richtext' || value === 'markdown' || value === 'md')) return 'richtext';
	if (normalizedCandidates.some((value) => value === 'media-array')) return 'media-array';
	if (normalizedCandidates.some((value) => value === 'object-array')) return 'object-array';
	if (normalizedCandidates.some((value) => value === 'media' || value === 'image' || value === 'file' || value === 'upload'))
		return 'media';
	if (normalizedCandidates.some((value) => value === 'slug')) return 'slug';
	if (normalizedCandidates.some((value) => value === 'datetime' || value === 'datetime-local' || value === 'timestamp')) return 'datetime';
	if (normalizedCandidates.some((value) => value === 'date')) return 'date';
	if (normalizedCandidates.some((value) => value === 'reference' || value === 'relation' || value === 'relationship')) return 'reference';
	if (normalizedCandidates.some((value) => value === 'select' || value === 'enum')) return 'select';
	if (normalizedCandidates.some((value) => value === 'textarea' || value === 'multiline')) return 'textarea';
	if (normalizedCandidates.some((value) => value === 'boolean' || value === 'bool')) return 'boolean';
	if (
		normalizedCandidates.some(
			(value) => value === 'number' || value === 'integer' || value === 'int' || value === 'float' || value === 'double'
		)
	)
		return 'number';
	if (normalizedCandidates.some((value) => value === 'object' || value === 'array' || value === 'json')) return 'json';
	return 'text';
};

const toDateInputValue = (value: string): string => {
	const normalized = value.trim();
	if (!normalized) return '';
	if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
	const parsed = new Date(normalized);
	if (Number.isNaN(parsed.getTime())) return '';
	const year = parsed.getFullYear();
	const month = String(parsed.getMonth() + 1).padStart(2, '0');
	const day = String(parsed.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
};

const toDateTimeLocalValue = (value: string): string => {
	const normalized = value.trim();
	if (!normalized) return '';
	if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) return normalized;
	const parsed = new Date(normalized);
	if (Number.isNaN(parsed.getTime())) return '';
	const year = parsed.getFullYear();
	const month = String(parsed.getMonth() + 1).padStart(2, '0');
	const day = String(parsed.getDate()).padStart(2, '0');
	const hours = String(parsed.getHours()).padStart(2, '0');
	const minutes = String(parsed.getMinutes()).padStart(2, '0');
	return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const toSelectOptions = (field: unknown, currentValue: string): Array<{ value: string; isSelected: boolean }> => {
	if (!field || typeof field !== 'object' || Array.isArray(field)) return [];
	const fieldObj = field as Record<string, unknown>;
	const entries = Array.isArray(fieldObj.enum) ? fieldObj.enum.map((entry) => String(entry)) : [];
	return entries.map((value) => ({ value, isSelected: value === currentValue }));
};

type ReferenceOption = { value: string; label: string };

const toReferenceCollectionIds = (field: unknown): string[] => {
	if (!field || typeof field !== 'object' || Array.isArray(field)) return [];
	const fieldObj = field as Record<string, unknown>;
	const rawCollection = fieldObj.collection;
	if (typeof rawCollection === 'string') {
		const trimmed = rawCollection.trim();
		return trimmed ? [trimmed] : [];
	}
	if (!Array.isArray(rawCollection)) return [];
	return rawCollection.map((entry) => String(entry).trim()).filter(Boolean);
};

const dedupeReferenceOptions = (options: ReferenceOption[]): ReferenceOption[] => {
	const seen = new Set<string>();
	const deduped: ReferenceOption[] = [];
	for (const option of options) {
		if (!option.value || seen.has(option.value)) continue;
		seen.add(option.value);
		deduped.push(option);
	}
	return deduped;
};

const loadReferenceOptionsByCollection = async (collectionIds: string[]): Promise<Record<string, ReferenceOption[]>> => {
	const uniqueCollectionIds = Array.from(new Set(collectionIds.map((entry) => entry.trim()).filter(Boolean)));
	if (uniqueCollectionIds.length === 0) return {};
	const results = await Promise.all(
		uniqueCollectionIds.map(async (collectionId) => {
			try {
				const items = await loadContentForCollection(collectionId);
				const options = items.map((item) => ({
					value: item.id,
					label: item.title || item.slug || item.id,
				}));
				return [collectionId, dedupeReferenceOptions(options)] as const;
			} catch {
				return [collectionId, []] as const;
			}
		})
	);
	return Object.fromEntries(results);
};

const toFieldDefinition = (
	name: string,
	field: unknown,
	required: boolean,
	value: unknown,
	referenceFieldOptions: ReferenceOption[] = []
): EditorFieldDefinition => {
	const kind = getFieldKind(field);
	const inputId = `field-${name.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
	const fallbackText = (() => {
		if (value == null) return '';
		if (kind === 'media-array' && Array.isArray(value)) {
			return value
				.map((entry) => String(entry ?? '').trim())
				.filter(Boolean)
				.join('\n');
		}
		return String(value);
	})();
	const selectOptions = toSelectOptions(field, fallbackText);
	const resolvedKind: FieldKind = kind === 'select' && selectOptions.length === 0 ? 'text' : kind;
	const referenceOptions = (() => {
		if (resolvedKind !== 'reference') return [];
		const options = dedupeReferenceOptions(referenceFieldOptions);
		const mapped = options.map((option) => ({
			value: option.value,
			label: option.label,
			isSelected: option.value === fallbackText,
		}));
		if (fallbackText && !mapped.some((option) => option.value === fallbackText)) {
			mapped.unshift({
				value: fallbackText,
				label: fallbackText,
				isSelected: true,
			});
		}
		return mapped;
	})();
	const valueSelect = fallbackText;
	const valueDate = toDateInputValue(fallbackText);
	const valueDateTime = toDateTimeLocalValue(fallbackText);
	const isJsonKind = resolvedKind === 'json';
	const objectArraySchemaJson = (() => {
		if (resolvedKind !== 'object-array') return '';
		if (!field || typeof field !== 'object' || Array.isArray(field)) return '{}';
		const fieldObj = field as Record<string, unknown>;
		const items = fieldObj.items;
		if (!items || typeof items !== 'object' || Array.isArray(items)) return '{}';
		const itemProperties = (items as Record<string, unknown>).properties;
		if (!itemProperties || typeof itemProperties !== 'object' || Array.isArray(itemProperties)) return '{}';
		return JSON.stringify(itemProperties);
	})();
	const jsonValue = resolvedKind === 'json' || resolvedKind === 'object-array' ? (value == null ? '' : JSON.stringify(value, null, 2)) : '';
	const objectArrayFieldsHint = (() => {
		if (resolvedKind !== 'object-array') return '';
		if (!field || typeof field !== 'object' || Array.isArray(field)) return '(none)';
		const fieldObj = field as Record<string, unknown>;
		const items = fieldObj.items;
		if (!items || typeof items !== 'object' || Array.isArray(items)) return '(none)';
		const itemProperties = (items as Record<string, unknown>).properties;
		if (!itemProperties || typeof itemProperties !== 'object' || Array.isArray(itemProperties)) return '(none)';
		const keys = Object.keys(itemProperties as Record<string, unknown>);
		return keys.length > 0 ? keys.join(', ') : '(none)';
	})();
	const boolValue = typeof value === 'boolean' ? value : String(value ?? '').toLowerCase() === 'true';
	return {
		name,
		label: toFieldLabel(name),
		kind: resolvedKind,
		required,
		valueText: isJsonKind ? '' : fallbackText,
		valueDate,
		valueDateTime,
		valueSelect,
		valueNumber: resolvedKind === 'number' && typeof value === 'number' ? String(value) : '',
		valueJson: jsonValue,
		selectOptions,
		referenceOptions,
		isTrue: boolValue,
		isFalse: !boolValue,
		isText: resolvedKind === 'text',
		isTextarea: resolvedKind === 'textarea',
		isSlug: resolvedKind === 'slug',
		isDate: resolvedKind === 'date',
		isDatetime: resolvedKind === 'datetime',
		isSelect: resolvedKind === 'select',
		isReference: resolvedKind === 'reference',
		isNumber: resolvedKind === 'number',
		isBoolean: resolvedKind === 'boolean',
		isRichtext: resolvedKind === 'richtext',
		isMedia: resolvedKind === 'media' || resolvedKind === 'media-array',
		isMediaArray: resolvedKind === 'media-array',
		isObjectArray: resolvedKind === 'object-array',
		isJson: isJsonKind,
		inputId,
		objectArrayFieldsHint,
		objectArraySchemaJson,
	};
};

const buildFieldDefinitions = async (
	collection: DashboardCollectionOption | undefined,
	dataObject: Record<string, unknown>
): Promise<EditorFieldDefinition[]> => {
	if (!collection) return [];
	const generatedKinds = (collectionFieldKindsMap as Record<string, Record<string, string> | undefined>)[collection.name];
	const generatedRequired = (collectionRequiredFieldsMap as Record<string, readonly string[] | undefined>)[collection.name] ?? [];
	if (generatedKinds && Object.keys(generatedKinds).length > 0) {
		const required = new Set(generatedRequired);
		const generatedSchemaProperties = (collectionSchemaPropertiesMap as Record<string, Record<string, unknown> | undefined>)[
			collection.name
		];
		const fields = Object.entries(generatedKinds).map(([name, fieldKind]) => {
			const schemaField =
				collection.schemaProperties && typeof collection.schemaProperties[name] === 'object'
					? (collection.schemaProperties[name] as Record<string, unknown>)
					: generatedSchemaProperties && typeof generatedSchemaProperties[name] === 'object'
					? (generatedSchemaProperties[name] as Record<string, unknown>)
					: undefined;
			const mergedField = schemaField ? { ...schemaField, type: fieldKind } : fieldKind;
			return { name, mergedField, isRequired: required.has(name) };
		});
		const referenceCollections = Array.from(
			new Set(
				fields
					.filter((field) => getFieldKind(field.mergedField) === 'reference')
					.flatMap((field) => toReferenceCollectionIds(field.mergedField))
			)
		);
		const referenceOptionsByCollection = await loadReferenceOptionsByCollection(referenceCollections);
		return fields.map((field) => {
			const fieldCollections = toReferenceCollectionIds(field.mergedField);
			const referenceFieldOptions = dedupeReferenceOptions(
				fieldCollections.flatMap((collectionId) => referenceOptionsByCollection[collectionId] ?? [])
			);
			return toFieldDefinition(field.name, field.mergedField, field.isRequired, dataObject[field.name], referenceFieldOptions);
		});
	}

	if (!collection.schemaProperties) return [];
	const required = new Set(collection.required ?? []);
	const fields = Object.entries(collection.schemaProperties).map(([name, field]) => ({
		name,
		field,
		isRequired: required.has(name),
	}));
	const referenceCollections = Array.from(
		new Set(fields.filter((entry) => getFieldKind(entry.field) === 'reference').flatMap((entry) => toReferenceCollectionIds(entry.field)))
	);
	const referenceOptionsByCollection = await loadReferenceOptionsByCollection(referenceCollections);
	return fields.map((entry) => {
		const fieldCollections = toReferenceCollectionIds(entry.field);
		const referenceFieldOptions = dedupeReferenceOptions(
			fieldCollections.flatMap((collectionId) => referenceOptionsByCollection[collectionId] ?? [])
		);
		return toFieldDefinition(entry.name, entry.field, entry.isRequired, dataObject[entry.name], referenceFieldOptions);
	});
};

const getCollectionFieldMetadata = (
	collectionOptions: DashboardCollectionOption[],
	collectionValue: string
): { requiredFields: string[]; fieldKinds: Record<string, string> } => {
	const selected = resolveSelectedCollection(collectionOptions, collectionValue);
	const collectionName = selected?.name ?? collectionValue;
	return {
		requiredFields: Array.from(
			(collectionRequiredFieldsMap as Record<string, readonly string[] | undefined>)[collectionName] ?? selected?.required ?? []
		),
		fieldKinds: {
			...(((collectionFieldKindsMap as Record<string, Record<string, string> | undefined>)[collectionName] ?? {}) as Record<
				string,
				string
			>),
		},
	};
};

const isEmptyRequiredValue = (value: unknown, kind: string): boolean => {
	if (kind === 'media-array' || kind === 'array' || kind === 'object-array') {
		return !Array.isArray(value) || value.length === 0;
	}
	if (kind === 'number' || kind === 'integer') {
		return value == null || (typeof value === 'number' && Number.isNaN(value));
	}
	if (kind === 'boolean') {
		return typeof value !== 'boolean';
	}
	if (kind === 'json' || kind === 'object') {
		return value == null;
	}
	if (Array.isArray(value)) return value.length === 0;
	if (typeof value === 'string') return value.trim().length === 0;
	return value == null;
};

const validateRequiredFields = (
	collectionOptions: DashboardCollectionOption[],
	collectionValue: string,
	data: Record<string, unknown>
): string | undefined => {
	const { requiredFields, fieldKinds } = getCollectionFieldMetadata(collectionOptions, collectionValue);
	const ignoredDataKeys = new Set(['title', 'slug', 'status']);
	for (const fieldName of requiredFields) {
		if (ignoredDataKeys.has(fieldName)) continue;
		const value = data[fieldName];
		const kind = String(fieldKinds[fieldName] ?? '');
		if (isEmptyRequiredValue(value, kind)) {
			return `Field "${toFieldLabel(fieldName)}" is required.`;
		}
	}
	return undefined;
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
			if (type === 'object-array') {
				if (value.trim() === '') {
					data[fieldName] = [];
				} else {
					try {
						const parsed = JSON.parse(value);
						if (!Array.isArray(parsed)) {
							return { data, error: `Field "${toFieldLabel(fieldName)}" must be a JSON array.` };
						}
						if (parsed.some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry))) {
							return { data, error: `Field "${toFieldLabel(fieldName)}" must contain only JSON objects.` };
						}
						data[fieldName] = parsed;
					} catch {
						return { data, error: `Field "${toFieldLabel(fieldName)}" must be valid JSON.` };
					}
				}
				continue;
			}
			if (type === 'textarea') {
				data[fieldName] = value;
				continue;
			}
			if (type === 'slug') {
				const normalized = value
					.toLowerCase()
					.trim()
					.replace(/[^a-z0-9-]+/g, '');
				data[fieldName] = normalized;
				continue;
			}
			if (type === 'select' || type === 'date' || type === 'datetime') {
				const normalized = value.trim();
				data[fieldName] = normalized;
				continue;
			}
			if (type === 'reference') {
				const normalized = value.trim();
				data[fieldName] = normalized || null;
				continue;
			}
			if (type === 'media') {
				const normalized = value.trim();
				if (!normalized) {
					data[fieldName] = null;
				} else {
					const firstMediaValue = normalized
						.split(/\r?\n/)
						.map((entry) => entry.trim())
						.find(Boolean);
					data[fieldName] = firstMediaValue ?? null;
				}
				continue;
			}
			if (type === 'media-array') {
				const normalized = value.trim();
				if (!normalized) {
					data[fieldName] = [];
				} else {
					data[fieldName] = normalized
						.split(/\r?\n|,/)
						.map((entry) => entry.trim())
						.filter(Boolean);
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

const resolveCollectionTitle = async (value: string, options?: BackendRequestOptions): Promise<string> => {
	const collectionKey = value.trim();
	if (!collectionKey) return '';
	try {
		const collectionOptions = await loadCollectionOptions(options);
		const selected = collectionOptions.find((item) => item.id === collectionKey || item.name === collectionKey);
		if (!selected) return collectionKey;
		return selected.displayName || selected.name || selected.id;
	} catch {
		return collectionKey;
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

const toAlternateLocalApiBaseUrl = (baseApiUrl: string): string | null => {
	try {
		const current = new URL(baseApiUrl);
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
	backendOptions?: BackendRequestOptions;
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
	const response = await fetchBackend(
		new URL(endpointPath, args.baseUrl).toString(),
		{
			method: 'POST',
			headers: {
				authorization: `Bearer ${args.token}`,
			},
			body: uploadFormData,
		},
		args.backendOptions
	);
	const payload = await parseApiResponseBody(response);
	return { response, payload };
};

const buildMediaApiUrl = (baseUrl: string, mediaId: string): string => new URL(`/api/media/${mediaId}`, baseUrl).toString();
const buildMediaFileUrl = (baseUrl: string, r2Key: string): string => new URL(`/files/${r2Key.replace(/^\/+/, '')}`, baseUrl).toString();

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

const toEditorModel = (item?: DashboardContentItem): EditorViewModel => {
	if (!item) {
		return {
			mode: 'create',
			collectionId: '',
			collectionRouteParam: '',
			title: '',
			slug: '',
			status: 'published',
			dataJson: '{\n  "title": "",\n  "content": ""\n}',
		};
	}
	return {
		mode: 'edit',
		itemId: item.id,
		collectionId: item.collectionId,
		collectionRouteParam: item.collectionId,
		title: item.title,
		slug: item.slug,
		status: item.status,
		dataJson: JSON.stringify(item.data, null, 2),
	};
};

const renderPicker = async (c: Context, user: AuthUser, backendOptions?: BackendRequestOptions): Promise<Response> => {
	const [baseCollections, collectionOptions] = await Promise.all([
		resolveBaseCollections(backendOptions),
		loadCollectionOptionsSafe(backendOptions),
	]);
	return c.html(
		render(collectionPickerTemplate, {
			title: 'Create Content',
			collectionOptions,
			isAuthenticated: true,
			authUser: user,
			user,
			collections: baseCollections,
		})
	);
};

const renderEditor = async (
	c: Context,
	user: AuthUser,
	model: EditorViewModel,
	status: 200 | 400 = 200,
	backendOptions?: BackendRequestOptions
): Promise<Response> => {
	const [baseCollections, collectionOptions] = await Promise.all([
		resolveBaseCollections(backendOptions),
		loadCollectionOptionsSafe(backendOptions),
	]);
	const routeCollection = model.collectionRouteParam || model.collectionId;
	const encodedRouteCollection = encodeURIComponent(routeCollection);
	const selectedCollection = resolveSelectedCollection(collectionOptions, model.collectionId || routeCollection);
	const collectionTitle =
		selectedCollection?.displayName || (await resolveCollectionTitle(model.collectionId || routeCollection, backendOptions));
	const dataObject =
		asObject(
			(() => {
				try {
					return JSON.parse(model.dataJson);
				} catch {
					return {};
				}
			})()
		) ?? {};
	const fieldDefinitions = model.fieldDefinitions ?? (await buildFieldDefinitions(selectedCollection, dataObject));
	const formAction =
		model.mode === 'create' ? `/dashboard/${encodedRouteCollection}/new` : `/dashboard/${encodedRouteCollection}/${model.itemId}`;

	return c.html(
		render(editorTemplate, {
			title: model.mode === 'create' ? 'Create Content' : 'Edit Content',
			pageTitle: model.mode === 'create' ? 'Create Content' : `Edit Content ${model.itemId}`,
			formAction,
			submitLabel: model.mode === 'create' ? 'Create Content' : 'Save Changes',
			collectionId: model.collectionId,
			collectionTitle: collectionTitle || model.collectionId,
			contentTitle: model.title,
			slug: model.slug,
			status: model.status,
			dataJson: model.dataJson,
			fieldDefinitions,
			hasEditorFields: fieldDefinitions.length > 0,
			collectionFolder: selectedCollection?.name ?? 'uploads',
			formError: model.formError,
			formSuccess: model.formSuccess,
			statusOptions: (['draft', 'published', 'archived'] as const).map((value) => ({
				value,
				isSelected: value === model.status,
			})),
			isAuthenticated: true,
			authUser: user,
			user,
			collections: baseCollections,
		}),
		status
	);
};

const loadContentById = async (id: string, backendOptions?: BackendRequestOptions): Promise<DashboardContentItem | null> => {
	const payload = await fetchApiJson<unknown>(`/api/content/${id}`, { method: 'GET' }, undefined, backendOptions);
	return parseContentItemResponse(payload);
};

const resolveCollectionLookupKeys = async (collectionIdOrName: string, backendOptions?: BackendRequestOptions): Promise<Set<string>> => {
	const normalized = collectionIdOrName.trim();
	const keys = new Set<string>();
	if (!normalized) return keys;
	keys.add(normalized);

	try {
		const collections = await sonicGetCollectionsCached(backendOptions);
		const match = collections.find((item) => item.id === normalized || item.name === normalized);
		if (match?.id) keys.add(match.id);
		if (match?.name) keys.add(match.name);
	} catch {
		// Use the provided value only if collection metadata cannot be loaded.
	}

	return keys;
};

const loadContentForCollection = async (collectionId: string, backendOptions?: BackendRequestOptions): Promise<DashboardContentItem[]> => {
	const params = new URLSearchParams();
	params.set('limit', '100');
	params.set('sort', '-updatedAt');
	const payload = await fetchApiJson<unknown>(`/api/content?${params.toString()}`, { method: 'GET' }, undefined, backendOptions);
	const lookupKeys = await resolveCollectionLookupKeys(collectionId, backendOptions);
	return parseContentListResponse(payload).filter((item) => lookupKeys.has(String(item.collectionId || '').trim()));
};

export const registerContentEditorRoutes = (app: Hono): void => {
	const openCreateForCollection = async (c: Context, collectionParam: string): Promise<Response> => {
		const user = c.get('authUser') as AuthUser;
		const backendOptions = resolveBackendRequestOptions(c);
		const resolved = resolveCollectionByRoute(collectionParam);
		const model = toEditorModel();
		model.collectionId = resolved.collectionId;
		model.collectionRouteParam = resolved.routeParam;
		return renderEditor(c, user, model, 200, backendOptions);
	};

	const openCollectionList = async (c: Context, collectionParam: string): Promise<Response> => {
		const user = c.get('authUser') as AuthUser;
		const backendOptions = resolveBackendRequestOptions(c);
		const resolved = resolveCollectionByRoute(collectionParam);
		const baseCollections = await resolveBaseCollections(backendOptions);
		const collectionTitle = await resolveCollectionTitle(resolved.collectionId || resolved.routeParam, backendOptions);
		let items: DashboardContentItem[] = [];
		try {
			items = await loadContentForCollection(resolved.collectionId, backendOptions);
		} catch {
			items = [];
		}
		const collectionListFilters: CollectionListFilters = {
			searchQuery: '',
			status: 'all',
		};

		return c.html(
			render(collectionListTemplate, {
				title: `Collection ${collectionTitle}`,
				pageTitle: `Collection: ${collectionTitle}`,
				pageDescription: 'Manage content items in this collection.',
				hasPrimaryAction: true,
				primaryActionHref: `/dashboard/${encodeURIComponent(resolved.routeParam)}/new`,
				primaryActionLabel: 'New Content',
				navOverviewActive: false,
				navCollectionsActive: true,
				navFollowingActive: false,
				navFeedActive: false,
				collectionPath: encodeURIComponent(resolved.routeParam),
				items: items.map((item) => ({
					...item,
					displayTitle: item.title.trim() || 'Untitled',
					searchText: `${item.title} ${item.slug}`.toLowerCase(),
					statusLower: String(item.status).toLowerCase(),
					updatedAtDisplay: toDateLabel(item.updatedAt),
					collectionPath: encodeURIComponent(resolved.routeParam),
				})),
				hasItems: items.length > 0,
				flashSuccess: c.req.query('saved') === '1' ? 'Content saved.' : undefined,
				flashError: undefined,
				collectionListFilters,
				statusFilterAll: collectionListFilters.status === 'all',
				statusFilterDraft: collectionListFilters.status === 'draft',
				statusFilterPublished: collectionListFilters.status === 'published',
				statusFilterArchived: collectionListFilters.status === 'archived',
				isAuthenticated: true,
				authUser: user,
				user,
				collections: baseCollections,
			})
		);
	};

	const createInCollection = async (c: Context, collectionParam: string): Promise<Response> => {
		const user = c.get('authUser') as AuthUser;
		const token = getToken(c);
		const backendOptions = resolveBackendRequestOptions(c);
		const resolved = resolveCollectionByRoute(collectionParam);
		if (!token) {
			return c.redirect(`/login?redirect=${encodeURIComponent(`/dashboard/${resolved.routeParam}/new`)}`);
		}

		const formData = await c.req.formData();
		const title = String(formData.get('title') ?? '').trim();
		const slug = normalizeSlug(String(formData.get('slug') ?? ''));
		const status = parseContentStatus(String(formData.get('status') ?? 'published'));
		const rawDataJson = String(formData.get('dataJson') ?? '');
		const parsed = parseDataFromForm(formData);
		const legacyCollectionId = String(formData.get('collectionId') ?? '').trim();
		const collectionOptions = await loadCollectionOptionsSafe(backendOptions);
		const requiredError = validateRequiredFields(
			collectionOptions,
			resolved.collectionId || resolved.routeParam || legacyCollectionId,
			parsed.data
		);
		const model: EditorViewModel = {
			mode: 'create',
			collectionId: legacyCollectionId || resolved.collectionId,
			collectionRouteParam: legacyCollectionId || resolved.routeParam,
			title,
			slug,
			status,
			dataJson: parsed.error ? rawDataJson : JSON.stringify(parsed.data, null, 2),
		};

		if (!resolved.collectionId || !title || !slug) {
			return renderEditor(c, user, { ...model, formError: 'Collection, title, and slug are required.' }, 400, backendOptions);
		}
		if (parsed.error) {
			return renderEditor(c, user, { ...model, formError: parsed.error }, 400, backendOptions);
		}
		if (requiredError) {
			return renderEditor(c, user, { ...model, formError: requiredError }, 400, backendOptions);
		}

		try {
			// Backward compatibility: legacy update endpoint posted to /dashboard/content/:id.
			if (legacyCollectionId && legacyCollectionId !== resolved.collectionId) {
				await fetchApiJson<unknown>(
					`/api/content/${resolved.routeParam}`,
					{
						method: 'PUT',
						body: JSON.stringify({
							title,
							slug,
							status,
							data: parsed.data,
						}),
					},
					token,
					backendOptions
				);
				return c.redirect(`/dashboard/${encodeURIComponent(legacyCollectionId)}/${encodeURIComponent(resolved.routeParam)}?saved=1`);
			}

			const createdPayload = await fetchApiJson<unknown>(
				'/api/content',
				{
					method: 'POST',
					body: JSON.stringify({
						collectionId: resolved.collectionId,
						title,
						slug,
						status,
						data: parsed.data,
					}),
				},
				token,
				backendOptions
			);
			const created = parseContentItemResponse(createdPayload);
			if (!created?.id) return c.redirect(`/dashboard/${encodeURIComponent(resolved.routeParam)}?saved=1`);
			const pathCollection = encodeURIComponent(resolved.routeParam || resolved.collectionId);
			return c.redirect(`/dashboard/${pathCollection}/${created.id}?saved=1`);
		} catch (error) {
			const message = error instanceof ContentApiError ? error.message : 'Failed to create content.';
			return renderEditor(c, user, { ...model, formError: message }, 400, backendOptions);
		}
	};

	const openEditForCollection = async (c: Context, collectionParam: string, id: string): Promise<Response> => {
		const user = c.get('authUser') as AuthUser;
		const backendOptions = resolveBackendRequestOptions(c);
		if (!id) return c.html('Content not found', 404);
		try {
			const item = await loadContentById(id, backendOptions);
			if (!item) return c.html('Content not found', 404);
			const model = toEditorModel(item);
			model.collectionRouteParam = collectionParam || item.collectionId;
			model.formSuccess = c.req.query('saved') === '1' ? 'Content saved.' : undefined;
			return renderEditor(c, user, model, 200, backendOptions);
		} catch (error) {
			const message = error instanceof ContentApiError ? error.message : 'Failed to load content item.';
			return c.html(message, 500);
		}
	};

	const updateInCollection = async (c: Context, collectionParam: string, id: string): Promise<Response> => {
		const user = c.get('authUser') as AuthUser;
		const token = getToken(c);
		const backendOptions = resolveBackendRequestOptions(c);
		if (!token) return c.redirect(`/login?redirect=${encodeURIComponent(c.req.path)}`);

		const resolved = resolveCollectionByRoute(collectionParam);
		const formData = await c.req.formData();
		const title = String(formData.get('title') ?? '').trim();
		const slug = normalizeSlug(String(formData.get('slug') ?? ''));
		const status = parseContentStatus(String(formData.get('status') ?? 'published'));
		const rawDataJson = String(formData.get('dataJson') ?? '');
		const parsed = parseDataFromForm(formData);
		const collectionOptions = await loadCollectionOptionsSafe(backendOptions);
		const requiredError = validateRequiredFields(collectionOptions, resolved.collectionId || resolved.routeParam, parsed.data);
		const model: EditorViewModel = {
			mode: 'edit',
			itemId: id,
			collectionId: resolved.collectionId,
			collectionRouteParam: resolved.routeParam,
			title,
			slug,
			status,
			dataJson: parsed.error ? rawDataJson : JSON.stringify(parsed.data, null, 2),
		};

		if (!title || !slug) return renderEditor(c, user, { ...model, formError: 'Title and slug are required.' }, 400, backendOptions);
		if (parsed.error) return renderEditor(c, user, { ...model, formError: parsed.error }, 400, backendOptions);
		if (requiredError) return renderEditor(c, user, { ...model, formError: requiredError }, 400, backendOptions);

		try {
			await fetchApiJson<unknown>(
				`/api/content/${id}`,
				{
					method: 'PUT',
					body: JSON.stringify({
						title,
						slug,
						status,
						data: parsed.data,
					}),
				},
				token,
				backendOptions
			);
			const pathCollection = encodeURIComponent(resolved.routeParam || resolved.collectionId);
			return c.redirect(`/dashboard/${pathCollection}/${id}?saved=1`);
		} catch (error) {
			const message = error instanceof ContentApiError ? error.message : 'Failed to update content.';
			return renderEditor(c, user, { ...model, formError: message }, 400, backendOptions);
		}
	};

	app.get('/dashboard/content/new', requireAuth, async (c) => {
		const user = c.get('authUser') as AuthUser;
		const backendOptions = resolveBackendRequestOptions(c);
		return renderPicker(c, user, backendOptions);
	});

	app.get('/dashboard/content/:collection/new', requireAuth, async (c) => {
		return openCreateForCollection(c, String(c.req.param('collection') ?? ''));
	});

	app.get('/dashboard/content/:collection', requireAuth, async (c) => {
		return openCollectionList(c, String(c.req.param('collection') ?? ''));
	});

	app.post('/dashboard/content/:collection', requireAuth, async (c) => {
		return createInCollection(c, String(c.req.param('collection') ?? ''));
	});

	app.post('/dashboard/content', requireAuth, async (c) => {
		const formData = await c.req.formData();
		const collectionId = String(formData.get('collectionId') ?? '').trim();
		if (!collectionId) {
			return c.redirect('/dashboard/content/new');
		}
		return c.redirect(`/dashboard/${encodeURIComponent(collectionId)}`);
	});

	app.get('/dashboard/content/:collection/:id', requireAuth, async (c) => {
		return openEditForCollection(c, String(c.req.param('collection') ?? ''), String(c.req.param('id') ?? ''));
	});

	app.post('/dashboard/content/:collection/:id', requireAuth, async (c) => {
		return updateInCollection(c, String(c.req.param('collection') ?? ''), String(c.req.param('id') ?? ''));
	});

	app.get('/dashboard/:collection', requireAuth, async (c) => {
		return openCollectionList(c, String(c.req.param('collection') ?? ''));
	});

	app.get('/dashboard/:collection/new', requireAuth, async (c) => {
		return openCreateForCollection(c, String(c.req.param('collection') ?? ''));
	});

	app.post('/dashboard/:collection/new', requireAuth, async (c) => {
		return createInCollection(c, String(c.req.param('collection') ?? ''));
	});

	app.post('/dashboard/:collection', requireAuth, async (c) => {
		return createInCollection(c, String(c.req.param('collection') ?? ''));
	});

	app.get('/dashboard/:collection/:id', requireAuth, async (c) => {
		return openEditForCollection(c, String(c.req.param('collection') ?? ''), String(c.req.param('id') ?? ''));
	});

	app.post('/dashboard/media/upload', async (c) => {
		const token = getToken(c);
		if (!token) return c.json({ error: 'Unauthorized' }, 401);
		const backendOptions = resolveBackendRequestOptions(c);
		const mediaApiBaseUrl = process.env.MEDIA_API_URL ?? backendOptions.apiBaseUrl ?? MEDIA_API_BASE_URL;

		let formData: FormData;
		try {
			formData = await c.req.formData();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unable to parse multipart form data';
			return c.json(
				{
					error: 'Invalid upload request body',
					details: message,
					targetApiBaseUrl: mediaApiBaseUrl,
				},
				400
			);
		}
		const fileValue = formData.get('file') ?? formData.get('files');
		const file = fileValue instanceof File ? fileValue : null;
		const folder = String(formData.get('folder') ?? 'uploads').trim() || 'uploads';
		if (!file) {
			return c.json(
				{
					error: 'No file provided',
					details: 'Expected multipart field "file" or "files".',
					targetApiBaseUrl: mediaApiBaseUrl,
				},
				400
			);
		}

		const baseCandidates = [mediaApiBaseUrl];
		const alternateLocal = toAlternateLocalApiBaseUrl(mediaApiBaseUrl);
		if (alternateLocal) baseCandidates.push(alternateLocal);

		let lastPayload: Record<string, unknown> = { error: 'Media upload failed' };
		let lastStatus = 500;
		const attempts: Array<Record<string, unknown>> = [];

		for (const baseUrl of baseCandidates) {
			try {
				const single = await uploadMediaViaApi({ token, file, folder, baseUrl, backendOptions });
				attempts.push({
					baseUrl,
					endpoint: '/api/media/upload',
					status: single.response.status,
					error: single.payload.error,
					message: single.payload.message,
					details: single.payload.details,
				});
				if (single.response.ok) return c.json(normalizeMediaUploadPayload(single.payload, baseUrl), 200);
				lastPayload = single.payload;
				lastStatus = single.response.status;

				// Try alternate upload endpoint regardless of initial error code.
				const multiple = await uploadMediaViaApi({ token, file, folder, baseUrl, useMultipleEndpoint: true, backendOptions });
				attempts.push({
					baseUrl,
					endpoint: '/api/media/upload-multiple',
					status: multiple.response.status,
					error: multiple.payload.error,
					message: multiple.payload.message,
					details: multiple.payload.details,
				});
				if (multiple.response.ok) {
					const normalized = normalizeMediaUploadPayload(multiple.payload, baseUrl);
					const uploadedFiles = Array.isArray(normalized.uploaded) ? normalized.uploaded : [];
					const files = Array.isArray(normalized.files) ? normalized.files : uploadedFiles;
					const first = (files[0] && typeof files[0] === 'object' ? files[0] : null) as Record<string, unknown> | null;
					return c.json(first ? { ...normalized, success: true, file: first, files } : normalized, 200);
				}
				lastPayload = multiple.payload;
				lastStatus = multiple.response.status;
			} catch {
				attempts.push({
					baseUrl,
					endpoint: 'network-error',
					status: 502,
				});
				lastPayload = { error: `Upload request failed for ${baseUrl}` };
				lastStatus = 502;
			}
		}

		const errorMessage =
			typeof lastPayload.error === 'string'
				? lastPayload.error
				: typeof lastPayload.message === 'string'
				? lastPayload.message
				: 'Media upload failed';
		return c.json(
			{
				error: errorMessage,
				details: lastPayload.details,
				attempts,
				lastPayload,
				targetApiBaseUrl: mediaApiBaseUrl,
			},
			lastStatus as 400 | 401 | 403 | 404 | 405 | 413 | 500 | 502
		);
	});

	// Keep this legacy catch-all last so it does not swallow specific /dashboard/* endpoints like /dashboard/media/upload.
	app.post('/dashboard/:collection/:id', requireAuth, async (c) => {
		return updateInCollection(c, String(c.req.param('collection') ?? ''), String(c.req.param('id') ?? ''));
	});
};
