export type UserRole = "admin" | "inspector" | "maintenance" | "admin_staff" | "user";

export class User {
  id!: number;
  username!: string;
  password!: string;
  name!: string;
  role!: UserRole;
  department!: string;
  phone!: string;
  email!: string;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}
