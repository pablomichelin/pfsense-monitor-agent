export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  auth?: {
    sessionId: string;
    userId: string;
    email: string;
    role: string;
    csrfTokenHash: string;
  };
}
