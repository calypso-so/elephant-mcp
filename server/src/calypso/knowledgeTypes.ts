/**
 * Shapes of the Calypso knowledge API's answers.
 *
 * Every type is open (`[key: string]: unknown`) because the API adds fields
 * over time. None of these is ever handed to a client as it is: each tool
 * answers with a view (`src/views`) that names the fields it returns.
 */

export type KnowledgeTaskObject = {
  id: string;
  type?: string;
  status?: string;
  [key: string]: unknown;
};

export type KnowledgeFileObject = {
  id: string;
  object?: string;
  status?: string;
  title?: string;
  filename?: string;
  content_type?: string;
  size_bytes?: number;
  sha256?: string;
  task?: KnowledgeTaskObject;
  source?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  request_id?: string;
  [key: string]: unknown;
};

/** A file as an upload leaves it, with the indexing task when there is one. */
export type KnowledgeUploadResult = {
  file: KnowledgeFileObject;
  task?: KnowledgeTaskObject | null;
};

export type KnowledgeBatchItemObject = {
  client_file_id?: string;
  clientFileId?: string;
  status?: string;
  file?: KnowledgeFileObject;
  knowledgeId?: string;
  taskId?: string;
  canonicalStatus?: string;
  bucketSyncStatus?: string;
  bucketSync?: Record<string, unknown>;
  error?: Record<string, unknown>;
  [key: string]: unknown;
};

export type KnowledgeBatchObject = {
  id: string;
  object?: "knowledge_batch";
  status?: string;
  message?: string;
  total?: number;
  accepted?: number;
  rejected?: number;
  queued?: number;
  indexing?: number;
  active?: number;
  partialFailedCount?: number;
  failed?: number;
  items?: KnowledgeBatchItemObject[];
  request_id?: string;
  [key: string]: unknown;
};
