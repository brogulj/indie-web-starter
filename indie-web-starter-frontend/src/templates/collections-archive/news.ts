export const NewsArchiveTemplate = /* html */ `
<main class="mx-auto w-full max-w-5xl px-2 py-4">
  <section class="border-4 border-stone-900 bg-amber-50 p-4 shadow-[8px_8px_0_0_#1c1917] sm:p-6">
    <p class="inline-block border-2 border-stone-900 bg-rose-200 px-2 py-1 font-mono text-xs font-bold uppercase tracking-[0.18em]">
      news archive
    </p>
    <h1 class="mt-3 font-['Courier_New',ui-monospace,monospace] text-3xl font-black uppercase leading-tight text-stone-900 sm:text-5xl">
      {{collection}}
    </h1>
  </section>

  <section class="mt-4 grid gap-3">
    {{#items}}
    <article class="border-2 border-stone-900 bg-white p-4">
      <a href="/{{collection}}/{{slug}}" class="block">
        <h2 class="font-['Courier_New',ui-monospace,monospace] text-xl font-black uppercase text-stone-900">{{title}}</h2>
      </a>
      <p class="mt-2 font-mono text-xs uppercase tracking-[0.13em] text-stone-700">{{status}} · {{updatedAt}}</p>
    </article>
    {{/items}}
  </section>
</main>
`;
