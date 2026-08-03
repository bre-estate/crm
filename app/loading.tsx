import { Card } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-8 w-64 bg-slate-200 rounded" />
        <div className="h-4 w-96 bg-slate-200 rounded mt-2" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="px-4">
            <div className="h-3 w-24 bg-slate-200 rounded" />
            <div className="h-8 w-32 bg-slate-200 rounded mt-2" />
            <div className="h-3 w-40 bg-slate-200 rounded mt-2" />
          </Card>
        ))}
      </div>
      <Card className="px-4">
        <div className="h-4 w-40 bg-slate-200 rounded" />
        <div className="h-3 w-full bg-slate-200 rounded mt-2" />
        <div className="h-3 w-2/3 bg-slate-200 rounded mt-1" />
      </Card>
    </div>
  );
}
