---
name: react-patterns
description: React component patterns, hooks, state management, performance, and common pitfalls
brain_region: cerebellum
weight: 1.0
tags: [react, hooks, jsx, tsx, frontend, state, performance]
when_to_use: |
  When building, reviewing, or debugging React components: hooks usage,
  state management, re-render performance, component composition,
  context, refs, or handling effects and cleanup.
---
# React Component Patterns

## Component Design
- **Prefer function components** — class components are legacy; hooks cover everything.
- **Single responsibility** — if a component fetches, transforms, and renders, split it.
- **Composition over configuration** — pass children or render props instead of growing prop lists.
- Keep UI components (presentational) separate from data-fetching containers.

## Hooks Rules & Patterns
- Hooks must be called at the top level — never inside conditions, loops, or callbacks.
- `useState` for local UI state; `useReducer` when state transitions are complex.
- `useEffect` for synchronizing with external systems (timers, sockets, DOM). Every effect must clean up if it subscribes.
- `useMemo` — memoize expensive computations. Only when profiling shows it helps.
- `useCallback` — memoize callbacks passed to child components that use `React.memo`.
- `useRef` — stable mutable value across renders without triggering re-renders (DOM refs, timers, previous values).
- `useContext` — avoid prop drilling but not a substitute for proper state management at scale.

## Custom Hooks
Extract repeated stateful logic:
```ts
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
```

## Performance
- `React.memo(Component)` — skip re-render if props are shallow-equal.
- Measure first with React DevTools Profiler before memoizing.
- Avoid creating objects/arrays/functions inline in JSX — they break memo.
- State colocation: keep state as close to its consumer as possible to limit re-render scope.
- Use `key` prop correctly — never use array index as key for reorderable lists.

## State Management
- Local state: `useState` / `useReducer`.
- Shared UI state: Context + useReducer; fine for low-frequency updates.
- Server state (async data): use a library (TanStack Query, SWR) rather than raw useEffect for fetching — handles caching, deduplication, and refetch.
- Global client state: Zustand or Jotai for simple cases; avoid Redux unless you need time-travel debugging.

## Common Pitfalls
- **Stale closures** — effect captures old state; always include all dependencies in the dependency array.
- **Infinite effect loop** — object/function in deps array changes on every render; memoize it or restructure.
- **Missing cleanup** — timers, subscriptions, event listeners left behind cause memory leaks.
- **Conditional hooks** — extracting to a component is the fix, not adding a condition inside the hook call.
- **Direct state mutation** — always return new objects/arrays; never `arr.push()` + `setState(arr)`.

## Guardrails
- Run `react-hooks/exhaustive-deps` lint rule; don't suppress it.
- Don't put side effects in render — only in `useEffect` or event handlers.
- Prefer controlled components (value + onChange) over uncontrolled (ref) for form inputs unless performance demands it.
