import { toErrorMessage } from "./error-message";

export async function runErrorHandledTask(setError: (message: string) => void, task: () => Promise<void>) {
  try {
    await task();
  } catch (error) {
    setError(toErrorMessage(error));
  }
}
