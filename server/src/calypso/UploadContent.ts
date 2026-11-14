export const DEFAULT_MIME_TYPE = "application/octet-stream";

/** A file as a caller hands it over: its bytes inline, as base64. */
export type UploadContentSource = {
  filename?: string;
  mimeType?: string;
  contentBase64?: string;
};

export type UploadContent = {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
};

/** Accepts a `data:…;base64,` URI where plain base64 was expected. */
export function stripDataUriPrefix(value: string): string {
  const marker = ";base64,";
  const markerIndex = value.indexOf(marker);
  return markerIndex === -1 ? value : value.slice(markerIndex + marker.length);
}

/**
 * Decodes the bytes a caller sent inline.
 *
 * Inline bytes are the only content this server takes from a caller itself (a
 * public link is fetched by Calypso, not here). It deliberately has no way to
 * name a path: on a hosted server that would read the server's own disk.
 */
export function decodeUploadContent(input: UploadContentSource): UploadContent {
  const encoded = String(input.contentBase64 ?? "").trim();
  if (!encoded) {
    throw new Error("Provide the file's bytes as `contentBase64`.");
  }
  const filename = (input.filename || "").trim();
  if (!filename) {
    throw new Error("A filename is required.");
  }

  const bytes = Buffer.from(stripDataUriPrefix(encoded), "base64");
  if (bytes.byteLength === 0) {
    throw new Error("The provided `contentBase64` value could not be decoded.");
  }
  return {
    bytes,
    filename,
    mimeType: (input.mimeType || "").trim() || DEFAULT_MIME_TYPE,
  };
}
