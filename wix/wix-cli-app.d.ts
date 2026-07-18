export interface WixAppConfig {
  appId?: string;
  name: string;
  description: string;
  managedType: "self";
  extensions: Array<{
    type: string;
    entry: string;
  }>;
}
