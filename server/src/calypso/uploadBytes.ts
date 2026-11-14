import { formatApiError, readResponseBody } from "./apiErrors.js";
import { DEFAULT_MIME_TYPE, type UploadContent } from "./UploadContent.js";

/**
 * Sends a file's bytes to the storage URL an upload session handed out.
 *
 * The URL is pre-signed storage, not the Calypso API, so it gets no bearer
 * header: the caller's key must never travel to another host.
 */
export async function putUploadBytes(
  uploadUrl: string,
  content: UploadContent,
): Promise<void> {
  const size = content.bytes.byteLength;
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": content.mimeType || DEFAULT_MIME_TYPE,
      "Content-Range": `bytes 0-${size - 1}/${size}`,
    },
    body: content.bytes as BodyInit,
  });

  if (!response.ok) {
    const body = await readResponseBody(response);
    throw new Error(formatApiError(response.status, body));
  }
}
