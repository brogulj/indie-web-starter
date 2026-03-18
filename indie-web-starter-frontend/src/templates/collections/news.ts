export const NewsTemplate = /* html */ `
<article class="space-y-4 border border-gray-300 p-4">
  <h1 class="text-2xl font-semibold">{{{data.titleHtml}}}{{^data.titleHtml}}{{{titleHtml}}}{{^titleHtml}}{{data.title}}{{^data.title}}{{title}}{{/data.title}}{{/titleHtml}}{{/data.titleHtml}}</h1>
  <p class="text-sm text-gray-600">/news/{{slug}}</p>
  <section class="space-y-3">
    {{#fields}}
    <article class="border border-gray-200 p-3">
      <p class="mb-1 text-sm font-semibold">{{label}}</p>
      {{#isRichText}}<div>{{{htmlValue}}}</div>{{/isRichText}}
      {{^isRichText}}<pre class="whitespace-pre-wrap text-sm">{{textValue}}</pre>{{/isRichText}}
    </article>
    {{/fields}}
  </section>
</article>
`;
