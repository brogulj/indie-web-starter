export const OutboundWebmentionsTemplate = /* html */ `
<main class="mx-auto max-w-3xl p-4">
  <article class="h-entry space-y-5 rounded-2xl border border-gray-300 bg-white p-5">
    <header class="space-y-2">
      <p class="text-xs uppercase tracking-wide text-gray-500">Outbound Webmention</p>
      <h1 class="p-name text-2xl font-semibold text-gray-900">{{{data.titleHtml}}}{{^data.titleHtml}}{{{titleHtml}}}{{^titleHtml}}{{data.title}}{{^data.title}}{{title}}{{/data.title}}{{/titleHtml}}{{/data.titleHtml}}</h1>
      <p class="text-sm text-gray-600"><a class="u-url hover:underline" href="/outbound-webmentions/{{slug}}">/outbound-webmentions/{{slug}}</a></p>
      <p class="h-card text-sm text-gray-600"><a class="p-name u-url hover:underline" href="{{siteAuthorUrl}}">{{siteAuthorName}}</a></p>
    </header>

    <section class="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-700">Action</h2>
      {{#isLike}}<p>Liked <a class="u-like-of underline" href="{{data.targetUrl}}" target="_blank" rel="noopener noreferrer">{{data.targetUrl}}</a>.</p>{{/isLike}}
      {{#isReply}}<p>Replied to <a class="u-in-reply-to underline" href="{{data.targetUrl}}" target="_blank" rel="noopener noreferrer">{{data.targetUrl}}</a>.</p>{{/isReply}}
      {{#isMention}}<p>Mentioned <a class="u-mention-of underline" href="{{data.targetUrl}}" target="_blank" rel="noopener noreferrer">{{data.targetUrl}}</a>.</p>{{/isMention}}
      {{#data.targetTitle}}<p><strong>Target title:</strong> {{data.targetTitle}}</p>{{/data.targetTitle}}
    </section>

    <section class="grid gap-2 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700 sm:grid-cols-2">
      <h2 class="sm:col-span-2 text-sm font-semibold uppercase tracking-wide text-gray-700">Delivery</h2>
      <p><strong>Type:</strong> {{data.mentionType}}</p>
      <p><strong>Status:</strong> {{data.deliveryStatus}}</p>
      <p><strong>Attempted:</strong> {{data.attemptedAt}}{{^data.attemptedAt}}-{{/data.attemptedAt}}</p>
      <p><strong>HTTP:</strong> {{data.responseStatusCode}}{{^data.responseStatusCode}}-{{/data.responseStatusCode}}</p>
      {{#data.errorMessage}}<p class="sm:col-span-2 text-red-700"><strong>Error:</strong> {{data.errorMessage}}</p>{{/data.errorMessage}}
    </section>

    <section class="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-700">Links</h2>
      <p><strong>Source:</strong> <a class="u-url underline" href="{{data.sourceUrl}}" target="_blank" rel="noopener noreferrer">{{data.sourceUrl}}</a></p>
      <p><strong>Target:</strong> <a class="{{data.mf2PropertyClass}} underline" href="{{data.targetUrl}}" target="_blank" rel="noopener noreferrer">{{data.targetUrl}}</a></p>
      {{#data.endpointUrl}}<p><strong>Endpoint:</strong> <a class="underline" href="{{data.endpointUrl}}" target="_blank" rel="noopener noreferrer">{{data.endpointUrl}}</a></p>{{/data.endpointUrl}}
      <p><strong>Source Collection:</strong> {{data.sourceCollection}}{{^data.sourceCollection}}-{{/data.sourceCollection}}</p>
      <p><strong>Source Slug:</strong> {{data.sourceSlug}}{{^data.sourceSlug}}-{{/data.sourceSlug}}</p>
    </section>

    {{#isReply}}
    {{#data.commentText}}
    <section class="e-content space-y-2 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-800">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-700">Reply Text</h2>
      <p class="whitespace-pre-wrap break-words">{{data.commentText}}</p>
    </section>
    {{/data.commentText}}
    {{/isReply}}
  </article>
</main>
`;
