import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      image?: string;
      role: string;
      orgId: string | null;
      isSubscriber: boolean;
      onboardingCompleted: boolean;
      emailVerified: boolean;
    };
  }

  interface User {
    role?: string;
    orgId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    role: string;
    orgId: string | null;
    isSubscriber: boolean;
    onboardingCompleted: boolean;
    emailVerified: boolean;
  }
}
