export const EventsTemplate = /* html */ `
<main class="mx-auto max-w-3xl p-4">
  <article class="h-entry space-y-4 rounded border border-gray-300 bg-white p-4">
    <p class="text-xs uppercase tracking-wide text-gray-600">
      events
    </p>
    <h1 class="p-name text-2xl font-semibold text-gray-900">
      {{data.title}}{{^data.title}}{{title}}{{/data.title}}
    </h1>
    <p class="text-sm text-gray-600">
      <a class="u-url hover:underline" href="/events/{{slug}}">/events/{{slug}}</a>
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
`;
