interface AmazonMonitorDesktopBridge {
  exportFile(request: {
    content: string;
    suggestedName: string;
  }): Promise<{ cancelled: boolean }>;
  key: {
    clear(): Promise<void>;
    has(): Promise<boolean>;
    set(apiKey: string): Promise<void>;
  };
  processStatus(): Promise<Record<"api" | "agent" | "crawler", string>>;
  updateStatus(): Promise<{ enabled: boolean; state: string }>;
}

interface Window {
  amazonMonitorDesktop?: AmazonMonitorDesktopBridge;
}
