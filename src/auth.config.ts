import type { NextAuthConfig } from "next-auth";
import {
  defaultCapabilitiesFor,
  normalizeRoleKey,
  pickRoleCapabilities,
  resolveCapabilities,
} from "@/lib/roles";

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/admin/login",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = normalizeRoleKey(user.role as string | undefined);
      } else if (token.role) {
        token.role = normalizeRoleKey(token.role as string);
      }
      const caps = defaultCapabilitiesFor(token.role as string | undefined);
      token.canAccessAdmin =
        typeof token.canAccessAdmin === "boolean"
          ? token.canAccessAdmin
          : caps.canAccessAdmin;
      token.canManageContent =
        typeof token.canManageContent === "boolean"
          ? token.canManageContent
          : caps.canManageContent;
      token.canManagePages =
        typeof token.canManagePages === "boolean"
          ? token.canManagePages
          : caps.canManagePages;
      token.canManageSite =
        typeof token.canManageSite === "boolean"
          ? token.canManageSite
          : caps.canManageSite;
      token.canManageUsers =
        typeof token.canManageUsers === "boolean"
          ? token.canManageUsers
          : caps.canManageUsers;
      token.canManageRoles =
        typeof token.canManageRoles === "boolean"
          ? token.canManageRoles
          : caps.canManageRoles;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? "");
        session.user.role = normalizeRoleKey(token.role as string | undefined);
        const caps = resolveCapabilities({
          role: session.user.role,
          ...pickRoleCapabilities(token),
        });
        session.user.canAccessAdmin = caps.canAccessAdmin;
        session.user.canManageContent = caps.canManageContent;
        session.user.canManagePages = caps.canManagePages;
        session.user.canManageSite = caps.canManageSite;
        session.user.canManageUsers = caps.canManageUsers;
        session.user.canManageRoles = caps.canManageRoles;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
