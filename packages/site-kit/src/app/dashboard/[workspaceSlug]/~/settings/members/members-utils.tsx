import { Badge } from "@repo/react-ui/components/ui/badge";
import { Crown, Shield, Users } from "lucide-react";

export interface MemberData {
  id: string;
  role: string;
  createdAt: Date;
  userId: string;
  userName: string;
  userEmail: string;
  userImage: string | null;
}

export interface InvitationData {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function getRoleBadge(role: string) {
  switch (role) {
    case "owner":
      return (
        <Badge className="bg-amber-500 hover:bg-amber-600">
          <Crown className="h-3 w-3 mr-1" />
          Owner
        </Badge>
      );
    case "admin":
      return (
        <Badge className="bg-blue-500 hover:bg-blue-600">
          <Shield className="h-3 w-3 mr-1" />
          Admin
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          <Users className="h-3 w-3 mr-1" />
          Member
        </Badge>
      );
  }
}
