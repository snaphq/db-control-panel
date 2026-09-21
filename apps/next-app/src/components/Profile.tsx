"use client";
import { clearAnalyticsCache } from "@/components/analytics/use-analytics";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut, useSession } from "@repo/auth/client";
import { CreditCard, LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

export function Profile() {
  const { data: session } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const handleSignOut = async () => {
    try {
      clearAnalyticsCache();
      const result = await signOut();

      // Check if signOut had an error
      if (result?.error) {
        console.error("Sign out error:", result.error);
        // Still attempt to redirect even if there's an error
      }

      // Wait a moment to ensure session is fully cleared
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Redirect to home page
      router.push("/");
      router.refresh();
    } catch (error) {
      console.error("Error during sign out:", error);
      // Still redirect even if there's an error
      router.push("/");
      router.refresh();
    }
  };

  if (!mounted) {
    return (
      <Avatar>
        <AvatarImage src={session?.user?.image || ""} alt="User Profile" />
        <AvatarFallback>
          {session?.user?.name?.[0]?.toUpperCase() || "U"}
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild className="w-9 h-9">
        <Avatar>
          <AvatarImage src={session?.user?.image || ""} alt="User Profile" />
          <AvatarFallback>
            {session?.user?.name?.[0]?.toUpperCase() || "U"}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <Link href="/auth/user-profile">
            <DropdownMenuItem>
              <User className="mr-2 w-4 h-4" />
              <span>Profile</span>
              <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
            </DropdownMenuItem>
          </Link>
          <DropdownMenuItem>
            <Settings className="mr-2 w-4 h-4" />
            <span>Settings</span>
            <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 w-4 h-4" />
          <span>Log out</span>
          <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
