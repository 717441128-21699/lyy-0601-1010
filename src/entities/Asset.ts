import { AssetLocationLog } from "./AssetLocationLog";
import { InspectionTask } from "./InspectionTask";
import { ExceptionReport } from "./ExceptionReport";

export type AssetStatus = "normal" | "abnormal" | "damaged" | "lost" | "maintenance" | "scrapped";
export type AssetCategory = "electronic" | "furniture" | "vehicle" | "equipment" | "office" | "other";

export class Asset {
  id!: number;

  assetCode!: string;

  name!: string;

  category!: AssetCategory;

  brand!: string;

  model!: string;

  serialNumber!: string;

  purchaseDate!: Date;

  purchasePrice!: number;

  department!: string;

  location!: string;

  custodian!: string;

  status!: AssetStatus;

  description!: string;

  lastInspectionDate!: Date;

  healthScore!: number;

  locationLogs!: AssetLocationLog[];

  inspectionTasks!: InspectionTask[];

  exceptionReports!: ExceptionReport[];

  createdAt!: Date;

  updatedAt!: Date;
}
