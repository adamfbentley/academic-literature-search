export default function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative w-16 h-16">
        <div className="absolute top-0 left-0 w-full h-full border-4 border-slate-200 dark:border-slate-700 rounded-full"></div>
        <div className="absolute top-0 left-0 w-full h-full border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
      <p className="mt-4 text-slate-600 dark:text-slate-400">Searching papers...</p>
    </div>
  );
}
