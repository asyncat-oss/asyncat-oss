---
name: nextjs-patterns
description: Next.js App Router patterns — server components, server actions, routing, caching, and deployment
brain_region: cerebellum
weight: 1.1
tags: [nextjs, react, app-router, server-components, typescript, frontend]
when_to_use: |
  When working in a Next.js project using the App Router (next 13+):
  implementing pages, layouts, server actions, API routes, middleware,
  caching strategies, or debugging hydration and build issues.
---
# Next.js App Router Patterns

## Mental Model
- **Server Components** render on the server, have no state, can `await` directly, access DB/secrets. Default in App Router.
- **Client Components** (`'use client'`) run in the browser, have state/hooks, cannot `await` top-level.
- **Server Actions** (`'use server'`) are async functions that run on the server, called from client or server components. Use for mutations.

## Routing
- `app/page.tsx` — route segment; `layout.tsx` — wraps children; `loading.tsx` — Suspense fallback; `error.tsx` — error boundary; `not-found.tsx` — 404.
- Dynamic: `app/posts/[slug]/page.tsx`. Catch-all: `app/[...slug]`. Parallel routes: `@slot`.
- `generateStaticParams()` exports from a page for static generation of dynamic routes.

## Data Fetching
- Fetch in Server Components: `const data = await fetch(url, { next: { revalidate: 60 } })`.
- Default: cached. `cache: 'no-store'` for always-fresh. `next.revalidate` for ISR.
- For DB queries: call directly in Server Component — no API layer needed.
- Avoid fetching in Client Components unless it's client-only realtime data.

## Server Actions
```ts
// app/actions.ts
'use server';
import { revalidatePath } from 'next/cache';

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string;
  await db.insert({ title });
  revalidatePath('/posts');
}
```
- Bind actions: `<form action={createPost}>` — works without JS.
- Use `useFormState` / `useFormStatus` for loading/error state in Client Components.

## Caching & Revalidation
- `revalidatePath('/path')` — invalidate cached page after mutation.
- `revalidateTag('posts')` — invalidate by tag across routes.
- `unstable_cache` — wrap DB queries with a cache tag.
- Avoid over-caching: dynamic data should use `no-store` or short revalidation.

## Common Pitfalls
- **Importing server code in client components** — move DB/secret access to Server Components or Server Actions.
- **Serialization errors** — you cannot pass non-serializable values (class instances, functions) from Server → Client as props.
- **Hydration mismatch** — Date, Math.random(), or browser APIs in server render cause mismatch; wrap in `useEffect` or `dynamic(() => ..., { ssr: false })`.
- **Missing Suspense** — async Server Components inside Client Components need `<Suspense>` boundary.

## Guardrails
- Keep Server/Client boundary explicit — don't mix concerns in one file.
- Read `next/headers` only in Server Components or Server Actions.
- Never expose secret env vars without `NEXT_PUBLIC_` prefix in client code.
- Test static export compatibility with `output: 'export'` if needed.
