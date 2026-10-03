import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/react-ui/components/ui/card";

export interface SummaryItem {
  title: string;
  value: string | number;
  detail: string;
}

/** The counts at the top of a platform page. */
export function SummaryCards({ items }: { items: SummaryItem[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{item.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{item.value}</div>
            <p className="text-xs text-muted-foreground">{item.detail}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
