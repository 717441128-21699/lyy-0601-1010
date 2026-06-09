import { ExceptionReport, ExceptionStatus } from "./ExceptionReport";
import { User } from "./User";

export type OperationType =
  | "create"
  | "assign"
  | "reassign"
  | "start_process"
  | "resolve"
  | "close"
  | "reopen"
  | "update";

export class ExceptionOperationLog {
  id!: number;

  exceptionId!: number;

  exception!: ExceptionReport;

  operatorId!: number;

  operator!: User;

  operationType!: OperationType;

  oldStatus!: ExceptionStatus;

  newStatus!: ExceptionStatus;

  oldHandlerId!: number | null;

  newHandlerId!: number | null;

  remark!: string;

  createdAt!: Date;
}
