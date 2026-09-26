interface Row {
  label: string;
  value: string;
  muted?: boolean;
}

interface Props {
  rows: Row[];
  disclaimer?: string;
}

export function CostSummary({ rows, disclaimer }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {disclaimer && (
        <p className="text-sm text-muted-foreground">{disclaimer}</p>
      )}
      <div>
        <div className="flex items-center justify-between border-b pb-2 text-xs uppercase tracking-wide text-muted-foreground">
          <span>Product</span>
          <span>Cost</span>
        </div>
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between py-2.5 text-sm"
          >
            <span className={row.muted ? "text-muted-foreground" : ""}>
              {row.label}
            </span>
            <span className={row.muted ? "text-muted-foreground" : ""}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
