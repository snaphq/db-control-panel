import { PaymentTable } from "@/components/admin/PaymentTable";
import { db } from "@repo/database";
import { payments } from "@repo/database/schema";

async function getPayments() {
  try {
    const paymentRecords = await db()
      .select()
      .from(payments)
      .orderBy(payments.created_time);
    return paymentRecords;
  } catch (error) {
    console.error("Error fetching payments:", error);
    return [];
  }
}

export default async function PaymentsPage() {
  const payments = await getPayments();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">
          Payment Management
        </h1>
        <p className="text-muted-foreground">
          View payment history and transactions
        </p>
      </div>
      <PaymentTable payments={payments} />
    </div>
  );
}
