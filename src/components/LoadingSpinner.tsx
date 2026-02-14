export default function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      {/* Animated dots */}
      <div className="flex items-center gap-2 mb-6">
        <div className="w-3 h-3 rounded-full bg-primary-500 animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-3 h-3 rounded-full bg-accent-500 animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-3 h-3 rounded-full bg-neon-blue animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>

      {/* Skeleton cards */}
      <div className="w-full max-w-4xl space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="glass rounded-2xl p-6 shadow-glass shimmer"
            style={{ opacity: 1 - (i - 1) * 0.25 }}
          >
            <div className="h-5 w-3/4 bg-slate-700/60 rounded-lg mb-3" />
            <div className="h-3 w-1/3 bg-slate-700/60 rounded-lg mb-4" />
            <div className="flex gap-2 mb-4">
              <div className="h-6 w-16 bg-slate-700/60 rounded-lg" />
              <div className="h-6 w-20 bg-slate-700/60 rounded-lg" />
              <div className="h-6 w-14 bg-slate-700/60 rounded-lg" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full bg-slate-700/60 rounded-lg" />
              <div className="h-3 w-5/6 bg-slate-700/60 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-sm text-slate-500">Searching across databases…</p>
    </div>
  );
}
