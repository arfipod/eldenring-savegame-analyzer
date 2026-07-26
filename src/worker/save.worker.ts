/// <reference lib="webworker" />

import type { WorkerParseRequest, WorkerParseResponse } from '../types';
import { parseEldenRingSave } from '../lib/save-parser';

const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<WorkerParseRequest>) => {
  const request = event.data;
  if (!request || request.type !== 'parse') return;

  try {
    const save = parseEldenRingSave(
      request.buffer,
      {
        name: request.fileName,
        size: request.fileSize,
        lastModified: request.lastModified,
      },
      (stage, fraction) => {
        const response: WorkerParseResponse = { type: 'progress', stage, fraction };
        workerScope.postMessage(response);
      },
      request.language,
    );
    const response: WorkerParseResponse = { type: 'success', save };
    workerScope.postMessage(response);
  } catch (error) {
    const typed = error as Error & { offset?: number };
    const response: WorkerParseResponse = {
      type: 'error',
      message: typed instanceof Error ? typed.message : String(error),
      offset: typed.offset,
      stack: import.meta.env.DEV && typed instanceof Error ? typed.stack : undefined,
    };
    workerScope.postMessage(response);
  }
};

export {};
