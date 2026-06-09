import { Asset } from "./Asset";
import { User } from "./User";
import { InspectionTask } from "./InspectionTask";
import { ProcessFlow } from "./ProcessFlow";

export type ExceptionType = "damage" | "lost" | "malfunction" | "expired" | "missing" | "other";
export type ExceptionStatus = "pending" | "assigned" | "processing" | "resolved" | "closed";
export type HandlerType = "maintenance" | "admin_staff" | "other";
export type TimeoutStatus = "normal" | "warning" | "overdue";

export class ExceptionReport {
  id!: number;

  reportNo!: string;

  assetId!: number;

  asset!: Asset;

  taskId!: number;

  task!: InspectionTask;

  reporterId!: number;

  reporter!: User;

  handlerId!: number;

  handler!: User;

  exceptionType!: ExceptionType;

  status!: ExceptionStatus;

  handlerType!: HandlerType;

  description!: string;

  photos!: string[];

  location!: string;

  latitude!: number;

  longitude!: number;

  handledAt!: Date;

  handleResult!: string;

  repairCost!: number;

  processFlows!: ProcessFlow[];

  closeRemark!: string;

  expectedDeadline!: Date;

  createdAt!: Date;

  updatedAt!: Date;
}
