"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { signOut } from "@/lib/auth-client";

export type LogoutButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label?: string;
  /** Where to go afterwards (default "/"). */
  redirectTo?: string;
  fullWidth?: boolean;
  className?: string;
};

/** Signs out (Better Auth), clears client caches and re-renders the server tree without a viewer. */
export function useLogOut(redirectTo = "/"): { logOut: () => Promise<void>; pending: boolean } {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  const logOut = async () => {
    if (pending) return;
    setPending(true);
    const { error } = await signOut();
    if (error) {
      setPending(false);
      toast.error("Couldn't log out", { description: error.message || "Please try again." });
      return;
    }
    queryClient.clear();
    router.replace(redirectTo);
    router.refresh();
    toast.warning("You're logged out", { description: "See you on the wire." });
  };

  return { logOut, pending };
}

export function LogoutButton({ variant = "outline", size = "md", label = "Log out", redirectTo = "/", fullWidth, className }: LogoutButtonProps) {
  const { logOut, pending } = useLogOut(redirectTo);

  return (
    <Button
      variant={variant}
      size={size}
      onClick={logOut}
      loading={pending}
      leftIcon={<LogOut aria-hidden />}
      fullWidth={fullWidth}
      className={className}
    >
      {label}
    </Button>
  );
}
