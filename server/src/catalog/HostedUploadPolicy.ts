import { z } from "zod";

type RawShape = Record<string, z.ZodTypeAny>;

const LOCAL_PATH_FIELD = "filePath";

/**
 * Removes local-disk upload inputs from tool schemas when the server is hosted.
 *
 * On a hosted server `filePath` would read the *server's* filesystem, so it is
 * both meaningless to the caller and a data-exfiltration risk. Hiding it from
 * the schema keeps clients from offering it; `resolveUploadContent` enforces
 * the same rule at call time via `config.localFileAccess`.
 */
export class HostedUploadPolicy {
  constructor(private readonly localFileAccess: boolean) {}

  adapt<Shape>(inputSchema: Shape): Shape {
    if (this.localFileAccess || !isRawShape(inputSchema)) return inputSchema;

    const adapted: RawShape = {};
    for (const [key, value] of Object.entries(inputSchema)) {
      if (key === LOCAL_PATH_FIELD) continue;
      adapted[key] = HostedUploadPolicy.withoutLocalPathItems(value);
    }
    return adapted as Shape;
  }

  /** `items: z.array(z.object({ filePath, … }))` → same array without filePath. */
  private static withoutLocalPathItems(schema: z.ZodTypeAny): z.ZodTypeAny {
    if (!(schema instanceof z.ZodArray)) return schema;
    const element = schema.element;
    if (
      !(element instanceof z.ZodObject) ||
      !(LOCAL_PATH_FIELD in element.shape)
    ) {
      return schema;
    }
    return new z.ZodArray({
      ...schema._def,
      type: element.omit({ [LOCAL_PATH_FIELD]: true }),
    });
  }
}

function isRawShape(value: unknown): value is RawShape {
  return (
    typeof value === "object" &&
    value !== null &&
    !(value instanceof z.ZodType) &&
    Object.values(value).every((item) => item instanceof z.ZodType)
  );
}
