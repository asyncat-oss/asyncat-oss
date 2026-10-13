// Placeholder shaped like a conversation (a user bubble, then an answer)
// while a saved chat loads.
export default function ConversationLoadingSkeleton() {
  return (
    <div className="flex h-full flex-col bg-canvas" role="status" aria-label="Loading conversation">
      <div className="shrink-0 border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-3.5 md:px-6">
          <div className="h-4 w-48 animate-pulse rounded-md bg-hover" />
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="mx-auto max-w-3xl space-y-10 px-4 pt-10 md:px-6">
          <div className="flex justify-end">
            <div className="h-11 w-2/5 animate-pulse rounded-[22px] bg-bubble" />
          </div>
          <div className="space-y-3">
            <div className="h-3.5 w-full animate-pulse rounded-md bg-hover" />
            <div className="h-3.5 w-11/12 animate-pulse rounded-md bg-hover" />
            <div className="h-3.5 w-4/5 animate-pulse rounded-md bg-hover" />
            <div className="h-3.5 w-2/3 animate-pulse rounded-md bg-hover" />
          </div>
          <div className="flex justify-end">
            <div className="h-11 w-1/3 animate-pulse rounded-[22px] bg-bubble" />
          </div>
          <div className="space-y-3">
            <div className="h-3.5 w-full animate-pulse rounded-md bg-hover" />
            <div className="h-3.5 w-3/4 animate-pulse rounded-md bg-hover" />
          </div>
        </div>
      </div>
    </div>
  );
}
