"use client";

import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PaymentMethodsCard } from "./PaymentMethodsCard";

export interface BillingDetailsInitial {
  invoiceEmail: string | null;
  companyName: string | null;
  billingCountry: string | null;
  billingAddress: string | null;
  invoiceLanguage: string;
  invoicePurchaseOrder: string | null;
  taxIdType: string | null;
  taxIdValue: string | null;
}

interface BillingDetailsFormProps {
  workspaceSlug: string;
  organizationId: string;
  organizationName: string;
  initial: BillingDetailsInitial;
  canManageBilling: boolean;
}

const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "IE", name: "Ireland" },
  { code: "AU", name: "Australia" },
  { code: "IN", name: "India" },
  { code: "JP", name: "Japan" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "SG", name: "Singapore" },
];

const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "ja", label: "Japanese" },
];

const TAX_ID_TYPES: Array<{
  code: string;
  label: string;
  placeholder: string;
}> = [
  { code: "us_ein", label: "United States EIN", placeholder: "12-3456789" },
  { code: "eu_vat", label: "EU VAT", placeholder: "DE123456789" },
  { code: "gb_vat", label: "United Kingdom VAT", placeholder: "GB123456789" },
  {
    code: "ca_gst_hst",
    label: "Canada GST/HST",
    placeholder: "123456789RT0001",
  },
  { code: "au_abn", label: "Australia ABN", placeholder: "12345678912" },
  { code: "in_gst", label: "India GST", placeholder: "27AAAAA0000A1Z5" },
];

type BillingPatch = Partial<{
  invoiceEmail: string;
  companyName: string;
  billingCountry: string;
  billingAddress: string;
  invoiceLanguage: string;
  invoicePurchaseOrder: string;
  taxIdType: string;
  taxIdValue: string;
}>;

