import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { cache } from "react";
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
    /** Epoch ms when role/callsign were last loaded from Mongo. */
    roleSyncedAt?: number;
    canAccessAdmin?: boolean;
    canManageContent?: boolean;
    canManagePages?: boolean;
    canManageSite?: boolean;
    canManageUsers?: boolean;
    canManageRoles?: boolean;
  }
}

/** How often to refresh role/callsign from Mongo (admin role changes). */
const ROLE_SYNC_TTL_MS = 5 * 60 * 1000;

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

const nextAuth = NextAuth({
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
        user.callsign = existing.callsign?.trim() ?? "";
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
      user.callsign = "";
      return true;
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = normalizeRoleKey(user.role as string | undefined);
        if (user.email) token.email = String(user.email).toLowerCase();
        if (typeof user.callsign === "string") {
          token.callsign = user.callsign.trim();
        } else if (token.callsign === undefined) {
          token.callsign = "";
        }
        token.roleSyncedAt = Date.now();
      }

      const email = token.email ? String(token.email).toLowerCase() : null;
      const syncedAt =
        typeof token.roleSyncedAt === "number" ? token.roleSyncedAt : 0;
      // Skip Mongo on the sign-in jwt pass (user payload already applied).
      // Refresh on session.update() or when the TTL expires.
      const shouldSyncRole =
        Boolean(email) &&
        !user &&
        (trigger === "update" || Date.now() - syncedAt > ROLE_SYNC_TTL_MS);

      let roleChanged = Boolean(user);
      // Refresh role/callsign from Mongo on a TTL so admin role changes apply
      // without a Mongo round-trip on every request.
      if (email && shouldSyncRole) {
        await connectDb();
        const dbUser = await User.findOne({ email }).select("role callsign");
        if (dbUser) {
          const nextRole = normalizeRoleKey(dbUser.role);
          roleChanged = nextRole !== token.role;
          token.id = String(dbUser._id);
          token.role = nextRole;
          token.callsign = dbUser.callsign?.trim() ?? "";
        } else if (token.callsign === undefined) {
          token.callsign = "";
        }
        token.roleSyncedAt = Date.now();
      } else if (token.role) {
        token.role = normalizeRoleKey(token.role as string);
      }

      // Capabilities are already on the JWT; only refresh when role may change.
      const capsMissing = typeof token.canAccessAdmin !== "boolean";
      if (roleChanged || capsMissing || trigger === "update") {
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

const { handlers, signIn, signOut } = nextAuth;

/** Deduplicate auth() within a single RSC request (layout + page). */
const auth = cache(nextAuth.auth);

export { handlers, auth, signIn, signOut };
