"use client";

import type { Payment } from "@repo/database/schema";
import { Badge } from "@repo/react-ui/components/ui/badge";
import { Button } from "@repo/react-ui/components/ui/button";
import { Input } from "@repo/react-ui/components/ui/input";
import { useState } from "react";

interface PaymentTableProps {
  payments: Payment[];
}

export function PaymentTable({ payments: initialPayments }: PaymentTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [payments] = useState(initialPayments);

  const filteredPayments = payments.filter(
    (payment) =>
      payment.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      payment.payment?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input
          placeholder="Search payments..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="h-12 px-4 text-left align-middle font-medium">
                Email
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Amount
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Type
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Currency
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Date
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredPayments.map((payment) => (
              <tr
                key={payment.id}
                className="border-b transition-colors hover:bg-muted/50"
              >
                <td className="p-4 align-middle">{payment.email}</td>
                <td className="p-4 align-middle">{payment.amount}</td>
                <td className="p-4 align-middle">
                  <Badge variant="outline">{payment.type}</Badge>
                </td>
                <td className="p-4 align-middle">{payment.currency}</td>
                <td className="p-4 align-middle">{payment.payment_date}</td>
                <td className="p-4 align-middle">
                  <Badge variant="default">Completed</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredPayments.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No payments found
          </div>
        )}
      </div>
    </div>
  );
}
