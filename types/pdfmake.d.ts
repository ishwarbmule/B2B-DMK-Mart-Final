// pdfmake ships no TypeScript types — minimal declarations for server-side use.
declare module "pdfmake" {
  const pdfmake: {
    addFonts(fonts: unknown): void;
    setFonts(fonts: unknown): void;
    clearFonts(): void;
    setUrlAccessPolicy(cb: (url: string) => boolean): void;
    setLocalAccessPolicy(cb: (path: string) => boolean): void;
    setUrlResourceCaching(enabled: boolean): void;
    clearUrlResourceCache(): void;
    setProgressCallback(cb: ((p: number) => void) | null): void;
    createPdf(docDefinition: unknown, options?: unknown): {
      getBuffer(): Promise<Buffer>;
      getStream(): Promise<NodeJS.ReadableStream>;
      write(filename: string): Promise<void>;
      open(): void;
      download(filename?: string): void;
    };
  };
  export default pdfmake;
}

declare module "pdfmake/fonts/Roboto" {
  const Roboto: Record<string, unknown>;
  export default Roboto;
}
