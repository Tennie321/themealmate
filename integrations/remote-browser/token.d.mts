export declare function createBrowserToken(sessionCookie: string, secret: string, now?: number): string;
export declare function verifyBrowserToken(token: string, secret: string, now?: number): { sid: string } | null;
