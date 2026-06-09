import * as fs from "fs";
import * as path from "path";

export type WhereCondition<T> = {
  [P in keyof T]?: T[P] | T[P][] | { like: string } | { between: [Date, Date] };
};

export interface FindOptions<T> {
  where?: WhereCondition<T> | ((item: T) => boolean);
  relations?: string[];
  order?: { [P in keyof T]?: "ASC" | "DESC" };
  skip?: number;
  take?: number;
  select?: (keyof T)[];
}

export class JsonRepository<T extends { id: number }> {
  private filePath: string;
  private data: T[] = [];
  private nextId: number = 1;

  constructor(private fileName: string, private dbDir: string = "./database") {
    this.filePath = path.join(this.dbDir, `${fileName}.json`);
    this.ensureFileExists();
    this.load();
  }

  private ensureFileExists() {
    if (!fs.existsSync(this.dbDir)) {
      fs.mkdirSync(this.dbDir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify({ data: [], nextId: 1 }, null, 2));
    }
  }

  private load() {
    try {
      const content = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(content);
      this.data = parsed.data || [];
      this.nextId = parsed.nextId || 1;
    } catch (err) {
      this.data = [];
      this.nextId = 1;
    }
  }

  private persist() {
    const content = JSON.stringify({ data: this.data, nextId: this.nextId }, null, 2);
    fs.writeFileSync(this.filePath, content, "utf8");
  }

  create(entityData: Partial<T>): T {
    const entity = {
      ...entityData,
      id: this.nextId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as T;
    return entity;
  }

  async save(entity: T): Promise<T> {
    const existingIndex = this.data.findIndex((item) => item.id === entity.id);

    if (existingIndex >= 0) {
      (entity as any).updatedAt = new Date();
      this.data[existingIndex] = entity;
    } else {
      if (!entity.id) {
        entity.id = this.nextId++;
      } else if (entity.id >= this.nextId) {
        this.nextId = entity.id + 1;
      }
      (entity as any).createdAt = (entity as any).createdAt || new Date();
      (entity as any).updatedAt = new Date();
      this.data.push(entity);
    }

    this.persist();
    return entity;
  }

  async saveMany(entities: T[]): Promise<T[]> {
    const results: T[] = [];
    for (const entity of entities) {
      results.push(await this.save(entity));
    }
    return results;
  }

  merge(existingEntity: T, newData: Partial<T>): T {
    return { ...existingEntity, ...newData, updatedAt: new Date() } as T;
  }

  async findOne(options: FindOptions<T>): Promise<T | undefined> {
    let result = this.filterData(options.where);

    if (options.order) {
      result = this.sortData(result, options.order);
    }

    return result[0];
  }

  async find(options: FindOptions<T> = {}): Promise<T[]> {
    let result = this.filterData(options.where);

    if (options.order) {
      result = this.sortData(result, options.order);
    }

    if (options.skip !== undefined) {
      result = result.slice(options.skip);
    }

    if (options.take !== undefined) {
      result = result.slice(0, options.take);
    }

    return result;
  }

  async findAndCount(options: FindOptions<T> = {}): Promise<[T[], number]> {
    let result = this.filterData(options.where);

    if (options.order) {
      result = this.sortData(result, options.order);
    }

    const total = result.length;

    if (options.skip !== undefined) {
      result = result.slice(options.skip);
    }

    if (options.take !== undefined) {
      result = result.slice(0, options.take);
    }

    return [result, total];
  }

  async count(options?: FindOptions<T>): Promise<number> {
    const result = this.filterData(options?.where);
    return result.length;
  }

  async remove(entity: T): Promise<T> {
    const index = this.data.findIndex((item) => item.id === entity.id);
    if (index >= 0) {
      this.data.splice(index, 1);
      this.persist();
    }
    return entity;
  }

  async update(criteria: { id: number }, partialEntity: Partial<T>): Promise<void> {
    const index = this.data.findIndex((item) => item.id === criteria.id);
    if (index >= 0) {
      this.data[index] = { ...this.data[index], ...partialEntity, updatedAt: new Date() } as T;
      this.persist();
    }
  }

  private filterData(where?: WhereCondition<T> | ((item: T) => boolean)): T[] {
    if (!where) {
      return [...this.data];
    }

    if (typeof where === "function") {
      return this.data.filter(where);
    }

    return this.data.filter((item) => {
      for (const [key, value] of Object.entries(where)) {
        if (value === undefined) continue;

        if (Array.isArray(value)) {
          const inValue = value as any[];
          if (!inValue.includes((item as any)[key])) {
            return false;
          }
        } else if (typeof value === "object" && value !== null) {
          const operator = Object.keys(value)[0];
          const operand = (value as any)[operator];

          switch (operator) {
            case "like":
              const pattern = (operand as string).replace(/%/g, ".*");
              if (!new RegExp(pattern, "i").test((item as any)[key])) {
                return false;
              }
              break;
            case "between":
              const [min, max] = operand as [Date, Date];
              const itemValue = new Date((item as any)[key]);
              if (itemValue < min || itemValue > max) {
                return false;
              }
              break;
            default:
              if ((item as any)[key] !== operand) {
                return false;
              }
          }
        } else {
          if ((item as any)[key] !== value) {
            return false;
          }
        }
      }
      return true;
    });
  }

  private sortData(data: T[], order: { [P in keyof T]?: "ASC" | "DESC" }): T[] {
    const entries = Object.entries(order) as [keyof T, "ASC" | "DESC"][];
    return [...data].sort((a, b) => {
      for (const [key, direction] of entries) {
        const aVal = a[key];
        const bVal = b[key];

        if (aVal === undefined && bVal === undefined) continue;
        if (aVal === undefined || aVal === null) return direction === "ASC" ? -1 : 1;
        if (bVal === undefined || bVal === null) return direction === "ASC" ? 1 : -1;

        if (aVal < bVal) return direction === "ASC" ? -1 : 1;
        if (aVal > bVal) return direction === "ASC" ? 1 : -1;
      }
      return 0;
    });
  }

  clear() {
    this.data = [];
    this.nextId = 1;
    this.persist();
  }

  getAll(): T[] {
    return [...this.data];
  }

  setData(data: T[]) {
    this.data = data;
    this.nextId = data.length > 0 ? Math.max(...data.map((d) => d.id)) + 1 : 1;
    this.persist();
  }
}

export function Like(pattern: string) {
  return { like: pattern };
}

export function In<T>(values: T[]) {
  return values;
}

export function Between(min: Date, max: Date) {
  return { between: [min, max] };
}

export class AppDatabase {
  private static instance: AppDatabase;
  private repositories: Map<string, JsonRepository<any>> = new Map();

  private constructor() {}

  static getInstance(): AppDatabase {
    if (!AppDatabase.instance) {
      AppDatabase.instance = new AppDatabase();
    }
    return AppDatabase.instance;
  }

  getRepository<T extends { id: number }>(entityName: string): JsonRepository<T> {
    if (!this.repositories.has(entityName)) {
      this.repositories.set(entityName, new JsonRepository<T>(entityName.toLowerCase()));
    }
    return this.repositories.get(entityName)!;
  }

  async initialize(): Promise<void> {
    console.log("JSON 数据库初始化成功");
  }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    return operation();
  }
}

export const AppDataSource = AppDatabase.getInstance();
