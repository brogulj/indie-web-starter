export const collectionContentTemplate = /* html */ `
<article class="space-y-4 border border-gray-300 p-4">
  <header>
    <p class="text-sm text-gray-600">{{collection}}</p>
    <h1 class="text-2xl font-semibold">{{{data.titleHtml}}}{{^data.titleHtml}}{{{titleHtml}}}{{^titleHtml}}{{data.title}}{{^data.title}}{{title}}{{/data.title}}{{/titleHtml}}{{/data.titleHtml}}</h1>
    <p class="mt-1 text-sm text-gray-600">/{{collection}}/{{slug}}</p>
  </header>

  <section class="grid gap-2 text-sm">
    <p><strong>Status:</strong> {{status}}</p>
    <p><strong>Created:</strong> {{createdAt}}</p>
    <p><strong>Updated:</strong> {{updatedAt}}</p>
  </section>

  <section class="space-y-3">
    {{#fields}}
    <article class="border border-gray-200 p-3">
      <p class="mb-2 text-sm font-semibold">{{label}}</p>
      {{#isRichText}}
      <div>{{{htmlValue}}}</div>
      {{/isRichText}}
      {{^isRichText}}
      <pre class="whitespace-pre-wrap break-words text-sm">{{textValue}}</pre>
      {{/isRichText}}
    </article>
    {{/fields}}
  </section>
</article>
`;
