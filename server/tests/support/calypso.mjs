/**
 * The Calypso API operations under test, each built fresh for the config a
 * test passes, so every test reaches the real client classes with its own
 * stubbed fetch.
 */
import { CalypsoApi } from "../../dist/calypso/CalypsoApi.js";

const api = (config) => new CalypsoApi(config, "elephant-test/0");

export const listKnowledgeBuckets = (config, options) =>
  api(config).buckets.list(options);
export const createKnowledgeBucket = (config, input) =>
  api(config).buckets.create(input);
export const getKnowledgeFile = (config, fileId, options) =>
  api(config).files.get(fileId, options);
export const uploadKnowledgeFile = (config, params) =>
  api(config).files.upload(params);
export const importKnowledgeFileFromUrl = (config, params) =>
  api(config).files.importFromUrl(params);
export const waitForKnowledgeFileIndexed = (config, fileId, taskId) =>
  api(config).files.waitUntilIndexed(fileId, taskId);
export const uploadKnowledgeFilesBatch = (config, params) =>
  api(config).batches.upload(params);
export const waitForKnowledgeBatchReady = (config, batchId) =>
  api(config).batches.waitUntilReady(batchId);
export const addKnowledgeWebsite = (config, input) =>
  api(config).websites.add(input);
