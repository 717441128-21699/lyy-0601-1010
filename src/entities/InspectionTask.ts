import { Asset } from "./Asset";
import { User } from "./User";
import { ExceptionReport } from "./ExceptionReport";
import { InspectionTaskBatch } from "./InspectionTaskBatch";

export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled" | "overdue";
export type TaskCycle = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "once";

export class InspectionTask {
  id!: number;

  taskNo!: string;

  title!: string;

  description!: string;

  assetId!: number;

  asset!: Asset;

  inspectorId!: number;

  inspector!: User;

  deadline!: Date;

  cycle!: TaskCycle;

  status!: TaskStatus;

  startAt!: Date;

  completedAt!: Date;

  inspectionResult!: string;

  hasException!: boolean;

  exceptionReports!: ExceptionReport[];

  parentTaskId!: number;

  batchId!: number;

  batch!: InspectionTaskBatch;

  createdAt!: Date;

  updatedAt!: Date;
}
