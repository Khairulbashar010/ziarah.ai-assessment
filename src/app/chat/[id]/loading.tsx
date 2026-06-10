export default function ChatLoading() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      <div className="h-14 shrink-0 animate-pulse border-b border-gray-100 bg-gray-50" />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-[38%] min-w-[300px] max-w-[480px] border-r border-gray-100 bg-gray-50" />
        <div className="flex flex-1 items-center justify-center bg-gray-50 text-sm text-gray-400">
          Loading trip workspace...
        </div>
      </div>
    </div>
  );
}