export function BillingDetailsForm({
  workspaceSlug,
  organizationId,
  organizationName,
  initial,
  canManageBilling,
}: BillingDetailsFormProps) {
  // Per-section state
  const [invoiceEmail, setInvoiceEmail] = useState(initial.invoiceEmail ?? "");
  const [savedInvoiceEmail, setSavedInvoiceEmail] = useState(
    initial.invoiceEmail ?? "",
  );
  const [savingInvoiceEmail, setSavingInvoiceEmail] = useState(false);

  const [companyName, setCompanyName] = useState(initial.companyName ?? "");
  const [savedCompanyName, setSavedCompanyName] = useState(
    initial.companyName ?? "",
  );
  const [savingCompanyName, setSavingCompanyName] = useState(false);

  const [billingCountry, setBillingCountry] = useState(
    initial.billingCountry ?? "",
  );
  const [billingAddress, setBillingAddress] = useState(
    initial.billingAddress ?? "",
  );
  const [savedBillingCountry, setSavedBillingCountry] = useState(
    initial.billingCountry ?? "",
  );
  const [savedBillingAddress, setSavedBillingAddress] = useState(
    initial.billingAddress ?? "",
  );
  const [savingAddress, setSavingAddress] = useState(false);

  const [invoiceLanguage, setInvoiceLanguage] = useState(
    initial.invoiceLanguage || "en",
  );
  const [savedInvoiceLanguage, setSavedInvoiceLanguage] = useState(
    initial.invoiceLanguage || "en",
  );
  const [savingInvoiceLanguage, setSavingInvoiceLanguage] = useState(false);

  const [invoicePO, setInvoicePO] = useState(
    initial.invoicePurchaseOrder ?? "",
  );
  const [savedInvoicePO, setSavedInvoicePO] = useState(
    initial.invoicePurchaseOrder ?? "",
  );
  const [savingInvoicePO, setSavingInvoicePO] = useState(false);

  const [taxIdType, setTaxIdType] = useState(initial.taxIdType ?? "us_ein");
  const [taxIdValue, setTaxIdValue] = useState(initial.taxIdValue ?? "");
  const [savedTaxIdType, setSavedTaxIdType] = useState(
    initial.taxIdType ?? "us_ein",
  );
  const [savedTaxIdValue, setSavedTaxIdValue] = useState(
    initial.taxIdValue ?? "",
  );
  const [savingTaxId, setSavingTaxId] = useState(false);

  async function saveBilling(patch: BillingPatch): Promise<void> {
    const res = await fetch(`/api/organizations/${workspaceSlug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billingDetails: patch }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error ?? "Failed to save");
    }
    if (payload?.stripeSyncWarning) {
      toast.warning(payload.stripeSyncWarning);
    }
  }

  const invoiceEmailDirty = invoiceEmail.trim() !== savedInvoiceEmail;
  const invoiceEmailValid =
    invoiceEmail.length === 0 || /.+@.+\..+/.test(invoiceEmail.trim());

  const companyNameDirty = companyName.trim() !== savedCompanyName;

  const addressDirty =
    billingCountry !== savedBillingCountry ||
    billingAddress.trim() !== savedBillingAddress;

  const invoiceLanguageDirty = invoiceLanguage !== savedInvoiceLanguage;

  const invoicePODirty = invoicePO.trim() !== savedInvoicePO;

  const taxIdDirty =
    taxIdType !== savedTaxIdType || taxIdValue.trim() !== savedTaxIdValue;

  const taxIdPlaceholder =
    TAX_ID_TYPES.find((t) => t.code === taxIdType)?.placeholder ?? "";

  const countryLabel = COUNTRIES.find(
    (c) => c.code === savedBillingCountry,
  )?.name;

  return (
    <div className="flex flex-col gap-6">
      {/* Invoice Email Recipient */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice Email Recipient</CardTitle>
          <CardDescription>
            By default, all your invoices will be sent to the email address of
            the creator of your team. If you want to use a custom email address
            specifically for receiving invoices, enter it here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            type="email"
            value={invoiceEmail}
            maxLength={254}
            onChange={(e) => setInvoiceEmail(e.target.value)}
            disabled={!canManageBilling}
            className="max-w-md"
            placeholder="billing@example.com"
          />
        </CardContent>
        <CardFooter className="flex justify-between border-t bg-muted/30 py-3">
          <p className="text-sm text-muted-foreground">
            Please use 254 characters at maximum.
          </p>
          <Button
            size="sm"
            disabled={
              !canManageBilling ||
              !invoiceEmailDirty ||
              !invoiceEmailValid ||
              savingInvoiceEmail
            }
            onClick={async () => {
              setSavingInvoiceEmail(true);
              try {
                const next = invoiceEmail.trim();
                await saveBilling({ invoiceEmail: next });
                setSavedInvoiceEmail(next);
                toast.success("Invoice email updated");
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Update failed",
                );
              } finally {
                setSavingInvoiceEmail(false);
              }
            }}
          >
            {savingInvoiceEmail && (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            )}
            Save
          </Button>
        </CardFooter>
      </Card>

      {/* Company Name */}
      <Card>
        <CardHeader>
          <CardTitle>Company Name</CardTitle>
          <CardDescription>
            By default, your team name is shown on your invoice. If you want to
            show a custom name instead, please enter it here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={companyName}
            maxLength={64}
            onChange={(e) => setCompanyName(e.target.value)}
            disabled={!canManageBilling}
            className="max-w-md"
            placeholder={organizationName}
          />
        </CardContent>
        <CardFooter className="flex justify-between border-t bg-muted/30 py-3">
          <p className="text-sm text-muted-foreground">
            Please use 64 characters at maximum.
          </p>
          <Button
            size="sm"
            disabled={
              !canManageBilling || !companyNameDirty || savingCompanyName
            }
            onClick={async () => {
              setSavingCompanyName(true);
              try {
                const next = companyName.trim();
                await saveBilling({ companyName: next });
                setSavedCompanyName(next);
                toast.success("Company name updated");
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Update failed",
                );
              } finally {
                setSavingCompanyName(false);
              }
            }}
          >
            {savingCompanyName && (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            )}
            Save
          </Button>
        </CardFooter>
      </Card>

      {/* Billing Address */}
      <Card>
        <CardHeader>
          <CardTitle>Billing Address</CardTitle>
          {savedBillingAddress || savedBillingCountry ? (
            <CardDescription>
              <span className="block text-muted-foreground">
                Current Address:
              </span>
              <span className="block whitespace-pre-line text-foreground">
                {savedBillingAddress}
                {savedBillingAddress && countryLabel ? "\n" : ""}
                {countryLabel ?? ""}
              </span>
            </CardDescription>
          ) : (
            <CardDescription>No address set.</CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="billing-country">Country</Label>
            <Select
              value={billingCountry}
              onValueChange={setBillingCountry}
              disabled={!canManageBilling}
            >
              <SelectTrigger id="billing-country" className="max-w-md">
                <SelectValue placeholder="Select a country" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="billing-address">Billing Address</Label>
            <Textarea
              id="billing-address"
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
              disabled={!canManageBilling}
              rows={3}
              maxLength={1000}
              placeholder="Street, city, postal code"
              className="max-w-md"
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end border-t bg-muted/30 py-3">
          <Button
            size="sm"
            disabled={!canManageBilling || !addressDirty || savingAddress}
            onClick={async () => {
              setSavingAddress(true);
              try {
                const nextAddress = billingAddress.trim();
                await saveBilling({
                  billingCountry,
                  billingAddress: nextAddress,
                });
                setSavedBillingCountry(billingCountry);
                setSavedBillingAddress(nextAddress);
                toast.success("Billing address updated");
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Update failed",
                );
              } finally {
                setSavingAddress(false);
              }
            }}
          >
            {savingAddress && (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            )}
            Save
          </Button>
        </CardFooter>
      </Card>

      {/* Invoice Language */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice Language</CardTitle>
          <CardDescription>
            If your billing department is using a different language, enter it
            here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={invoiceLanguage}
            onValueChange={setInvoiceLanguage}
            disabled={!canManageBilling}
          >
            <SelectTrigger className="max-w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
        <CardFooter className="flex justify-between border-t bg-muted/30 py-3">
          <p className="text-sm text-muted-foreground">
            This field determines the language of your invoice.
          </p>
          <Button
            size="sm"
            disabled={
              !canManageBilling ||
              !invoiceLanguageDirty ||
              savingInvoiceLanguage
            }
            onClick={async () => {
              setSavingInvoiceLanguage(true);
              try {
                await saveBilling({ invoiceLanguage });
                setSavedInvoiceLanguage(invoiceLanguage);
                toast.success("Invoice language updated");
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Update failed",
                );
              } finally {
                setSavingInvoiceLanguage(false);
              }
            }}
          >
            {savingInvoiceLanguage && (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            )}
            Save
          </Button>
        </CardFooter>
      </Card>

      {/* Invoice Purchase Order */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice Purchase Order</CardTitle>
          <CardDescription>
            By default, no purchase order line is shown on your team&apos;s
            billing invoices. If you want to show a purchase order line, please
            enter it here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={invoicePO}
            maxLength={64}
            onChange={(e) => setInvoicePO(e.target.value)}
            disabled={!canManageBilling}
            className="max-w-md"
          />
        </CardContent>
        <CardFooter className="flex justify-between border-t bg-muted/30 py-3">
          <p className="text-sm text-muted-foreground">
            Please use 64 characters at maximum.
          </p>
          <Button
            size="sm"
            disabled={!canManageBilling || !invoicePODirty || savingInvoicePO}
            onClick={async () => {
              setSavingInvoicePO(true);
              try {
                const next = invoicePO.trim();
                await saveBilling({ invoicePurchaseOrder: next });
                setSavedInvoicePO(next);
                toast.success("Invoice purchase order updated");
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Update failed",
                );
              } finally {
                setSavingInvoicePO(false);
              }
            }}
          >
            {savingInvoicePO && (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            )}
            Save
          </Button>
        </CardFooter>
      </Card>

      {/* Tax ID */}
      <Card>
        <CardHeader>
          <CardTitle>Tax ID</CardTitle>
          <CardDescription>
            If you would like your invoice to render a specific tax ID, enter it
            here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2 max-w-2xl">
            <Select
              value={taxIdType}
              onValueChange={setTaxIdType}
              disabled={!canManageBilling}
            >
              <SelectTrigger className="sm:max-w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAX_ID_TYPES.map((t) => (
                  <SelectItem key={t.code} value={t.code}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={taxIdValue}
              maxLength={64}
              onChange={(e) => setTaxIdValue(e.target.value)}
              disabled={!canManageBilling}
              placeholder={taxIdPlaceholder}
              className="flex-1"
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-between border-t bg-muted/30 py-3">
          <p className="text-sm text-muted-foreground">
            Countries that do not use Tax IDs are not listed.
          </p>
          <Button
            size="sm"
            disabled={!canManageBilling || !taxIdDirty || savingTaxId}
            onClick={async () => {
              setSavingTaxId(true);
              try {
                const next = taxIdValue.trim();
                await saveBilling({
                  taxIdType: next ? taxIdType : "",
                  taxIdValue: next,
                });
                setSavedTaxIdType(next ? taxIdType : "");
                setSavedTaxIdValue(next);
                toast.success("Tax ID updated");
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Update failed",
                );
              } finally {
                setSavingTaxId(false);
              }
            }}
          >
            {savingTaxId && (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            )}
            Save
          </Button>
        </CardFooter>
      </Card>

      {/* Payment Method */}
      <PaymentMethodsCard
        workspaceSlug={workspaceSlug}
        organizationId={organizationId}
        canManageBilling={canManageBilling}
      />
    </div>
  );
}
