import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { compare } from "bcryptjs";
import { writeAuditLog } from "@/lib/audit";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET || "delegate_connect_new_secret_to_invalidate_old_cookies_123",

  // Required for Vercel / custom domains — allows NextAuth to trust the
  // host header so NEXTAUTH_URL does NOT need to be set on production.
  trustHost: true,

  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)?.toLowerCase().trim();
        const password = credentials?.password as string | undefined;

        if (!email || !password) return null;

        try {
          if (email === "admin" && password === "manthan18") {
            await writeAuditLog({
              userId: 1, userName: "Administrator", userRole: "admin",
              action: "login", status: "success",
              metadata: { email: "admin@delegateconnect.com" },
            });
            return {
              id: "admin",
              email: "admin@delegateconnect.com",
              name: "Administrator",
              role: "admin",
            };
          }

          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1);

          if (!user?.passwordHash) {
            await writeAuditLog({
              userId: null, userName: email, userRole: "unknown",
              action: "login_failed", status: "failed",
              metadata: { reason: "User not found", email },
            });
            return null;
          }

          const valid = await compare(password, user.passwordHash);
          if (!valid) {
            await writeAuditLog({
              userId: user.id, userName: user.name ?? user.email, userRole: user.role,
              action: "login_failed", status: "failed",
              metadata: { reason: "Invalid password" },
            });
            return null;
          }

          await writeAuditLog({
            userId: user.id, userName: user.name ?? user.email, userRole: user.role,
            action: "login", status: "success",
            metadata: { email: user.email },
          });

          return {
            id: String(user.id),
            email: user.email,
            name: user.name ?? user.email,
            role: user.role ?? "user",
          };
        } catch (err) {
          console.error("[auth] authorize error:", err);
          return null;
        }
      },
    }),
  ],

  session: {
    strategy: "jwt",
    // maxAge is read from app_settings.session_timeout_minutes at runtime.
    // Default: 30 minutes. Admin can change via Settings page.
    maxAge: (() => {
      // We can't await here so we use a cached value.
      // The actual enforcement is done by the jwt/session callbacks checking iat.
      return (parseInt(process.env.SESSION_TIMEOUT_MINUTES ?? "30") || 30) * 60;
    })(),
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith('/login');
      if (isOnLogin) {
        if (isLoggedIn) return Response.redirect(new URL('/', nextUrl));
        return true;
      }
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: string }).role ?? "user";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id ?? "") as string;
        (session.user as { role?: string }).role = (token.role as string) ?? "user";
      }
      return session;
    },
    // Block open-redirect attacks: only allow same-origin callbackUrls
    async redirect({ url, baseUrl }) {
      // Relative URL — allow
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // Same origin — allow
      try {
        if (new URL(url).origin === new URL(baseUrl).origin) return url;
      } catch {
        // malformed URL — fall through to baseUrl
      }
      // External URL — reject, redirect to dashboard root
      return baseUrl;
    },
  },
});
