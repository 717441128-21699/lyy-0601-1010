import { ExceptionReport } from "./ExceptionReport";
import { User } from "./User";

export type FlowAction = "create" | "assign" | "transfer" | "process" | "resolve" | "close" | "reopen";

export class ProcessFlow {
  id!: number;

  exceptionReportId!: number;

  exceptionReport!: ExceptionReport;

  operatorId!: number;

  operator!: User;

  fromUserId!: number;

  fromUser!: User;

  toUserId!: number;

  toUser!: User;

  action!: FlowAction;

  remark!: string;

  previousStatus!: string;

  newStatus!: string;

  createdAt!: Date;
}
