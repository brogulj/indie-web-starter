export const defaultCollectionArchiveTemplate = /* html */ `
<main class="mx-auto w-full max-w-5xl px-2 py-3 sm:px-4 sm:py-6">
  <section class="border-4 border-stone-900 bg-amber-50 p-4 shadow-[8px_8px_0_0_#1c1917] sm:p-6">
    <p class="inline-block border-2 border-stone-900 bg-amber-200 px-2 py-1 font-mono text-xs font-bold uppercase tracking-[0.18em]">
      Collection Archive
    </p>
    <h1 class="mt-3 font-['Courier_New',ui-monospace,monospace] text-3xl font-black uppercase leading-tight sm:text-5xl">
      {{collection}}
    </h1>
    <p class="mt-3 font-serif text-stone-700">All entries currently available in this collection.</p>
  </section>

  <section class="mt-4 grid gap-3">
    {{#items}}
    <article class="border-2 border-stone-900 bg-white p-4 shadow-[4px_4px_0_0_#1c1917]">
      <a href="/{{collection}}/{{slug}}" class="block">
        <h2 class="font-['Courier_New',ui-monospace,monospace] text-xl font-black uppercase text-stone-900">
          {{title}}
        </h2>
      </a>
      <p class="mt-2 font-mono text-xs uppercase tracking-[0.13em] text-stone-700">
        {{status}} · {{updatedAt}}
      </p>
    </article>
    {{/items}}

    {{^items}}
    <article class="border-2 border-stone-900 bg-white p-4">
      <p class="font-mono text-sm uppercase tracking-[0.12em] text-stone-700">No entries found.</p>
    </article>
    {{/items}}
  </section>
</main>
`;
