import { z } from "zod";

type RawShape = Record<string, z.ZodTypeAny>;

/**
 * Rewrites input field descriptions for a preset's voice.
 *
 * Canonical descriptions name Calypso tools, resources and local-install
 * details. A branded surface replaces just those sentences; types, optionality
 * and constraints are untouched because `describe` returns the same schema
 * with new metadata.
 */
export class InputDescriptions {
  constructor(private readonly overrides: Readonly<Record<string, string>>) {}

  apply<Shape>(inputSchema: Shape): Shape {
    if (!isRawShape(inputSchema)) return inputSchema;
    const adapted: RawShape = {};
    for (const [key, schema] of Object.entries(inputSchema)) {
      adapted[key] = this.describeField(key, schema);
    }
    return adapted as Shape;
  }

  private describeField(key: string, schema: z.ZodTypeAny): z.ZodTypeAny {
    const own = this.overrides[key];
    const described = own ? schema.describe(own) : schema;
    const nested = this.nestedOverrides(key);
    if (Object.keys(nested).length === 0) return described;
    return InputDescriptions.describeItems(described, nested);
  }

  private nestedOverrides(key: string): Record<string, string> {
    const prefix = `${key}.`;
    return Object.fromEntries(
      Object.entries(this.overrides)
        .filter(([name]) => name.startsWith(prefix))
        .map(([name, text]) => [name.slice(prefix.length), text]),
    );
  }

  private static describeItems(
    schema: z.ZodTypeAny,
    overrides: Record<string, string>,
  ): z.ZodTypeAny {
    if (!(schema instanceof z.ZodArray)) return schema;
    const element = schema.element;
    if (!(element instanceof z.ZodObject)) return schema;
    const shape: RawShape = { ...element.shape };
    for (const [field, text] of Object.entries(overrides)) {
      if (shape[field]) shape[field] = shape[field].describe(text);
    }
    return new z.ZodArray({ ...schema._def, type: element.extend(shape) });
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
