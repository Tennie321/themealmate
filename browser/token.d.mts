export declare function validSecret(secret: unknown): secret is string;
export declare function issueTicket(secret: string, now?: number): string;
export declare function verifyTicket(secret: string, token: unknown, now?: number): {aud: string; sub: string; exp: number; jti: string} | null;
