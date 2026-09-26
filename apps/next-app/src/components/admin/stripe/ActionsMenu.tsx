"use client";

import { getErrorMessage } from "@repo/core/error-utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/ui/alert-dialog";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import {
  Archive,
  Copy,
  Edit,
  ExternalLink,
  Eye,
  MoreVertical,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

interface ActionsMenuProps {
  itemType: "product" | "price" | "coupon" | "promo-code";
  itemId: string;
  itemName?: string;
  viewUrl?: string;
  editUrl?: string;
  stripeUrl?: string;
  redirectAfterDelete?: string;
  isActive?: boolean;
  onDelete?: () => void;
  productId?: string;
  defaultPriceId?: string;
}

export function ActionsMenu({
  itemType,
  itemId,
  itemName,
  viewUrl,
  editUrl,
  stripeUrl,
  redirectAfterDelete,
  isActive = true,
  onDelete,
  productId,
  defaultPriceId,
}: ActionsMenuProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<"archive" | "delete" | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const isPriceDefault =
    itemType === "price" &&
    defaultPriceId !== undefined &&
    defaultPriceId === itemId;

  const handleCopyId = () => {
    navigator.clipboard.writeText(itemId);
    toast.success("ID copied to clipboard!");
  };

  const refreshAfterAction = async (shouldRedirect?: boolean) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (shouldRedirect && redirectAfterDelete) {
      router.push(redirectAfterDelete);
      router.refresh();
    } else {
      router.refresh();
    }
  };

  const closeDialog = () => {
    setShowDialog(false);
    setDialogMode(null);
  };

  const handleSetDefaultPrice = async () => {
    if (!productId) return;
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/admin/stripe/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultPriceId: itemId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to set default price");
      }

      toast.success("Default price updated");
      await refreshAfterAction();
    } catch (error: unknown) {
      console.error("Set default price error:", error);
      toast.error(getErrorMessage(error, "Failed to set default price"));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleProductArchiveToggle = async () => {
    const endpoint = isActive ? "archive" : "unarchive";
    const response = await fetch(
      `/api/admin/stripe/products/${itemId}/${endpoint}`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.error ||
          `Failed to ${isActive ? "archive" : "unarchive"} product`,
      );
    }

    toast.success(
      `Product ${isActive ? "archived" : "unarchived"} successfully!`,
    );
  };

  const handleProductDelete = async () => {
    const response = await fetch(
      `/api/admin/stripe/products/${itemId}/delete`,
      { method: "POST" },
    );
    const result = await response.json();

    if (!response.ok && result.status !== "in_use") {
      throw new Error(result.error || "Failed to delete product");
    }

    if (result.status === "deleted") {
      toast.success("Product deleted successfully!");
      await refreshAfterAction(true);
      onDelete?.();
      return;
    }

    if (result.status === "in_use") {
      toast.info("Product is in use. Archiving instead.");
      await handleProductArchiveToggle();
      await refreshAfterAction();
      onDelete?.();
      return;
    }

    throw new Error("Unexpected response from delete operation.");
  };

  const handleOtherArchiveToggle = async () => {
    try {
      if (itemType === "price") {
        const response = await fetch(`/api/admin/stripe/prices/${itemId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !isActive }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(
            error.error ||
              `Failed to ${isActive ? "archive" : "unarchive"} price`,
          );
        }

        toast.success(
          `Price ${isActive ? "archived" : "unarchived"} successfully!`,
        );
      } else if (itemType === "promo-code") {
        const response = await fetch(
          `/api/admin/stripe/promo-codes/${itemId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: !isActive }),
          },
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(
            error.error ||
              `Failed to ${isActive ? "deactivate" : "activate"} promo code`,
          );
        }

        toast.success(
          `Promo code ${isActive ? "deactivated" : "activated"} successfully!`,
        );
      } else {
        const endpoint = `/api/admin/stripe/${itemType}s/${itemId}`;
        const response = await fetch(endpoint, {
          method: "DELETE",
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || `Failed to delete ${itemType}`);
        }

        toast.success(
          `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} deleted successfully!`,
        );
      }

      if (onDelete) {
        onDelete();
      }

      await refreshAfterAction(itemType === "coupon");
    } catch (error: unknown) {
      console.error("Archive/Delete error:", error);
      toast.error(
        getErrorMessage(error) ||
          `Failed to ${(itemType === "product" || itemType === "price") && isActive ? "archive" : itemType === "coupon" ? "delete" : "unarchive"} ${itemType}`,
      );
    }
  };

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      if (itemType === "product") {
        if (dialogMode === "delete") {
          await handleProductDelete();
        } else {
          await handleProductArchiveToggle();
          await refreshAfterAction();
          onDelete?.();
        }
      } else if (itemType === "price") {
        await handleOtherArchiveToggle();
      } else {
        await handleOtherArchiveToggle();
      }
      closeDialog();
    } catch (error: unknown) {
      console.error("Action error:", error);
      toast.error(getErrorMessage(error, "Failed to perform action"));
    } finally {
      setIsDeleting(false);
    }
  };

  const getDialogCopy = () => {
    if (itemType === "product") {
      if (dialogMode === "delete") {
        return {
          title: "Delete Product?",
          description:
            "This permanently deletes the product in Stripe. If Stripe reports that the product is already in use, it will be archived instead.",
          actionLabel: "Delete",
          isDestructive: true,
        };
      }
      return {
        title: isActive ? "Archive Product?" : "Unarchive Product?",
        description: isActive
          ? "Archived products cannot be used for new purchases, but existing subscriptions remain unaffected."
          : "Unarchiving makes the product available for new purchases again.",
        actionLabel: isActive ? "Archive" : "Unarchive",
        isDestructive: isActive,
      };
    }

    switch (itemType) {
      case "price":
        return {
          title: isActive ? "Archive Price?" : "Unarchive Price?",
          description: isActive
            ? "This will archive the price in Stripe. It will no longer be available for new purchases, but existing subscriptions using this price will continue."
            : "This will unarchive the price in Stripe. It will be available for new purchases again.",
          actionLabel: isActive ? "Archive" : "Unarchive",
          isDestructive: isActive,
        };
      case "promo-code":
        return {
          title: isActive ? "Deactivate Promo Code?" : "Activate Promo Code?",
          description: isActive
            ? "This will deactivate the promo code. Customers will no longer be able to use it."
            : "This will activate the promo code. Customers will be able to use it again.",
          actionLabel: isActive ? "Deactivate" : "Activate",
          isDestructive: isActive,
        };
      case "coupon":
        return {
          title: "Delete Coupon?",
          description:
            "This will permanently delete the coupon. It cannot be used for new purchases, but existing uses will remain valid.",
          actionLabel: "Delete",
          isDestructive: true,
        };
      default:
        return {
          title: "Delete Item?",
          description: "This action cannot be undone.",
          actionLabel: "Delete",
          isDestructive: true,
        };
    }
  };

  const { title, description, actionLabel, isDestructive } = getDialogCopy();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreVertical className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {viewUrl && (
            <DropdownMenuItem asChild>
              <Link href={viewUrl} className="flex items-center cursor-pointer">
                {itemType === "price" ? (
                  <Edit className="mr-2 h-4 w-4" />
                ) : (
                  <Eye className="mr-2 h-4 w-4" />
                )}
                {itemType === "price" ? "Edit Price" : "View Details"}
              </Link>
            </DropdownMenuItem>
          )}

          {editUrl && (
            <DropdownMenuItem asChild>
              <Link href={editUrl} className="flex items-center cursor-pointer">
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onClick={handleCopyId} className="cursor-pointer">
            <Copy className="mr-2 h-4 w-4" />
            Copy ID
          </DropdownMenuItem>

          {itemType === "price" && productId && (
            <DropdownMenuItem
              disabled={isPriceDefault || isDeleting}
              onClick={() => {
                if (!isPriceDefault) {
                  void handleSetDefaultPrice();
                }
              }}
              className="cursor-pointer"
            >
              <Star className="mr-2 h-4 w-4" />
              {isPriceDefault ? "Default price" : "Set as default price"}
            </DropdownMenuItem>
          )}

          {stripeUrl && (
            <DropdownMenuItem asChild>
              <Link
                href={stripeUrl}
                target="_blank"
                className="flex items-center cursor-pointer"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View in Stripe
              </Link>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {itemType === "product" ? (
            <>
              <DropdownMenuItem
                onClick={() => {
                  setDialogMode("archive");
                  setShowDialog(true);
                }}
                className={
                  isActive
                    ? "text-destructive focus:text-destructive cursor-pointer"
                    : "cursor-pointer"
                }
              >
                <Archive className="mr-2 h-4 w-4" />
                {isActive ? "Archive" : "Unarchive"}
              </DropdownMenuItem>
            </>
          ) : itemType === "price" ? (
            <>
              <DropdownMenuItem
                onClick={() => {
                  setDialogMode("archive");
                  setShowDialog(true);
                }}
                className={
                  isActive
                    ? "text-destructive focus:text-destructive cursor-pointer"
                    : "cursor-pointer"
                }
              >
                <Archive className="mr-2 h-4 w-4" />
                {isActive ? "Archive" : "Unarchive"}
              </DropdownMenuItem>
            </>
          ) : itemType === "promo-code" ? (
            <DropdownMenuItem
              onClick={() => {
                setDialogMode("archive");
                setShowDialog(true);
              }}
              className={
                isActive
                  ? "text-destructive focus:text-destructive cursor-pointer"
                  : "cursor-pointer"
              }
            >
              <Archive className="mr-2 h-4 w-4" />
              {isActive ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => {
                setDialogMode("delete");
                setShowDialog(true);
              }}
              className="text-destructive focus:text-destructive cursor-pointer"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={showDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowDialog(false);
            setDialogMode(null);
          } else {
            setShowDialog(true);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>
              {itemName && (
                <span className="font-semibold block mb-2">{itemName}</span>
              )}
              {description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeleting}
              onClick={() => {
                if (isDeleting) return;
                closeDialog();
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={isDeleting}
              className={
                isDestructive
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }
            >
              {isDeleting ? `${actionLabel}ing...` : actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
