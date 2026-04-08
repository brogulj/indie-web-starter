export const base = (content: string) => /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}}</title>
  <link rel="webmention" href="{{webmentionEndpoint}}{{^webmentionEndpoint}}/webmention{{/webmentionEndpoint}}">
  <link rel="stylesheet" href="/output.css">
</head>
<body class="bg-white text-black">
  <header class="mx-auto w-full max-w-5xl px-4 py-6">
    <nav class="border border-gray-300 bg-gray-50 p-4">
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <div class="flex flex-wrap items-center gap-2">
          <a href="/" class="px-2 py-1 text-black underline">Home</a>
        </div>
        <div class="ml-auto flex flex-wrap items-center justify-end gap-2">
        {{#isAuthenticated}}
          <a href="/dashboard/following/feed" class="px-2 py-1 text-black underline">Feed</a>
          <a href="/dashboard" class="px-2 py-1 text-black underline">Dashboard</a>
          <form method="post" action="/logout" class="inline">
            <button type="submit" class="px-2 py-1 text-black underline">Logout</button>
          </form>
          {{/isAuthenticated}}
          {{^isAuthenticated}}
          <a href="/login" class="px-2 py-1 text-black underline">Login</a>
          {{/isAuthenticated}}
        </div>
      </div>
    </nav>
  </header>

  <main class="mx-auto w-full max-w-5xl px-4 pb-10">
    {{#routeWarning}}
    <section class="mb-4 border border-yellow-400 bg-yellow-50 p-3 text-sm">
      {{routeWarning}}
    </section>
    {{/routeWarning}}
    ${content}
  </main>
</body>
</html>
`;

export const requiredData = {
	collections: [],
};
