import { getToken } from "firebase/app-check";
import { appCheck, verifyBrowser } from "./firebaseClient";
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
async function chatRequest(body: unknown, signal?: AbortSignal) {
  let token: string | null;
  let cancel: (() => void) | undefined;
  try {
    signal?.throwIfAborted();
    const verification = (async () => {
      await verifyBrowser();
      return appCheck ? (await getToken(appCheck)).token : null;
    })();
    token = await Promise.race([
      verification,
      new Promise<never>((_, reject) => {
        cancel = () =>
          reject(new DOMException("Request stopped", "AbortError"));
        signal?.addEventListener("abort", cancel, { once: true });
      }),
    ]);
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      "Browser verification could not complete. Refresh this page in a regular browser and try again.",
    );
  } finally {
    if (cancel) signal?.removeEventListener("abort", cancel);
  }
  signal?.throwIfAborted();
  const response = await fetch(
    `https://us-central1-irobotxsite.cloudfunctions.net/demoChat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-Firebase-AppCheck": token } : {}),
      },
      body: JSON.stringify(body),
      signal,
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      data.error ||
        "The AI service could not complete this request. Please retry.",
    );
  }
  return response;
}
export async function streamChat(
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  signal: AbortSignal,
) {
  const response = await chatRequest({ messages }, signal);
  if (!response.body)
    throw new Error("Streaming is unavailable. Please retry.");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    done = false;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (!line.trim()) continue;
        const value = JSON.parse(line);
        if (value.error) throw new Error(value.error);
        if (value.delta) onDelta(value.delta);
        if (value.done) done = true;
      }
    }
    if (!done) throw new Error("The response was interrupted. Please retry.");
  } finally {
    reader.releaseLock();
  }
}
