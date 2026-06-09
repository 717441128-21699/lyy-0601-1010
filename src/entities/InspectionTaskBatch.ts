import { User } from "./User";
import { InspectionTask } from "./InspectionTask";

export class InspectionTaskBatch {
  id!: number;

  batchNo!: string;

  title!: string;

  description!: string;

  creatorId!: number;

  creator!: User;

  assetCodes!: string[];

  inspectorId!: number;

  inspector!: User;

  deadline!: Date;

  cycle!: string;

  taskCount!: number;

  createdAt!: Date;
}
