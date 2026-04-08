export const collectionInstructionsTemplate = /* html */ `
<section class="space-y-4">
  <header class="border border-gray-300 p-4">
    <p class="text-sm text-gray-600">Mustache Instructions</p>
    <h1 class="text-2xl font-semibold">{{displayName}}</h1>
    <p class="mt-2 text-sm text-gray-700">{{description}}</p>
  </header>

  <section class="border border-gray-300 p-4">
    <h2 class="text-lg font-semibold">Quick Start</h2>
    <pre class="mt-2 overflow-x-auto border border-gray-200 bg-gray-50 p-3 text-sm">&lt;h1&gt;&#123;&#123;data.title&#125;&#125;&lt;/h1&gt;
&lt;p&gt;&#123;&#123;slug&#125;&#125;&lt;/p&gt;</pre>
  </section>

  <section class="border border-gray-300 p-4">
    <h2 class="text-lg font-semibold">Fields</h2>
    <ul class="mt-3 space-y-2">
      {{#fields}}
      <li class="border border-gray-200 p-3">
        <p><strong>{{name}}</strong> ({{kind}})</p>
        <p class="mt-1 text-sm">Value token: <code>{{{valueToken}}}</code></p>
        {{#isRichText}}
        <p class="mt-1 text-sm">HTML token: <code>{{{htmlToken}}}</code></p>
        {{/isRichText}}
      </li>
      {{/fields}}
    </ul>
  </section>
</section>
`;
