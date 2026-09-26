import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { MessageSquare, Plus } from "lucide-react";

export default function SupportCasesPage() {
  return (
    <div className="flex flex-col gap-6 px-4 pt-5 pb-20 max-w-[800px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Support cases</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track conversations with our support team.
          </p>
        </div>
        <Button disabled title="Coming soon" size="sm">
          <Plus className="mr-1 h-3.5 w-3.5" />
          New case
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>No cases yet</CardTitle>
          <CardDescription>
            When you open a support case it will show up here. Replying to
            existing cases from staff will also be available soon.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-12 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8" />
            <p className="text-sm">
              Support case creation and replies are coming soon.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
