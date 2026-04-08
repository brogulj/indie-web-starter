export const OutboundWebmentionsTemplate = /* html */ `
<main class="mx-auto max-w-2xl p-4">
  <article class="h-entry space-y-4 rounded-2xl border border-gray-300 bg-white p-5">
    <p class="text-xs uppercase tracking-wide text-gray-600">outbound webmention</p>
    <h1 class="p-name text-2xl font-semibold text-gray-900">
      {{data.title}}{{^data.title}}{{title}}{{/data.title}}
    </h1>
    <p class="text-sm text-gray-600">
      <a class="u-url hover:underline" href="/outbound-webmentions/{{slug}}">/outbound-webmentions/{{slug}}</a>
    </p>
    <p class="h-card text-sm text-gray-600">
      <a class="p-name u-url hover:underline" href="{{siteAuthorUrl}}">{{siteAuthorName}}</a>
    </p>

    <section class="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-900">
      {{#isLike}}
      <p>I liked <a class="u-like-of underline" href="{{data.targetUrl}}" target="_blank" rel="noopener noreferrer">{{data.targetUrl}}</a>.</p>
      {{/isLike}}
      {{#isReply}}
      <p>I replied to <a class="u-in-reply-to underline" href="{{data.targetUrl}}" target="_blank" rel="noopener noreferrer">{{data.targetUrl}}</a>.</p>
      {{/isReply}}
      {{#isMention}}
      <p>I mentioned <a class="u-mention-of underline" href="{{data.targetUrl}}" target="_blank" rel="noopener noreferrer">{{data.targetUrl}}</a>.</p>
      {{/isMention}}
    </section>

    <section class="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
      <p><strong>Type:</strong> {{data.mentionType}}</p>
      <p><strong>Status:</strong> {{data.deliveryStatus}}</p>
      <p><strong>Attempted:</strong> {{data.attemptedAt}}</p>
      {{#data.responseStatusCode}}<p><strong>HTTP:</strong> {{data.responseStatusCode}}</p>{{/data.responseStatusCode}}
      {{#data.errorMessage}}<p class="text-red-700"><strong>Error:</strong> {{data.errorMessage}}</p>{{/data.errorMessage}}
    </section>

    <section class="space-y-2 text-sm">
      <p><strong>Source:</strong> <a class="u-url underline" href="{{data.sourceUrl}}" target="_blank" rel="noopener noreferrer">{{data.sourceUrl}}</a></p>
      {{#data.endpointUrl}}<p><strong>Endpoint:</strong> <a class="underline" href="{{data.endpointUrl}}" target="_blank" rel="noopener noreferrer">{{data.endpointUrl}}</a></p>{{/data.endpointUrl}}
      {{#data.targetUrl}}
      <p><strong>Target:</strong>
        <a class="{{data.mf2PropertyClass}} underline" href="{{data.targetUrl}}" target="_blank" rel="noopener noreferrer">{{data.targetUrl}}</a>
      </p>
      {{/data.targetUrl}}
    </section>

    {{#isReply}}
    {{#data.commentText}}
    <section class="e-content rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-800">
      {{data.commentText}}
    </section>
    {{/data.commentText}}
    {{/isReply}}
  </article>
</main>
`;
