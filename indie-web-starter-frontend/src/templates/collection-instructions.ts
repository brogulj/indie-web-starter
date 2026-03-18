export const collectionInstructionsTemplate = /* html */ `
<main class="mx-auto w-full max-w-5xl px-2 py-3 sm:px-4 sm:py-6">
  <section class="border-4 border-stone-900 bg-amber-50 p-4 shadow-[8px_8px_0_0_#1c1917] sm:p-6">
    <p class="inline-block border-2 border-stone-900 bg-amber-200 px-2 py-1 font-mono text-xs font-bold uppercase tracking-[0.18em]">
      Mustache Instructions
    </p>
    <h1 class="mt-3 font-['Courier_New',ui-monospace,monospace] text-3xl font-black uppercase leading-tight text-stone-900 sm:text-5xl">
      {{displayName}}
    </h1>
    <p class="mt-2 font-mono text-xs uppercase tracking-[0.13em] text-stone-700">
      Collection: {{collection}}
    </p>
    <p class="mt-3 max-w-3xl font-serif text-stone-700">{{description}}</p>
  </section>

  <section class="mt-4 border-2 border-stone-900 bg-white p-4">
    <h2 class="font-['Courier_New',ui-monospace,monospace] text-xl font-black uppercase text-stone-900">Quick Start</h2>
    <pre class="mt-3 overflow-x-auto border border-stone-900 bg-stone-900 p-3 font-mono text-xs leading-6 text-amber-100">
&lt;h1&gt;&#123;&#123;data.title&#125;&#125;&lt;/h1&gt;
&lt;p&gt;Slug: &#123;&#123;slug&#125;&#125;&lt;/p&gt;
&lt;!-- Richtext fields use rendered HTML companion keys --&gt;
&lt;section&gt;&#123;&#123;&#123;data.contentHtml&#125;&#125;&#125;&lt;/section&gt;
    </pre>
  </section>

  <section class="mt-4 border-4 border-stone-900 bg-amber-50 p-4 shadow-[6px_6px_0_0_#1c1917]">
    <h2 class="font-['Courier_New',ui-monospace,monospace] text-2xl font-black uppercase text-stone-900">Available Fields</h2>
    <div class="mt-4 grid gap-3">
      {{#fields}}
      <article class="border-2 border-stone-900 bg-white p-3">
        <p class="font-mono text-xs font-bold uppercase tracking-[0.13em] text-stone-700">{{name}} · {{kind}}</p>
        <p class="mt-2 font-mono text-sm text-stone-900">
          <b>Value:</b> <code>{{{valueToken}}}</code>
        </p>
        {{#isRichText}}
        <p class="mt-1 font-mono text-sm text-stone-900">
          <b>Rendered HTML:</b> <code>{{{htmlToken}}}</code>
        </p>
        {{/isRichText}}
        {{#isArray}}
        <div class="mt-2">
          <p class="font-mono text-sm text-stone-900"><b>Loop Example:</b></p>
          <pre class="mt-1 overflow-x-auto border border-stone-900 bg-stone-900 p-3 font-mono text-xs leading-6 text-amber-100">{{{arrayLoopExample}}}</pre>
          <p class="mt-2 font-serif text-sm text-stone-700">{{{arrayLoopHelp}}}</p>
        </div>
        {{/isArray}}
      </article>
      {{/fields}}
    </div>
  </section>

  <section class="mt-4 border-2 border-stone-900 bg-white p-4">
    <h2 class="font-['Courier_New',ui-monospace,monospace] text-xl font-black uppercase text-stone-900">Notes</h2>
    <ul class="mt-3 ml-6 list-disc space-y-2 font-serif text-stone-700">
      <li>Entry metadata is available at top-level keys like <code>&#123;&#123;id&#125;&#125;</code>, <code>&#123;&#123;slug&#125;&#125;</code>, and <code>&#123;&#123;status&#125;&#125;</code>.</li>
      <li>Collection data fields are under <code>&#123;&#123;data.fieldName&#125;&#125;</code>.</li>
      <li>Richtext fields are automatically converted to <code>&#123;&#123;&#123;data.fieldNameHtml&#125;&#125;&#125;</code>.</li>
      <li>Array fields can be looped with <code>&#123;&#123;#data.arrayField&#125;&#125;...&#123;&#123;/data.arrayField&#125;&#125;</code>.</li>
    </ul>
  </section>
</main>
`;
