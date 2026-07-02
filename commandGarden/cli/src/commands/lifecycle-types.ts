export type LifecycleStatus = 'already-running' | 'started' | 'failed' | 'unresponsive' | 'locked';

export type LifecycleStartResult = {
  status: LifecycleStatus;
  message: string;
  pid?: number;
};
