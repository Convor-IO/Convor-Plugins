export interface WixSettings {
  slug: string;
}

export declare const getSettings: () => Promise<WixSettings | null>;
export declare const saveSettings: (input: WixSettings) => Promise<WixSettings>;
export declare const clearSettings: () => Promise<{ok: true}>;
