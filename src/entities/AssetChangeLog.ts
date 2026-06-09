import { Asset } from "./Asset";
import { User } from "./User";

export class AssetChangeLog {
  id!: number;

  assetId!: number;

  asset!: Asset;

  operatorId!: number;

  operator!: User;

  fieldName!: string;

  oldValue!: string;

  newValue!: string;

  remark!: string;

  createdAt!: Date;
}
