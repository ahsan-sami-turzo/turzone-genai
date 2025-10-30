
export enum Status {
  Idle = 'Idle',
  Pending = 'Pending',
  Success = 'Success',
  Error = 'Error',
}

export interface PipelineStep {
  name: string;
  status: Status;
  error?: string;
}

export interface RequestLog {
  timestamp: number;
  prompt: string;
}
