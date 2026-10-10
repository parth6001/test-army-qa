export function startSessionFixture(): Promise<{
  baseUrl: string;
  expire(): void;
  close(): Promise<void>;
}>;
