export const NewsTemplate = /* html */ `
<main class="mx-auto w-full max-w-5xl px-2 py-4">
  <article class="border-4 border-stone-900 bg-amber-50 p-4 shadow-[8px_8px_0_0_#1c1917] sm:p-6">
    <p class="inline-block border-2 border-stone-900 bg-amber-200 px-2 py-1 font-mono text-xs font-bold uppercase tracking-[0.18em]">
      news
    </p>
    <h1 class="mt-3 font-['Courier_New',ui-monospace,monospace] text-3xl font-black uppercase leading-tight text-stone-900 sm:text-5xl">
      {{data.title}}{{^data.title}}{{title}}{{/data.title}}
    </h1>
    <p class="mt-2 font-mono text-xs uppercase tracking-[0.13em] text-stone-700">
      /news/{{slug}}
    </p>

    <section class="mt-5 grid gap-3">
      {{#fields}}
      <article class="border-2 border-stone-900 bg-white p-3">
        <p class="mb-2 font-mono text-xs font-bold uppercase tracking-[0.12em] text-stone-700">{{label}}</p>
        {{#isRichText}}
        <div>{{{htmlValue}}}</div>
        {{/isRichText}}
        {{^isRichText}}
        <pre class="whitespace-pre-wrap break-words font-mono text-sm text-stone-800">{{textValue}}</pre>
        {{/isRichText}}
      </article>
      {{/fields}}
    </section>
  </article>
</main>
`;
