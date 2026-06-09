import { Asset } from "./Asset";
import { User } from "./User";

export class AssetLocationLog {
  id!: number;

  assetId!: number;

  asset!: Asset;

  oldLocation!: string;

  newLocation!: string;

  operatorId!: number;

  operator!: User;

  remark!: string;

  createdAt!: Date;
}
