import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { connectDb } from "@/lib/db";
import {
  getGoogleClientId,
  getGoogleClientSecret,
  isGoogleAuthConfigured,
} from "@/lib/google-auth";
import {
  defaultCapabilitiesFor,
  normalizeRoleKey,
  pickRoleCapabilities,
  resolveCapabilities,
  type Role,
  type RoleCapabilityFlags,
} from "@/lib/roles";
import type { JWT } from "next-auth/jwt";
import { User } from "@/models/User";
import { ensureDefaultRoles, getRoleCapabilities } from "@/lib/app-roles";

declare module "next-auth" {
  interface User {
    role?: Role;
    callsign?: string | null;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: Role;
      callsign?: string;
    } & RoleCapabilityFlags;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    callsign?: string;
    canAccessAdmin?: boolean;
    canManageContent?: boolean;
    canManagePages?: boolean;
    canManageSite?: boolean;
    canManageUsers?: boolean;
    canManageRoles?: boolean;
  }
}

function applyCapabilitiesToToken(token: JWT, caps: RoleCapabilityFlags) {
  token.canAccessAdmin = caps.canAccessAdmin;
  token.canManageContent = caps.canManageContent;
  token.canManagePages = caps.canManagePages;
  token.canManageSite = caps.canManageSite;
  token.canManageUsers = caps.canManageUsers;
  token.canManageRoles = caps.canManageRoles;
}

const googleClientId = getGoogleClientId();
const googleClientSecret = getGoogleClientSecret();

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .toLowerCase()
          .trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        await connectDb();
        await ensureDefaultRoles();
        const user = await User.findOne({ email });
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;
        const role = normalizeRoleKey(user.role);
        if (user.role !== role) {
          user.role = role;
          await user.save();
        }
        return {
          id: String(user._id),
          email: user.email,
          name: user.name,
          image: user.image,
          role,
          callsign: user.callsign?.trim() ?? "",
        };
      },
    }),
    ...(isGoogleAuthConfigured() && googleClientId && googleClientSecret
      ? [
          Google({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      if (!user.email) return false;

      await connectDb();
      await ensureDefaultRoles();
      const email = user.email.toLowerCase().trim();
      const existing = await User.findOne({ email });
      if (existing) {
        // Same email = same account (credentials + Google share one user).
        if (user.name && existing.name !== user.name) {
          existing.name = user.name;
        }
        if (user.image && existing.image !== user.image) {
          existing.image = user.image;
        }
        const role = normalizeRoleKey(existing.role);
        if (existing.role !== role) {
          existing.role = role;
        }
        await existing.save();
        user.id = String(existing._id);
        user.role = role;
        return true;
      }

      const created = await User.create({
        email,
        name: user.name || email,
        image: user.image ?? null,
        role: "reader",
        passwordHash: null,
      });
      user.id = String(created._id);
      user.role = "reader";
      return true;
    },
    async jwt({ token, user, account, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = normalizeRoleKey(user.role as string | undefined);
        if (user.email) token.email = String(user.email).toLowerCase();
        if (typeof user.callsign === "string") {
          token.callsign = user.callsign.trim();
        }
      }

      const email = token.email ? String(token.email).toLowerCase() : null;

      // Always reload role/callsign from Mongo so admin role changes apply on
      // the next request without requiring sign-out.
      if (email) {
        await connectDb();
        await ensureDefaultRoles();
        const dbUser = await User.findOne({ email }).select("role callsign");
        if (dbUser) {
          token.id = String(dbUser._id);
          token.role = normalizeRoleKey(dbUser.role);
          token.callsign = dbUser.callsign?.trim() ?? "";
        } else if (token.callsign === undefined) {
          token.callsign = "";
        }
      } else if (token.role) {
        token.role = normalizeRoleKey(token.role as string);
      }

      // Keep explicit session.update() refresh for other profile fields later.
      void account;
      void trigger;

      try {
        applyCapabilitiesToToken(
          token,
          await getRoleCapabilities(token.role as string | undefined),
        );
      } catch {
        applyCapabilitiesToToken(
          token,
          defaultCapabilitiesFor(token.role as string | undefined),
        );
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? "");
        session.user.role = normalizeRoleKey(token.role as string | undefined);
        session.user.callsign = token.callsign?.trim() ?? "";
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
});
